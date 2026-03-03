from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import asyncio
from io import BytesIO
from icalendar import Calendar, Event, vText
from datetime import datetime, timedelta, timezone, date
import re

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

PRIMUSS_BASE = "https://www3.primuss.de/stpl/index.php"
FH = "fhla"
LANGUAGE = "de"

# ── Models ──────────────────────────────────────────────────────

class FetchRequest(BaseModel):
    cookies: str          # "PHPSESSID=abc; _shibsession_xyz=def"
    session: str          # Session= value from URL
    user: str             # User= value from URL
    stgru: str            # e.g. "165"
    sem: str = "9"
    date_from: str        # "YYYY-MM-DD"  — first Monday of semester
    date_to: str          # "YYYY-MM-DD"  — last Friday of semester
    timezone: str = "1"


class IcsRequest(BaseModel):
    events: list[dict]


# ── Helpers ─────────────────────────────────────────────────────

def parse_cookies(cookie_string: str) -> dict:
    cookies = {}
    for part in cookie_string.split(";"):
        part = part.strip()
        if "=" in part:
            k, v = part.split("=", 1)
            cookies[k.strip()] = v.strip()
    return cookies


def week_mondays(date_from: str, date_to: str):
    """Yield the Monday of each week between date_from and date_to (inclusive)."""
    start = date.fromisoformat(date_from)
    end   = date.fromisoformat(date_to)
    # rewind to Monday of start week
    current = start - timedelta(days=start.weekday())
    while current <= end:
        yield current
        current += timedelta(weeks=1)


def primuss_date(d: date) -> str:
    """Format date as M/D/YYYY (Primuss showdate format)."""
    return f"{d.month}/{d.day}/{d.year}"


def dedupe_events(events: list[dict]) -> list[dict]:
    """Deduplicate events by a stable key (name + dtstart)."""
    seen = set()
    result = []
    for ev in events:
        key = (ev.get("summary", ""), ev.get("dtstart", ""))
        if key not in seen:
            seen.add(key)
            result.append(ev)
    return result


def normalize_event(raw: dict) -> dict | None:
    """
    Convert a raw Primuss event dict into our internal shape.
    Returns None if the event doesn't have enough data to be useful.

    Primuss field names observed in the wild (vary by server version):
      Name / name / LVName / Bezeichnung / Veranstaltung / title
      Dozent / dozent / DozentName / Lehrer
      Raum / raum / Room / room / Ort
      Art / art / Typ / typ
      datum / Datum / Date / StartDate
      Anfang / anfang / StartTime / Von / start / dtstart
      Ende / ende / EndTime / Bis / end / dtend
    """

    if not isinstance(raw, dict):
        return None   # skip nested lists / scalars that slip through extract_items

    def get(*keys):
        for k in keys:
            v = raw.get(k)
            if v is not None and str(v).strip():
                return str(v).strip()
        return ""

    summary = get("Name", "name", "LVName", "Bezeichnung", "Veranstaltung",
                  "title", "Subject", "subject", "lv_name")
    if not summary:
        return None

    date_str  = get("datum", "Datum", "Date", "StartDate", "date")
    time_from = get("Anfang", "anfang", "StartTime", "Von", "von", "start", "dtstart")
    time_to   = get("Ende", "ende", "EndTime", "Bis", "bis", "end", "dtend")

    # Try to build ISO datetimes
    def build_iso(d: str, t: str) -> str | None:
        if not d:
            return None
        d = d.strip()
        t = (t or "00:00").strip()
        # Normalise date: MM/DD/YYYY → YYYY-MM-DD
        if re.match(r"\d{1,2}/\d{1,2}/\d{4}", d):
            parts = d.split("/")
            d = f"{parts[2]}-{int(parts[0]):02d}-{int(parts[1]):02d}"
        # Normalise time: might be "8:00" → "08:00"
        if re.match(r"^\d:\d{2}$", t):
            t = "0" + t
        # Strip seconds if present
        if re.match(r"^\d{2}:\d{2}:\d{2}$", t):
            t = t[:5]
        return f"{d}T{t}:00"

    dtstart = (
        raw.get("dtstart")
        or raw.get("start")
        or build_iso(date_str, time_from)
    )
    dtend = (
        raw.get("dtend")
        or raw.get("end")
        or build_iso(date_str, time_to)
    )

    if not dtstart:
        return None

    return {
        "summary":     summary,
        "dtstart":     str(dtstart),
        "dtend":       str(dtend) if dtend else str(dtstart),
        "location":    get("Raum", "raum", "Room", "room", "Ort", "location"),
        "description": "\n".join(filter(None, [
            get("Dozent", "dozent", "DozentName", "Lehrer", "lecturer") and
                f"Dozent: {get('Dozent','dozent','DozentName','Lehrer','lecturer')}",
            get("Art", "art", "Typ", "typ", "type") and
                f"Art: {get('Art','art','Typ','typ','type')}",
        ])),
        "_raw": raw,   # keep original for the debug panel
    }


def extract_items(data) -> list | None:
    """
    Extract a flat list of items from any Primuss response shape, including
    nested lists like [[ev, ev], [ev]] or dicts wrapping a list.
    """
    if isinstance(data, list):
        flat = []
        for item in data:
            if isinstance(item, list):
                flat.extend(item)   # flatten one level: [[a,b],[c]] → [a,b,c]
            else:
                flat.append(item)
        return flat or None
    if isinstance(data, dict):
        for key in ("list", "data", "rows", "events", "items", "result",
                    "veranstaltungen", "termine", "stundenplan"):
            v = data.get(key)
            if isinstance(v, list):
                return extract_items(v)   # recurse to handle nested lists in values
    return None


# ── API Routes ───────────────────────────────────────────────────

@app.post("/api/fetch-all")
async def fetch_all(req: FetchRequest):
    """
    Iterate over every week in [date_from, date_to] and collect all events
    from Primuss for the given stgru (Studiengruppe).
    """
    cookies = parse_cookies(req.cookies)
    mondays = list(week_mondays(req.date_from, req.date_to))

    if not mondays:
        raise HTTPException(status_code=400, detail="Kein gültiger Datumsbereich.")
    if len(mondays) > 40:
        raise HTTPException(status_code=400, detail="Datumsbereich zu groß (max. 40 Wochen).")

    base_form = {
        "viewtype":  "week",
        "timezone":  req.timezone,
        "Session":   req.session,
        "User":      req.user,
        "mode":      "calendar",
        "stgru":     req.stgru,
    }

    async def fetch_week(client: httpx.AsyncClient, monday: date):
        form = {**base_form, "showdate": primuss_date(monday)}
        url  = f"{PRIMUSS_BASE}?FH={FH}&Language={LANGUAGE}&sem={req.sem}&method=list"
        try:
            r = await client.post(
                url,
                data=form,
                cookies=cookies,
                headers={
                    "User-Agent":      "Mozilla/5.0 (compatible; stundenplan-generator)",
                    "X-Requested-With":"XMLHttpRequest",
                    "Accept":          "application/json, text/javascript, */*; q=0.01",
                    "Origin":          "https://www3.primuss.de",
                    "Referer":         f"https://www3.primuss.de/stpl/index.php?FH={FH}&Language={LANGUAGE}&Session={req.session}&User={req.user}",
                    "Content-Type":    "application/x-www-form-urlencoded; charset=UTF-8",
                },
                timeout=15.0,
            )
        except httpx.TimeoutException:
            return None, monday

        if r.status_code in (301, 302):
            return "redirect", monday
        try:
            return r.json(), monday
        except Exception:
            return {"_raw_text": r.text[:1000], "_status": r.status_code}, monday

    all_events:  list[dict] = []
    first_raw    = None   # full first-week API response (for debug panel)
    first_items  = None   # raw items from first week before normalisation
    had_redirect = False

    # Fire requests with a small concurrency limit (be polite to the server)
    sem = asyncio.Semaphore(3)

    async def guarded_fetch(client, monday):
        async with sem:
            return await fetch_week(client, monday)

    async with httpx.AsyncClient(follow_redirects=False) as client:
        tasks   = [guarded_fetch(client, m) for m in mondays]
        results = await asyncio.gather(*tasks)

    for data, monday in results:
        if data is None:
            continue
        if data == "redirect":
            had_redirect = True
            continue
        if first_raw is None:
            first_raw = data

        items = extract_items(data)
        if items:
            if first_items is None:
                first_items = items[:3]   # first 3 raw items for the debug panel
            for raw_ev in items:
                ev = normalize_event(raw_ev)
                if ev:
                    all_events.append(ev)

    if had_redirect and not all_events:
        raise HTTPException(
            status_code=401,
            detail="Session abgelaufen oder ungültig. Bitte Cookies und Session neu kopieren.",
        )

    all_events = dedupe_events(all_events)

    return JSONResponse({
        "events":      all_events,
        "count":       len(all_events),
        "weeks":       len(mondays),
        "_first_raw":  first_raw,    # full first-week response (debug)
        "_first_items": first_items, # first 3 raw items before normalisation (debug)
    })


@app.post("/api/generate-ics")
async def generate_ics(req: IcsRequest):
    """Generate and return a .ics file from a list of events."""
    if not req.events:
        raise HTTPException(status_code=400, detail="Keine Events übergeben.")

    cal = Calendar()
    cal.add("prodid",       "-//Stundenplan Generator//fhla//DE")
    cal.add("version",      "2.0")
    cal.add("calscale",     "GREGORIAN")
    cal.add("method",       "PUBLISH")
    cal.add("x-wr-calname", "Stundenplan HS Landshut")
    cal.add("x-wr-timezone","Europe/Berlin")

    def parse_dt(s: str) -> datetime:
        s = s.replace("Z", "+00:00").strip()
        # Handle "YYYY-MM-DDTHH:MM:SS" without tz → assume CET (naive, ical-generator handles VTIMEZONE)
        try:
            return datetime.fromisoformat(s)
        except ValueError:
            return datetime.fromisoformat(s[:19])

    for ev in req.events:
        ie = Event()
        ie.add("summary",  ev.get("summary", "Veranstaltung"))
        ie.add("dtstart",  parse_dt(ev["dtstart"]))
        ie.add("dtend",    parse_dt(ev.get("dtend") or ev["dtstart"]))
        ie.add("dtstamp",  datetime.now(timezone.utc))

        if ev.get("location"):
            ie.add("location", vText(ev["location"]))
        if ev.get("description"):
            ie.add("description", vText(ev["description"]))

        uid_raw = f"{ev.get('dtstart','')}-{ev.get('summary','')}-{FH}"
        ie.add("uid", re.sub(r"\s+", "-", uid_raw) + "@stundenplan-gen")

        cal.add_component(ie)

    return StreamingResponse(
        BytesIO(cal.to_ical()),
        media_type="text/calendar",
        headers={"Content-Disposition": "attachment; filename=stundenplan.ics"},
    )


# Static frontend — must be last
app.mount("/", StaticFiles(directory="public", html=True), name="static")
