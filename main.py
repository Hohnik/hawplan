from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from html.parser import HTMLParser
from urllib.parse import urljoin
import httpx
import asyncio
import uuid
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
FH           = "fhla"
LANGUAGE     = "de"

BROWSER_HEADERS = {
    "User-Agent":      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
}

# ── Models ───────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str

class MfaRequest(BaseModel):
    state_id: str
    totp:     str

class FetchRequest(BaseModel):
    cookies:   str          # "PHPSESSID=abc; _shibsession_xyz=def"
    session:   str          # Session= value from URL
    user:      str          # User= value from URL
    stgru:     str          # e.g. "165"
    sem:       str = "9"
    date_from: str          # "YYYY-MM-DD"
    date_to:   str          # "YYYY-MM-DD"
    timezone:  str = "1"

class IcsRequest(BaseModel):
    events: list[dict]


# ── HTML form parser ──────────────────────────────────────────────

class FormExtractor(HTMLParser):
    """
    Extract every <form> from an HTML page, including all input/select values.
    Handles multi-form pages (e.g. SAML assertion pages).
    """
    def __init__(self):
        super().__init__()
        self.forms: list[dict] = []
        self._cur: dict | None = None

    def handle_starttag(self, tag: str, attrs):
        a = dict(attrs)
        if tag == "form":
            self._cur = {
                "action": a.get("action", ""),
                "method": a.get("method", "post").upper(),
                "fields": {},
            }
        elif tag == "input" and self._cur is not None:
            name  = a.get("name")
            itype = a.get("type", "text").lower()
            if name and itype != "submit" and itype != "button":
                self._cur["fields"][name] = a.get("value", "")
        elif tag == "select" and self._cur is not None:
            name = a.get("name")
            if name:
                self._cur["fields"][name] = ""   # filled by <option selected>
        elif tag == "option" and self._cur is not None:
            if "selected" in dict(attrs):
                # find most recently added select field and set its value
                # (simplistic but sufficient for SAML forms)
                pass

    def handle_endtag(self, tag: str):
        if tag == "form" and self._cur is not None:
            self.forms.append(self._cur)
            self._cur = None

    @classmethod
    def parse(cls, html: str) -> list[dict]:
        p = cls()
        p.feed(html)
        return p.forms


# ── Cookie helpers ────────────────────────────────────────────────

def parse_cookies(cookie_string: str) -> dict:
    """
    Parse 'PHPSESSID=abc; _shibsession_xyz=def' → dict.
    Strips \\r\\n line-wrapping that DevTools inserts for long cookie names.
    """
    cookie_string = re.sub(r"[\r\n]+[ \t]*", "", cookie_string).strip()
    cookies: dict[str, str] = {}
    for part in cookie_string.split(";"):
        part = part.strip()
        if "=" in part:
            k, v = part.split("=", 1)
            cookies[k.strip()] = v.strip()
    return cookies

def cookies_to_str(jar: httpx.Cookies) -> str:
    return "; ".join(f"{k}={v}" for k, v in jar.items())


# ── Shibboleth auto-login ─────────────────────────────────────────

# ── MFA session store ─────────────────────────────────────────────
# Stores intermediate login state between phase-1 and phase-2 requests.
# Keyed by a random UUID, expires after 5 minutes.
_mfa_store: dict[str, dict] = {}
_MFA_TTL   = timedelta(minutes=5)

def _store_mfa_state(cookies: dict, action: str, fields: dict, token_field: str) -> str:
    _purge_mfa_store()
    sid = str(uuid.uuid4())
    _mfa_store[sid] = {
        "cookies":     cookies,
        "action":      action,
        "fields":      fields,
        "token_field": token_field,
        "created":     datetime.now(),
    }
    return sid

def _pop_mfa_state(state_id: str) -> dict:
    _purge_mfa_store()
    state = _mfa_store.pop(state_id, None)
    if state is None:
        raise HTTPException(
            status_code=400,
            detail="MFA-Session abgelaufen oder ungültig. Bitte neu einloggen.",
        )
    return state

def _purge_mfa_store():
    cutoff = datetime.now() - _MFA_TTL
    expired = [k for k, v in _mfa_store.items() if v["created"] < cutoff]
    for k in expired:
        del _mfa_store[k]


# ── Shibboleth field-name sets ────────────────────────────────────
_USERNAME_KEYS = {"j_username", "username", "user", "uid", "login"}
_PASSWORD_KEYS = {"j_password", "password", "pass", "passwd", "pw"}
# Token fields: covers Shibboleth MFA / TOTP / AD OTP variants
_TOKEN_KEYS    = {
    "j_tokennumber", "tokennumber", "token",
    "otp", "totp", "mfa", "passcode", "code", "pin",
    "_shib_idp_mfa_otp", "authn_code", "response",
}
# Fields we know are never the token
_BORING_FIELDS = {
    "csrf_token", "_eventid_proceed", "shib_idp_ls_supported",
    "execution", "samlrequest", "relaystate",
}


def _find_field(fields: dict, key_set: set[str]) -> str | None:
    return next((k for k in fields if k.lower() in key_set), None)

def _is_mfa_form(fields: dict) -> bool:
    """Heuristic: a form is an MFA form if it has no password field and at least
    one field that isn't a known boring hidden field or CSRF token."""
    has_pw = _find_field(fields, _PASSWORD_KEYS)
    if has_pw:
        return False
    interesting = [
        k for k in fields
        if k.lower() not in _BORING_FIELDS
        and not k.lower().startswith("shib_idp_ls_")
    ]
    return bool(interesting)

def _guess_token_field(fields: dict) -> str | None:
    """Return the most likely token field name."""
    # 1. Exact known name
    known = _find_field(fields, _TOKEN_KEYS)
    if known:
        return known
    # 2. Fallback: first field that isn't boring
    for k in fields:
        if k.lower() not in _BORING_FIELDS and not k.lower().startswith("shib_idp_ls_"):
            return k
    return None


async def _finish_saml(client: httpx.AsyncClient, r) -> dict:
    """POST the SAMLResponse form to the SP ACS and extract the final session."""
    forms     = FormExtractor.parse(r.text)
    saml_form = next((f for f in forms if "SAMLResponse" in f["fields"]), None)
    if not saml_form:
        raise HTTPException(status_code=502, detail="SAML-Assertion-Formular nicht gefunden.")

    acs_url = saml_form["action"]
    if not acs_url.startswith("http"):
        acs_url = urljoin(str(r.url), acs_url)

    r_final = await client.post(
        acs_url, data=saml_form["fields"],
        headers={**BROWSER_HEADERS, "Referer": str(r.url),
                 "Content-Type": "application/x-www-form-urlencoded"},
    )

    final_url  = str(r_final.url)
    cookie_str = cookies_to_str(client.cookies)

    if not cookie_str:
        raise HTTPException(status_code=502,
                            detail="Login erfolgreich, aber keine Cookies erhalten.")

    session = (m.group(1) if (m := re.search(r"[?&]Session=([^&#]+)", final_url)) else "")
    user    = (m.group(1) if (m := re.search(r"[?&]User=([^&#]+)",    final_url)) else "")
    stgru   = await detect_stgru(client, session, user, cookie_str)
    return {"cookies": cookie_str, "session": session, "user": user, "stgru": stgru}


async def shibboleth_phase1(username: str, password: str) -> dict:
    """
    Phase 1: walk through IDP forms until we either:
      (a) get a SAMLResponse  → complete the flow, return session data
      (b) hit an MFA form     → store state, return { requires_mfa, state_id }

    The IDP flow for HS Landshut:
      e1s1  local-storage-check  (no credentials, submit as-is)
      e1s2  login form           (j_username + j_password)
      e1s3  MFA / TOTP form      (token field — varies)
      →  SAMLResponse → ACS
    """
    async with httpx.AsyncClient(
        follow_redirects=True, timeout=30.0, headers=BROWSER_HEADERS,
    ) as client:
        r = await client.get(
            f"https://www3.primuss.de/stpl/login_shibb.php?FH={FH}&Language={LANGUAGE}"
        )
        credentials_sent = False

        for step in range(8):
            forms = FormExtractor.parse(r.text)
            if not forms:
                raise HTTPException(
                    status_code=502,
                    detail=f"Kein Formular bei Schritt {step+1} (URL: {r.url})",
                )

            form   = forms[0]
            fields = dict(form["fields"])
            action = form["action"]
            if not action.startswith("http"):
                action = urljoin(str(r.url), action)

            # ── SAMLResponse: ready to finish ────────────────────────
            if "SAMLResponse" in fields:
                return await _finish_saml(client, r)

            pw_field   = _find_field(fields, _PASSWORD_KEYS)
            user_field = _find_field(fields, _USERNAME_KEYS)

            # ── Login form: inject credentials ───────────────────────
            if pw_field:
                fields[user_field or "j_username"] = username
                fields[pw_field]                   = password
                credentials_sent = True
                r = await client.post(
                    action, data=fields,
                    headers={**BROWSER_HEADERS, "Referer": str(r.url),
                             "Content-Type": "application/x-www-form-urlencoded"},
                )
                # If IDP returns another password form → wrong credentials
                nf = FormExtractor.parse(r.text)
                if (not any("SAMLResponse" in f["fields"] for f in nf)
                        and any(_find_field(f["fields"], _PASSWORD_KEYS) for f in nf)):
                    raise HTTPException(
                        status_code=401,
                        detail="Benutzername oder Passwort falsch.",
                    )
                continue

            # ── MFA form (after credentials were sent) ───────────────
            if credentials_sent and _is_mfa_form(fields):
                token_field = _guess_token_field(fields)
                if not token_field:
                    raise HTTPException(
                        status_code=502,
                        detail="MFA-Feld nicht erkannt. Bitte manuell einloggen.",
                    )
                # Serialise cookie jar so phase-2 can restore it
                cookie_dict = dict(client.cookies)
                sid = _store_mfa_state(cookie_dict, action, fields, token_field)
                return {
                    "requires_mfa": True,
                    "state_id":     sid,
                    "token_field":  token_field,   # hints the UI (e.g. "j_tokenNumber")
                }

            # ── Intermediate form: submit as-is ──────────────────────
            r = await client.post(
                action, data=fields,
                headers={**BROWSER_HEADERS, "Referer": str(r.url),
                         "Content-Type": "application/x-www-form-urlencoded"},
            )

        raise HTTPException(
            status_code=502,
            detail="Login-Flow nach 8 Schritten nicht abgeschlossen.",
        )


async def shibboleth_phase2(state_id: str, totp: str) -> dict:
    """
    Phase 2: restore cookies from phase-1, inject the TOTP into the MFA form,
    POST it to the IDP, then complete the SAML assertion flow.
    """
    state = _pop_mfa_state(state_id)

    async with httpx.AsyncClient(
        follow_redirects=True, timeout=30.0, headers=BROWSER_HEADERS,
        cookies=state["cookies"],
    ) as client:
        fields = dict(state["fields"])
        fields[state["token_field"]] = totp.strip()

        r = await client.post(
            state["action"], data=fields,
            headers={**BROWSER_HEADERS,
                     "Content-Type": "application/x-www-form-urlencoded"},
        )

        # Verify we got the SAML form and not another MFA prompt
        forms = FormExtractor.parse(r.text)
        if not any("SAMLResponse" in f["fields"] for f in forms):
            # Check for another MFA form → wrong token
            if any(_is_mfa_form(f["fields"]) for f in forms):
                raise HTTPException(
                    status_code=401,
                    detail="MFA-Code falsch oder abgelaufen. Bitte erneut versuchen.",
                )
            raise HTTPException(
                status_code=502,
                detail="Unerwartete IDP-Antwort nach MFA-Eingabe.",
            )

        return await _finish_saml(client, r)


async def detect_stgru(
    client: httpx.AsyncClient,
    session: str,
    user: str,
    cookie_str: str,
) -> str:
    """
    Best-effort: fetch the Primuss main page and extract stgru from the HTML/JS.
    Returns "" if not found — user will need to enter it manually.
    """
    try:
        r = await client.get(
            f"https://www3.primuss.de/stpl/index.php"
            f"?FH={FH}&Language={LANGUAGE}&Session={session}&User={user}",
            headers=BROWSER_HEADERS,
            timeout=10.0,
        )
        # stgru appears in the page as e.g. stgru=165 or "stgru":"165" or value="165"
        # Try several patterns
        for pat in (
            r'stgru["\s]*[:=]["\s]*(\d+)',
            r'name=["\']stgru["\'][^>]*value=["\'](\d+)["\']',
            r'value=["\'](\d+)["\'][^>]*name=["\']stgru["\']',
        ):
            m = re.search(pat, r.text, re.IGNORECASE)
            if m:
                return m.group(1)
    except Exception:
        pass
    return ""


# ── API Routes ────────────────────────────────────────────────────

@app.post("/api/login")
async def login(req: LoginRequest):
    """
    Phase 1 of Shibboleth SSO login.
    Returns either:
      { cookies, session, user, stgru }           — login complete (no MFA)
      { requires_mfa: true, state_id, token_field } — MFA step required
    """
    return JSONResponse(await shibboleth_phase1(req.username, req.password))


@app.post("/api/login/verify")
async def login_verify(req: MfaRequest):
    """
    Phase 2: submit the TOTP token to complete the MFA step.
    Returns { cookies, session, user, stgru }.
    """
    return JSONResponse(await shibboleth_phase2(req.state_id, req.totp))


@app.post("/api/fetch-all")
async def fetch_all(req: FetchRequest):
    """
    Iterate every week in [date_from, date_to] and collect all Primuss events
    for the given stgru.
    """
    cookies  = parse_cookies(req.cookies)
    mondays  = list(week_mondays(req.date_from, req.date_to))

    if not mondays:
        raise HTTPException(status_code=400, detail="Kein gültiger Datumsbereich.")
    if len(mondays) > 40:
        raise HTTPException(status_code=400, detail="Datumsbereich zu groß (max. 40 Wochen).")

    base_form = {
        "viewtype": "week",
        "timezone": req.timezone,
        "Session":  req.session,
        "User":     req.user,
        "mode":     "calendar",
        "stgru":    req.stgru,
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
                    "User-Agent":       BROWSER_HEADERS["User-Agent"],
                    "X-Requested-With": "XMLHttpRequest",
                    "Accept":           "application/json, text/javascript, */*; q=0.01",
                    "Origin":           "https://www3.primuss.de",
                    "Referer":          f"https://www3.primuss.de/stpl/index.php?FH={FH}&Language={LANGUAGE}&Session={req.session}&User={req.user}",
                    "Content-Type":     "application/x-www-form-urlencoded; charset=UTF-8",
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
    first_raw    = None
    first_items  = None
    had_redirect = False

    semaphore = asyncio.Semaphore(3)

    async def guarded(client, monday):
        async with semaphore:
            return await fetch_week(client, monday)

    async with httpx.AsyncClient(follow_redirects=False) as client:
        results = await asyncio.gather(*[guarded(client, m) for m in mondays])

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
                first_items = items[:3]
            for raw_ev in items:
                ev = normalize_event(raw_ev)
                if ev:
                    all_events.append(ev)

    if had_redirect and not all_events:
        raise HTTPException(
            status_code=401,
            detail="Session abgelaufen oder ungültig. Bitte neu einloggen.",
        )

    return JSONResponse({
        "events":       dedupe_events(all_events),
        "count":        len(all_events),
        "weeks":        len(mondays),
        "_first_raw":   first_raw,
        "_first_items": first_items,
    })


@app.post("/api/generate-ics")
async def generate_ics(req: IcsRequest):
    if not req.events:
        raise HTTPException(status_code=400, detail="Keine Events übergeben.")

    cal = Calendar()
    cal.add("prodid",        "-//Stundenplan Generator//fhla//DE")
    cal.add("version",       "2.0")
    cal.add("calscale",      "GREGORIAN")
    cal.add("method",        "PUBLISH")
    cal.add("x-wr-calname",  "Stundenplan HS Landshut")
    cal.add("x-wr-timezone", "Europe/Berlin")

    def parse_dt(s: str) -> datetime:
        s = s.replace("Z", "+00:00").strip()
        try:
            return datetime.fromisoformat(s)
        except ValueError:
            return datetime.fromisoformat(s[:19])

    for ev in req.events:
        ie = Event()
        ie.add("summary", ev.get("summary", "Veranstaltung"))
        ie.add("dtstart", parse_dt(ev["dtstart"]))
        ie.add("dtend",   parse_dt(ev.get("dtend") or ev["dtstart"]))
        ie.add("dtstamp", datetime.now(timezone.utc))
        if ev.get("location"):
            ie.add("location",    vText(ev["location"]))
        if ev.get("description"):
            ie.add("description", vText(ev["description"]))
        uid = re.sub(r"\s+", "-", f"{ev.get('dtstart','')}-{ev.get('summary','')}-{FH}")
        ie.add("uid", uid + "@stundenplan-gen")
        cal.add_component(ie)

    return StreamingResponse(
        BytesIO(cal.to_ical()),
        media_type="text/calendar",
        headers={"Content-Disposition": "attachment; filename=stundenplan.ics"},
    )


# ── Data helpers ──────────────────────────────────────────────────

def week_mondays(date_from: str, date_to: str):
    start   = date.fromisoformat(date_from)
    end     = date.fromisoformat(date_to)
    current = start - timedelta(days=start.weekday())
    while current <= end:
        yield current
        current += timedelta(weeks=1)

def primuss_date(d: date) -> str:
    return f"{d.month}/{d.day}/{d.year}"

def dedupe_events(events: list[dict]) -> list[dict]:
    seen, out = set(), []
    for ev in events:
        key = (ev.get("summary", ""), ev.get("dtstart", ""))
        if key not in seen:
            seen.add(key)
            out.append(ev)
    return out

def normalize_event(raw) -> dict | None:
    if not isinstance(raw, dict):
        return None

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
    time_to   = get("Ende",   "ende",   "EndTime",   "Bis", "bis", "end",   "dtend")

    def build_iso(d: str, t: str) -> str | None:
        if not d:
            return None
        d = d.strip()
        t = (t or "00:00").strip()
        if re.match(r"\d{1,2}/\d{1,2}/\d{4}", d):
            p = d.split("/")
            d = f"{p[2]}-{int(p[0]):02d}-{int(p[1]):02d}"
        if re.match(r"^\d:\d{2}$", t):
            t = "0" + t
        if re.match(r"^\d{2}:\d{2}:\d{2}$", t):
            t = t[:5]
        return f"{d}T{t}:00"

    dtstart = raw.get("dtstart") or raw.get("start") or build_iso(date_str, time_from)
    dtend   = raw.get("dtend")   or raw.get("end")   or build_iso(date_str, time_to)

    if not dtstart:
        return None

    return {
        "summary":     summary,
        "dtstart":     str(dtstart),
        "dtend":       str(dtend) if dtend else str(dtstart),
        "location":    get("Raum", "raum", "Room", "room", "Ort", "location"),
        "description": "\n".join(filter(None, [
            get("Dozent","dozent","DozentName","Lehrer","lecturer") and
                f"Dozent: {get('Dozent','dozent','DozentName','Lehrer','lecturer')}",
            get("Art","art","Typ","typ","type") and
                f"Art: {get('Art','art','Typ','typ','type')}",
        ])),
        "_raw": raw,
    }

def extract_items(data) -> list | None:
    if isinstance(data, list):
        flat = []
        for item in data:
            if isinstance(item, list):
                flat.extend(item)
            else:
                flat.append(item)
        return flat or None
    if isinstance(data, dict):
        for key in ("list", "data", "rows", "events", "items", "result",
                    "veranstaltungen", "termine", "stundenplan"):
            v = data.get(key)
            if isinstance(v, list):
                return extract_items(v)
    return None


# Static frontend — must be last
app.mount("/", StaticFiles(directory="public", html=True), name="static")
