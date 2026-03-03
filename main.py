"""
Stundenplan Generator — Backend
Exports HS Landshut Primuss timetables as .ics calendar files.

Sections:
  1. Config & constants
  2. Pydantic models
  3. HTML form parser
  4. Cookie helpers
  5. Session cache
  6. Shibboleth auth (login, MFA, SAML)
  7. Primuss helpers (semester, events, course groups)
  8. ICS generation
  9. FastAPI app & routes
"""

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from html.parser import HTMLParser
from urllib.parse import urljoin
from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone, date
from io import BytesIO
from icalendar import Calendar, Event as IcsEvent, vText
import httpx, asyncio, uuid, os, re, pyotp


# ═══════════════════════════════════════════════════════════════════
# 1. Config & constants
# ═══════════════════════════════════════════════════════════════════

load_dotenv()

ENV_USERNAME    = os.getenv("USERNAME", "")
ENV_PASSWORD    = os.getenv("PASSWORD", "")
ENV_TOTP_SECRET = os.getenv("TOTP_SECRET", "")

PRIMUSS_URL = "https://www3.primuss.de/stpl/index.php"
FH          = "fhla"
LANG        = "de"
SEM         = "9"

HEADERS = {
    "User-Agent":      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
}


# ═══════════════════════════════════════════════════════════════════
# 2. Pydantic models
# ═══════════════════════════════════════════════════════════════════

class LoginRequest(BaseModel):
    username: str = ""
    password: str = ""

class MfaRequest(BaseModel):
    state_id: str
    totp: str

class TimetableRequest(BaseModel):
    cookies: str
    session: str
    user:    str
    stgru:   str

class IcsRequest(BaseModel):
    events: list[dict]


# ═══════════════════════════════════════════════════════════════════
# 3. HTML form parser
# ═══════════════════════════════════════════════════════════════════

class FormParser(HTMLParser):
    """Extract all <form> elements with their fields from HTML."""

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
# 4. Cookie helpers
# ═══════════════════════════════════════════════════════════════════

def parse_cookies(raw: str) -> dict[str, str]:
    raw = re.sub(r"[\r\n]+\s*", "", raw).strip()
    out: dict[str, str] = {}
    for part in raw.split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            out[k.strip()] = v.strip()
    return out

def cookies_to_str(jar: httpx.Cookies) -> str:
    return "; ".join(f"{k}={v}" for k, v in jar.items())


# ═══════════════════════════════════════════════════════════════════
# 5. Session cache
# ═══════════════════════════════════════════════════════════════════

SESSION_TTL = timedelta(minutes=30)
_session_cache: dict[str, dict] = {}

def cache_session(data: dict):
    """Store a successful login result."""
    user = data.get("user", "")
    if user:
        _session_cache[user] = {**data, "_ts": datetime.now()}

def get_cached_session() -> dict | None:
    """Return the most recent valid session, or None."""
    now = datetime.now()
    for user in list(_session_cache):
        entry = _session_cache[user]
        if now - entry["_ts"] > SESSION_TTL:
            del _session_cache[user]
            continue
        return {k: v for k, v in entry.items() if k != "_ts"}
    return None

def invalidate_session(user: str):
    _session_cache.pop(user, None)


# ═══════════════════════════════════════════════════════════════════
# 6. Shibboleth auth
# ═══════════════════════════════════════════════════════════════════

_USER_FIELDS  = {"j_username", "username", "user", "uid", "login"}
_PASS_FIELDS  = {"j_password", "password", "pass", "passwd", "pw"}
_TOKEN_FIELDS = {
    "j_tokennumber", "tokennumber", "token", "otp", "totp", "mfa",
    "passcode", "code", "pin", "fudis_otp_input",
}
_BORING_FIELDS = {"csrf_token", "shib_idp_ls_supported", "execution", "samlrequest", "relaystate"}

def _find(fields: dict, keys: set) -> str | None:
    return next((k for k in fields if k.lower() in keys), None)

def _is_boring(k: str) -> bool:
    kl = k.lower()
    return kl in _BORING_FIELDS or kl.startswith("shib_idp_ls_") or kl.startswith("_eventid_")

def _is_login_form(fields: dict) -> bool:
    return bool(_find(fields, _USER_FIELDS) and _find(fields, _PASS_FIELDS))

def _is_mfa_form(fields: dict) -> bool:
    if _is_login_form(fields):
        return False
    if _find(fields, _TOKEN_FIELDS):
        return True
    if _find(fields, _PASS_FIELDS) and not _find(fields, _USER_FIELDS):
        return True
    return any(not _is_boring(k) for k in fields)

def _guess_token(fields: dict) -> str | None:
    return (_find(fields, _TOKEN_FIELDS)
            or (_find(fields, _PASS_FIELDS) if not _find(fields, _USER_FIELDS) else None)
            or next((k for k in fields if not _is_boring(k)), None))

# MFA mid-flow store
_mfa_store: dict[str, dict] = {}

def _save_mfa(cookies, action, fields, token_field) -> str:
    cutoff = datetime.now() - timedelta(minutes=5)
    for k in [k for k, v in _mfa_store.items() if v["ts"] < cutoff]:
        del _mfa_store[k]
    sid = str(uuid.uuid4())
    _mfa_store[sid] = {"cookies": cookies, "action": action,
                       "fields": fields, "token_field": token_field,
                       "ts": datetime.now()}
    return sid

def _pop_mfa(state_id: str) -> dict:
    state = _mfa_store.pop(state_id, None)
    if not state:
        raise HTTPException(400, "MFA-Session abgelaufen. Bitte neu einloggen.")
    return state

def _only_proceed(fields: dict) -> dict:
    return {k: v for k, v in fields.items()
            if not k.lower().startswith("_eventid_") or k.lower() == "_eventid_proceed"}


async def _finish_saml(client: httpx.AsyncClient, r) -> dict:
    """Submit SAMLResponse → Primuss ACS, extract session + course groups."""
    forms     = FormParser.parse(r.text)
    saml_form = next((f for f in forms if "SAMLResponse" in f["fields"]), None)
    if not saml_form:
        raise HTTPException(502, "SAML-Formular nicht gefunden.")

    acs = saml_form["action"]
    if not acs.startswith("http"):
        acs = urljoin(str(r.url), acs)

    final = await client.post(acs, data=saml_form["fields"],
                              headers={**HEADERS, "Referer": str(r.url),
                                       "Content-Type": "application/x-www-form-urlencoded"})

    url        = str(final.url)
    cookie_str = cookies_to_str(client.cookies)
    if not cookie_str:
        raise HTTPException(502, "Login OK, aber keine Cookies erhalten.")

    session = (m.group(1) if (m := re.search(r"[?&]Session=([^&#]+)", url)) else "")
    user    = (m.group(1) if (m := re.search(r"[?&]User=([^&#]+)",    url)) else "")
    groups  = _parse_course_groups(final.text)

    return {"cookies": cookie_str, "session": session, "user": user, "course_groups": groups}


async def shibboleth_login(username: str, password: str) -> dict:
    """Full Shibboleth IdP walk: forms → credentials → MFA → SAML."""
    async with httpx.AsyncClient(follow_redirects=True, timeout=30, headers=HEADERS) as client:
        r = await client.get(f"https://www3.primuss.de/stpl/login_shibb.php?FH={FH}&Language={LANG}")
        creds_sent = False

        for _ in range(8):
            forms = FormParser.parse(r.text)
            if not forms:
                raise HTTPException(502, f"Kein Formular auf {r.url}")

            fields = dict(forms[0]["fields"])
            action = forms[0]["action"]
            if not action.startswith("http"):
                action = urljoin(str(r.url), action)

            if "SAMLResponse" in fields:
                return await _finish_saml(client, r)

            if _find(fields, _PASS_FIELDS):
                fields[_find(fields, _USER_FIELDS) or "j_username"] = username
                fields[_find(fields, _PASS_FIELDS) or "j_password"] = password
                creds_sent = True
                r = await client.post(action, data=fields,
                    headers={**HEADERS, "Referer": str(r.url),
                             "Content-Type": "application/x-www-form-urlencoded"})
                nf = FormParser.parse(r.text)
                if (not any("SAMLResponse" in f["fields"] for f in nf)
                        and any(_is_login_form(f["fields"]) for f in nf)):
                    raise HTTPException(401, "Benutzername oder Passwort falsch.")
                continue

            if creds_sent and _is_mfa_form(fields):
                token_field = _guess_token(fields)
                if not token_field:
                    raise HTTPException(502, "MFA-Feld nicht erkannt.")
                if ENV_TOTP_SECRET:
                    code = pyotp.TOTP(ENV_TOTP_SECRET, digits=6, interval=30).now()
                    r = await client.post(action, data={**_only_proceed(fields), token_field: code},
                        headers={**HEADERS, "Referer": str(r.url),
                                 "Content-Type": "application/x-www-form-urlencoded"})
                    continue
                sid = _save_mfa(dict(client.cookies), action, fields, token_field)
                return {"requires_mfa": True, "state_id": sid, "token_field": token_field}

            r = await client.post(action, data=fields,
                headers={**HEADERS, "Referer": str(r.url),
                         "Content-Type": "application/x-www-form-urlencoded"})

        raise HTTPException(502, "Login-Flow nach 8 Schritten nicht abgeschlossen.")


async def shibboleth_mfa(state_id: str, totp: str) -> dict:
    state = _pop_mfa(state_id)
    async with httpx.AsyncClient(follow_redirects=True, timeout=30, headers=HEADERS,
                                 cookies=state["cookies"]) as client:
        fields = {**_only_proceed(state["fields"]), state["token_field"]: totp.strip()}
        r = await client.post(state["action"], data=fields,
            headers={**HEADERS, "Content-Type": "application/x-www-form-urlencoded"})

        forms = FormParser.parse(r.text)
        if not any("SAMLResponse" in f["fields"] for f in forms):
            if any(_is_mfa_form(f["fields"]) for f in forms):
                raise HTTPException(401, "MFA-Code falsch oder abgelaufen.")
            raise HTTPException(502, "Unerwartete Antwort nach MFA-Eingabe.")
        return await _finish_saml(client, r)


# ═══════════════════════════════════════════════════════════════════
# 7. Primuss helpers
# ═══════════════════════════════════════════════════════════════════

def current_semester() -> tuple[date, date]:
    today = date.today()
    y = today.year
    if 3 <= today.month <= 7:
        return date(y, 3, 15), date(y, 7, 15)
    if today.month >= 8:
        return date(y, 10, 1), date(y + 1, 2, 15)
    return date(y - 1, 10, 1), date(y, 2, 15)

def week_mondays(start: date, end: date):
    d = start - timedelta(days=start.weekday())
    while d <= end:
        yield d
        d += timedelta(weeks=1)

def primuss_date(d: date) -> str:
    return f"{d.month}/{d.day}/{d.year}"

def _parse_primuss_dt(s: str) -> str:
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})\s+(\d{1,2}):(\d{2})", s.strip())
    if not m:
        return ""
    mo, d, y, h, mi = m.groups()
    return f"{y}-{int(mo):02d}-{int(d):02d}T{int(h):02d}:{mi}:00"

def _parse_course_groups(html: str) -> list[dict]:
    groups = []
    for m in re.finditer(
        r'<li\b([^>]*)>\s*<a\b[^>]*class="menu_stgru_link"[^>]*>([^<]+)</a>',
        html,
    ):
        attrs, label = m.group(1), m.group(2).strip()
        stg_m = re.search(r'StgruSet\((\d+),\s*(\d+)\)', attrs)
        if not stg_m:
            continue
        title_m = re.search(r'title="([^"]*)"', attrs)
        title = title_m.group(1).strip() if title_m else ''
        prog = re.match(r'[A-Za-z]+', label)
        # Title format: "Name (Degree) Name (Type) N. Semester" → extract first "Name (Degree)"
        pname_m = re.match(r'(.+?\([^)]+\))', title) if title else None
        groups.append({
            "label": label, "stg": stg_m.group(1), "stgru": stg_m.group(2),
            "program": prog.group(0) if prog else label,
            "program_name": pname_m.group(1).strip() if pname_m else '',
        })
    return groups

def normalize_event(raw) -> dict | None:
    """Convert Primuss event list → clean dict with metadata for grouping."""
    if not isinstance(raw, list) or len(raw) < 4:
        return None

    dtstart = _parse_primuss_dt(str(raw[2]))
    dtend   = _parse_primuss_dt(str(raw[3]))
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

    desc_parts = []
    if lecturer:
        desc_parts.append(f"Dozent: {lecturer}")
    if meta.get("kommentar"):
        desc_parts.append(meta["kommentar"])

    return {
        "summary":     summary,
        "dtstart":     dtstart,
        "dtend":       dtend or dtstart,
        "location":    room,
        "description": "\n".join(desc_parts),
        # Metadata for frontend grouping & disambiguation
        "lv_id":       str(meta.get("lv_id", "")),
        "fach_name":   meta.get("fach_name", ""),
        "fach_id":     str(meta.get("fach_id", "")),
        "rhythmus":    str(meta.get("rhythmus", "")),
    }

def dedupe(events: list[dict]) -> list[dict]:
    seen, out = set(), []
    for ev in events:
        key = (ev["summary"], ev["dtstart"], ev["dtend"], ev["location"])
        if key not in seen:
            seen.add(key)
            out.append(ev)
    return out


# ═══════════════════════════════════════════════════════════════════
# 8. ICS generation
# ═══════════════════════════════════════════════════════════════════

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
        ie.add("dtstart", _parse_ics_dt(ev["dtstart"]))
        ie.add("dtend",   _parse_ics_dt(ev.get("dtend", ev["dtstart"])))
        ie.add("dtstamp", datetime.now(timezone.utc))
        if ev.get("location"):
            ie.add("location", vText(ev["location"]))
        if ev.get("description"):
            ie.add("description", vText(ev["description"]))
        uid = re.sub(r"\s+", "-", f"{ev['dtstart']}-{ev.get('summary','')}-{FH}")
        ie.add("uid", uid + "@stundenplan-gen")
        cal.add_component(ie)

    return cal.to_ical()

def _parse_ics_dt(s: str) -> datetime:
    s = s.replace("Z", "+00:00").strip()
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return datetime.fromisoformat(s[:19])


# ═══════════════════════════════════════════════════════════════════
# 9. FastAPI app & routes
# ═══════════════════════════════════════════════════════════════════

app = FastAPI(title="Stundenplan Generator", docs_url=None, redoc_url=None)


@app.get("/api/status")
async def status():
    return {
        "credentials": bool(ENV_USERNAME and ENV_PASSWORD),
        "totp":        bool(ENV_TOTP_SECRET),
        "username":    ENV_USERNAME,
    }


@app.get("/api/session")
async def session():
    """Return cached session if still valid (avoids re-login on refresh)."""
    cached = get_cached_session()
    if cached:
        return cached
    return {"valid": False}


@app.post("/api/login")
async def login(req: LoginRequest):
    username = req.username or ENV_USERNAME
    password = req.password or ENV_PASSWORD
    if not username or not password:
        raise HTTPException(400, "Keine Zugangsdaten — .env mit USERNAME/PASSWORD anlegen.")
    result = await shibboleth_login(username, password)
    if "cookies" in result:   # full success (not MFA prompt)
        cache_session(result)
    return JSONResponse(result)


@app.post("/api/login/mfa")
async def login_mfa(req: MfaRequest):
    result = await shibboleth_mfa(req.state_id, req.totp)
    cache_session(result)
    return JSONResponse(result)


@app.post("/api/timetable")
async def timetable(req: TimetableRequest):
    cookies = parse_cookies(req.cookies)
    sem_start, sem_end = current_semester()
    mondays = list(week_mondays(sem_start, sem_end))

    base_form = {
        "viewtype": "week", "timezone": "1",
        "Session": req.session, "User": req.user,
        "mode": "calendar", "stgru": req.stgru,
    }

    sem = asyncio.Semaphore(3)

    async def fetch_week(client: httpx.AsyncClient, monday: date):
        async with sem:
            url  = f"{PRIMUSS_URL}?FH={FH}&Language={LANG}&sem={SEM}&method=list"
            form = {**base_form, "showdate": primuss_date(monday)}
            try:
                r = await client.post(url, data=form, cookies=cookies, headers={
                    "User-Agent":       HEADERS["User-Agent"],
                    "X-Requested-With": "XMLHttpRequest",
                    "Accept":           "application/json, text/javascript, */*; q=0.01",
                    "Origin":           "https://www3.primuss.de",
                    "Referer":          f"{PRIMUSS_URL}?FH={FH}&Language={LANG}&Session={req.session}&User={req.user}",
                    "Content-Type":     "application/x-www-form-urlencoded; charset=UTF-8",
                }, timeout=15)
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

    all_events: list[dict] = []
    had_redirect = False

    for data in results:
        if data is None:
            continue
        if data == "redirect":
            had_redirect = True
            continue
        events = data.get("events", []) if isinstance(data, dict) else []
        for raw in events:
            ev = normalize_event(raw)
            if ev:
                all_events.append(ev)

    if had_redirect and not all_events:
        invalidate_session(req.user)
        raise HTTPException(401, "Session abgelaufen — bitte neu einloggen.")

    return {
        "events": dedupe(all_events),
        "weeks":  len(mondays),
        "semester": f"{sem_start.isoformat()} – {sem_end.isoformat()}",
    }


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
