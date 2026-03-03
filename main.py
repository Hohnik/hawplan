"""
Stundenplan Generator — Backend
Exports HS Landshut Primuss timetables as .ics calendar files.

Sections:
  1. Config & constants
  2. HTML form parser
  3. Server-side session (auto-login, auto-refresh)
  4. Shibboleth auth (credentials + TOTP, fully automatic)
  5. Primuss helpers (semester, events, course groups)
  6. ICS generation
  7. FastAPI app & routes
"""

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from html.parser import HTMLParser
from urllib.parse import urljoin
from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone, date
from io import BytesIO
from icalendar import Calendar, Event as IcsEvent, vText
import httpx, asyncio, os, re, pyotp


# ═══════════════════════════════════════════════════════════════════
# 1. Config & constants
# ═══════════════════════════════════════════════════════════════════

load_dotenv()

_USERNAME    = os.getenv("USERNAME", "")
_PASSWORD    = os.getenv("PASSWORD", "")
_TOTP_SECRET = os.getenv("TOTP_SECRET", "")

PRIMUSS_URL = "https://www3.primuss.de/stpl/index.php"
FH          = "fhla"
LANG        = "de"
SEM         = "9"

_UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
       "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")
_HEADERS = {
    "User-Agent": _UA, "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


# ═══════════════════════════════════════════════════════════════════
# 2. HTML form parser
# ═══════════════════════════════════════════════════════════════════

class FormParser(HTMLParser):
    """Extract <form> elements with their fields from HTML."""

    def __init__(self):
        super().__init__()
        self.forms: list[dict] = []
        self._cur: dict | None = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "form":
            self._cur = {"action": a.get("action", ""), "fields": {}}
        elif self._cur is None:
            return
        elif tag == "input":
            name = a.get("name")
            if name and a.get("type", "text").lower() not in ("submit", "button", "image", "reset"):
                self._cur["fields"][name] = a.get("value", "")
        elif tag == "button":
            name = a.get("name")
            if name and a.get("type", "submit").lower() == "submit":
                self._cur["fields"][name] = a.get("value", "")

    def handle_endtag(self, tag):
        if tag == "form" and self._cur is not None:
            self.forms.append(self._cur)
            self._cur = None

    @classmethod
    def parse(cls, html: str) -> list[dict]:
        p = cls()
        p.feed(html)
        return p.forms


# ═══════════════════════════════════════════════════════════════════
# 3. Server-side session
# ═══════════════════════════════════════════════════════════════════

SESSION_TTL = timedelta(minutes=30)
_session: dict | None = None    # {cookies, session, user, course_tree, _ts}
_auth_lock = asyncio.Lock()


def _parse_cookies(raw: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for part in re.sub(r"[\r\n]+\s*", "", raw).strip().split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            out[k.strip()] = v.strip()
    return out


async def _ensure_session(force: bool = False) -> dict:
    """Return valid Primuss session, auto-authenticating if needed."""
    global _session
    if not force and _session and (datetime.now() - _session["_ts"]) < SESSION_TTL:
        return _session
    async with _auth_lock:
        # Double-check after acquiring lock
        if not force and _session and (datetime.now() - _session["_ts"]) < SESSION_TTL:
            return _session
        if not (_USERNAME and _PASSWORD and _TOTP_SECRET):
            raise HTTPException(500,
                ".env mit USERNAME, PASSWORD und TOTP_SECRET anlegen.")
        result = await _shibboleth_login(_USERNAME, _PASSWORD)
        _session = {**result, "_ts": datetime.now()}
        return _session


# ═══════════════════════════════════════════════════════════════════
# 4. Shibboleth auth
# ═══════════════════════════════════════════════════════════════════

_USER_FIELDS  = {"j_username", "username", "user", "uid", "login"}
_PASS_FIELDS  = {"j_password", "password", "pass", "passwd", "pw"}
_TOKEN_FIELDS = {
    "j_tokennumber", "tokennumber", "token", "otp", "totp", "mfa",
    "passcode", "code", "pin", "fudis_otp_input",
}
_BORING = {"csrf_token", "shib_idp_ls_supported", "execution",
           "samlrequest", "relaystate"}


def _find(fields: dict, keys: set) -> str | None:
    return next((k for k in fields if k.lower() in keys), None)

def _is_boring(k: str) -> bool:
    kl = k.lower()
    return kl in _BORING or kl.startswith("shib_idp_ls_") or kl.startswith("_eventid_")

def _is_login_form(f: dict) -> bool:
    return bool(_find(f, _USER_FIELDS) and _find(f, _PASS_FIELDS))

def _is_mfa_form(f: dict) -> bool:
    if _is_login_form(f):
        return False
    if _find(f, _TOKEN_FIELDS):
        return True
    if _find(f, _PASS_FIELDS) and not _find(f, _USER_FIELDS):
        return True
    return any(not _is_boring(k) for k in f)

def _guess_token(f: dict) -> str | None:
    return (_find(f, _TOKEN_FIELDS)
            or (_find(f, _PASS_FIELDS) if not _find(f, _USER_FIELDS) else None)
            or next((k for k in f if not _is_boring(k)), None))

def _only_proceed(fields: dict) -> dict:
    return {k: v for k, v in fields.items()
            if not k.lower().startswith("_eventid_") or k.lower() == "_eventid_proceed"}


async def _finish_saml(client: httpx.AsyncClient, r) -> dict:
    """Submit SAMLResponse → Primuss, extract session + course tree."""
    forms     = FormParser.parse(r.text)
    saml_form = next((f for f in forms if "SAMLResponse" in f["fields"]), None)
    if not saml_form:
        raise HTTPException(502, "SAML-Formular nicht gefunden.")

    acs = saml_form["action"]
    if not acs.startswith("http"):
        acs = urljoin(str(r.url), acs)

    final = await client.post(acs, data=saml_form["fields"],
                              headers={**_HEADERS, "Referer": str(r.url),
                                       "Content-Type": "application/x-www-form-urlencoded"})

    cookie_str = "; ".join(f"{k}={v}" for k, v in client.cookies.items())
    if not cookie_str:
        raise HTTPException(502, "Login OK, aber keine Cookies erhalten.")

    url  = str(final.url)
    sesn = (m.group(1) if (m := re.search(r"[?&]Session=([^&#]+)", url)) else "")
    user = (m.group(1) if (m := re.search(r"[?&]User=([^&#]+)",    url)) else "")

    return {"cookies": cookie_str, "session": sesn, "user": user,
            "course_tree": _parse_course_groups(final.text)["tree"]}


async def _shibboleth_login(username: str, password: str) -> dict:
    """Full Shibboleth walk: forms → credentials → TOTP → SAML."""
    async with httpx.AsyncClient(follow_redirects=True, timeout=30,
                                 headers=_HEADERS) as client:
        r = await client.get(
            f"https://www3.primuss.de/stpl/login_shibb.php?FH={FH}&Language={LANG}")

        for _ in range(8):
            forms = FormParser.parse(r.text)
            if not forms:
                raise HTTPException(502, f"Kein Formular auf {r.url}")

            fields = dict(forms[0]["fields"])
            action = forms[0]["action"]
            if not action.startswith("http"):
                action = urljoin(str(r.url), action)
            ref = {**_HEADERS, "Referer": str(r.url),
                   "Content-Type": "application/x-www-form-urlencoded"}

            # SAML response → finish
            if "SAMLResponse" in fields:
                return await _finish_saml(client, r)

            # Login form → inject credentials
            if _is_login_form(fields):
                fields[_find(fields, _USER_FIELDS)] = username
                fields[_find(fields, _PASS_FIELDS)] = password
                r = await client.post(action, data=fields, headers=ref)
                nf = FormParser.parse(r.text)
                if (not any("SAMLResponse" in f["fields"] for f in nf)
                        and any(_is_login_form(f["fields"]) for f in nf)):
                    raise HTTPException(401, "Benutzername oder Passwort falsch.")
                continue

            # MFA form → auto-submit TOTP
            if _is_mfa_form(fields):
                token_field = _guess_token(fields)
                if not token_field:
                    raise HTTPException(502, "MFA-Feld nicht erkannt.")
                code = pyotp.TOTP(_TOTP_SECRET, digits=6, interval=30).now()
                r = await client.post(
                    action, headers=ref,
                    data={**_only_proceed(fields), token_field: code})
                continue

            # Unknown form → submit as-is
            r = await client.post(action, data=fields, headers=ref)

        raise HTTPException(502, "Login-Flow nach 8 Schritten nicht abgeschlossen.")


# ═══════════════════════════════════════════════════════════════════
# 5. Primuss helpers
# ═══════════════════════════════════════════════════════════════════

def _current_semester() -> tuple[date, date]:
    today = date.today()
    y = today.year
    if 3 <= today.month <= 7:
        return date(y, 3, 15), date(y, 7, 15)
    if today.month >= 8:
        return date(y, 10, 1), date(y + 1, 2, 15)
    return date(y - 1, 10, 1), date(y, 2, 15)

def _week_mondays(start: date, end: date):
    d = start - timedelta(days=start.weekday())
    while d <= end:
        yield d
        d += timedelta(weeks=1)

def _primuss_date(d: date) -> str:
    return f"{d.month}/{d.day}/{d.year}"

def _parse_dt(s: str) -> str:
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})\s+(\d{1,2}):(\d{2})", s.strip())
    if not m:
        return ""
    mo, d, y, h, mi = m.groups()
    return f"{y}-{int(mo):02d}-{int(d):02d}T{int(h):02d}:{mi}:00"


def _parse_course_groups(html: str) -> dict:
    """Parse Primuss tree: Faculty → Degree → Program → Semester groups.

    Uses position-based parsing — locates structural elements by their offset
    in the HTML and walks them in document order to reconstruct ancestry.
    Avoids nested <ol> regex pitfalls.
    """
    fac_pos = {m.start(): m.group(1).strip()
               for m in re.finditer(r'<label\s+for="orga_\d+"[^>]*>([^<]+)</label>', html)}

    deg_pos: dict[int, str] = {}
    for m in re.finditer(r'</li>\s*(Bachelor|Master|Sonstige)\s*<li', html):
        deg_pos[m.start()] = m.group(1)
    for m in re.finditer(r'<ol\s*>\s*(Bachelor|Master|Sonstige)\s', html):
        deg_pos[m.start()] = m.group(1)

    stg_info: dict[str, str] = {}
    stg_pos: dict[int, str] = {}
    for m in re.finditer(r'<input[^>]*?id="stg_(\d+)"[^>]*?title="([^"]*)"', html):
        stg_info[m.group(1)] = m.group(2).strip()
        stg_pos[m.start()] = m.group(1)

    stg_labels = {m.group(1): m.group(2).strip()
                  for m in re.finditer(r'<label\s+for="stg_(\d+)"[^>]*>([^<]+)</label>', html)}

    # Walk document order to assign faculty + degree to each program
    markers = sorted(
        [("fac", p, d) for p, d in fac_pos.items()] +
        [("deg", p, d) for p, d in deg_pos.items()] +
        [("stg", p, d) for p, d in stg_pos.items()],
        key=lambda x: x[1],
    )
    stg_map: dict[str, dict] = {}
    cur_fac = cur_deg = ""
    for kind, _, data in markers:
        if kind == "fac":    cur_fac = data
        elif kind == "deg":  cur_deg = data
        elif kind == "stg":
            stg_map[data] = {"fac": cur_fac, "deg": cur_deg,
                             "name": stg_info.get(data, ""),
                             "code": stg_labels.get(data, "")}

    # Collect leaf groups
    flat: list[dict] = []
    for m in re.finditer(
        r'<li\b([^>]*)>\s*<a\b[^>]*class="menu_stgru_link"[^>]*>([^<]+)</a>', html,
    ):
        sm = re.search(r'StgruSet\((\d+),\s*(\d+)\)', m.group(1))
        if not sm:
            continue
        prog = stg_map.get(sm.group(1), {})
        flat.append({
            "label": m.group(2).strip(), "stg": sm.group(1), "stgru": sm.group(2),
            "faculty": prog.get("fac", ""), "degree": prog.get("deg", ""),
            "program_code": prog.get("code", ""), "program_name": prog.get("name", ""),
        })

    # Build tree: Faculty → Degree → Program → Groups
    tree: list[dict] = []
    fac_idx: dict[str, dict] = {}
    for grp in flat:
        fk = grp["faculty"] or "Sonstige"
        if fk not in fac_idx:
            fac_idx[fk] = {"label": fk, "degrees": []}
            tree.append(fac_idx[fk])
        fac = fac_idx[fk]

        dk = grp["degree"] or "Sonstige"
        deg = next((d for d in fac["degrees"] if d["label"] == dk), None)
        if not deg:
            deg = {"label": dk, "programs": []}
            fac["degrees"].append(deg)

        pk = grp["program_code"] or grp["label"]
        prog = next((p for p in deg["programs"] if p["code"] == pk), None)
        if not prog:
            prog = {"code": pk, "name": grp["program_name"], "groups": []}
            deg["programs"].append(prog)
        prog["groups"].append(grp)

    return {"tree": tree, "flat": flat}


def _normalize_event(raw) -> dict | None:
    """Convert Primuss event list → clean dict."""
    if not isinstance(raw, list) or len(raw) < 4:
        return None

    dtstart = _parse_dt(str(raw[2]))
    dtend   = _parse_dt(str(raw[3]))
    if not dtstart:
        return None

    meta    = raw[20] if len(raw) > 20 and isinstance(raw[20], dict) else {}
    summary = meta.get("fach_kurzform", "").strip()
    if not summary:
        summary = re.split(r"bei\s+", str(raw[1]).strip().strip("\r\n"), maxsplit=1)[0].strip()
    if not summary:
        return None

    room     = str(raw[22]).strip() if len(raw) > 22 and raw[22] else ""
    lecturer = str(raw[12]).removeprefix("bei ").strip() if len(raw) > 12 and raw[12] else ""
    desc = f"Dozent: {lecturer}" if lecturer else ""
    if meta.get("kommentar"):
        desc = f"{desc}\n{meta['kommentar']}" if desc else meta["kommentar"]

    return {
        "summary": summary, "dtstart": dtstart, "dtend": dtend or dtstart,
        "location": room, "description": desc,
        "lv_id": str(meta.get("lv_id", "")),
        "fach_name": meta.get("fach_name", ""),
        "fach_id": str(meta.get("fach_id", "")),
        "rhythmus": str(meta.get("rhythmus", "")),
    }


def _dedupe(events: list[dict]) -> list[dict]:
    seen, out = set(), []
    for ev in events:
        key = (ev["summary"], ev["dtstart"], ev["dtend"], ev["location"])
        if key not in seen:
            seen.add(key)
            out.append(ev)
    return out


async def _fetch_timetable(stgru: str, retry: bool = True) -> dict:
    """Fetch all events for a study group across the current semester."""
    s = await _ensure_session()
    cookies = _parse_cookies(s["cookies"])
    sem_start, sem_end = _current_semester()
    mondays = list(_week_mondays(sem_start, sem_end))

    base = {"viewtype": "week", "timezone": "1", "mode": "calendar",
            "Session": s["session"], "User": s["user"], "stgru": stgru}
    sem = asyncio.Semaphore(3)

    async def fetch_week(client: httpx.AsyncClient, monday: date):
        async with sem:
            try:
                r = await client.post(
                    f"{PRIMUSS_URL}?FH={FH}&Language={LANG}&sem={SEM}&method=list",
                    data={**base, "showdate": _primuss_date(monday)},
                    cookies=cookies, timeout=15,
                    headers={"User-Agent": _UA,
                             "X-Requested-With": "XMLHttpRequest",
                             "Accept": "application/json, text/javascript, */*; q=0.01",
                             "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"})
            except httpx.TimeoutException:
                return None
            if r.status_code in (301, 302):
                return "redirect"
            try:
                return r.json()
            except Exception:
                return None

    async with httpx.AsyncClient(follow_redirects=False) as client:
        results = await asyncio.gather(*[fetch_week(client, m) for m in mondays])

    events: list[dict] = []
    had_redirect = False
    for data in results:
        if data is None:
            continue
        if data == "redirect":
            had_redirect = True
            continue
        for raw in (data.get("events", []) if isinstance(data, dict) else []):
            ev = _normalize_event(raw)
            if ev:
                events.append(ev)

    if had_redirect and not events:
        if retry:
            await _ensure_session(force=True)
            return await _fetch_timetable(stgru, retry=False)
        raise HTTPException(502, "Primuss-Session konnte nicht erneuert werden.")

    return {"events": _dedupe(events), "weeks": len(mondays),
            "semester": f"{sem_start.isoformat()} – {sem_end.isoformat()}"}


# ═══════════════════════════════════════════════════════════════════
# 6. ICS generation
# ═══════════════════════════════════════════════════════════════════

def _to_dt(s: str) -> datetime:
    s = s.replace("Z", "+00:00").strip()
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return datetime.fromisoformat(s[:19])

def build_ics(events: list[dict]) -> bytes:
    cal = Calendar()
    cal.add("prodid",        "-//Stundenplan Generator//fhla//DE")
    cal.add("version",       "2.0")
    cal.add("calscale",      "GREGORIAN")
    cal.add("method",        "PUBLISH")
    cal.add("x-wr-calname",  "Stundenplan HS Landshut")
    cal.add("x-wr-timezone", "Europe/Berlin")

    for ev in events:
        ie = IcsEvent()
        ie.add("summary", ev.get("summary", "Veranstaltung"))
        ie.add("dtstart", _to_dt(ev["dtstart"]))
        ie.add("dtend",   _to_dt(ev.get("dtend", ev["dtstart"])))
        ie.add("dtstamp", datetime.now(timezone.utc))
        if ev.get("location"):
            ie.add("location", vText(ev["location"]))
        if ev.get("description"):
            ie.add("description", vText(ev["description"]))
        uid = re.sub(r"\s+", "-", f"{ev['dtstart']}-{ev.get('summary','')}-{FH}")
        ie.add("uid", uid + "@stundenplan-gen")
        cal.add_component(ie)

    return cal.to_ical()


# ═══════════════════════════════════════════════════════════════════
# 7. FastAPI app & routes
# ═══════════════════════════════════════════════════════════════════

app = FastAPI(title="Stundenplan Generator", docs_url=None, redoc_url=None)


class TimetableRequest(BaseModel):
    stgru: str

class IcsRequest(BaseModel):
    events: list[dict]


@app.get("/api/init")
async def init():
    """Auto-authenticate and return the course tree."""
    s = await _ensure_session()
    return {"course_tree": s["course_tree"]}


@app.post("/api/timetable")
async def timetable(req: TimetableRequest):
    """Fetch events for a study group (auto-retries on expired session)."""
    return await _fetch_timetable(req.stgru)


@app.post("/api/ics")
async def ics(req: IcsRequest):
    if not req.events:
        raise HTTPException(400, "Keine Events übergeben.")
    return StreamingResponse(
        BytesIO(build_ics(req.events)),
        media_type="text/calendar",
        headers={"Content-Disposition": "attachment; filename=stundenplan.ics"},
    )


app.mount("/", StaticFiles(directory="public", html=True), name="static")
