# Logbook

## 2026-03-03 — Full refactor

**Complete rewrite** of backend and frontend for readability, reduced size, and better UX.

**Backend (`main.py` — ~350 lines, down from ~800):**
- Rewrote `normalize_event()` for actual Primuss list format: `[idx, text, start, end, ..., meta_dict, ..., room]`
- Replaced `extract_items()` with simple `data.get("events", [])` — no more generic dict-key guessing
- Removed `date_from`/`date_to` from request — auto-calculates via `current_semester()`
- Cleaned API routes: `/api/status`, `/api/login`, `/api/login/mfa`, `/api/timetable`, `/api/ics`
- Removed trace endpoint (debug-only, not needed in production)
- Renamed all internal helpers for clarity (`FormExtractor` → `FormParser`, `_mfa_store` helpers, etc.)

**Frontend (4 files, down from 6):**
- `login-view.js` — replaces `step-credentials.js`: login + group picker in one component, no manual cookie tab
- `timetable-view.js` — replaces `step-events.js` + `step-done.js`: event list + download + done state inline
- `app-shell.js` — simplified routing: `'login'` → `'timetable'`
- Deleted: `step-credentials.js`, `step-events.js`, `step-done.js`, `style.css`, `app.js`

**UX flow (3 clicks):**
1. Click **🚀 Einloggen** (credentials + TOTP from `.env`)
2. Click study group from searchable grid (e.g. `IF4`)
3. Review events → click **📅 ICS herunterladen**

**Verified live:** login → auto-TOTP → 160 groups → 341 events/week parsed correctly with room + lecturer.

## 2026-03-03 — .env credentials + trace-based diagnosis

**Root cause confirmed via trace:** credentials in `.env` were rejected by the IDP (same login form returned at e1s2 instead of advancing to MFA). Not a code issue — IDP is reporting wrong username/password.

**Changes:**
- `load_dotenv()` on startup; `_ENV_USERNAME`/`_ENV_PASSWORD` used as fallback in all login endpoints.
- `LoginRequest` fields now optional — fall back to env vars when empty.
- `GET /api/auth-status` tells frontend whether `.env` is configured and which username is loaded.
- `POST /api/login/trace` also uses env fallback — run `curl -X POST http://localhost:8000/api/login/trace -H "Content-Type: application/json" -d '{}'` to diagnose.
- `_login_trace_impl()` extracted as shared helper (was duplicated).
- `step-credentials`: when env is configured shows a single 🚀 button instead of username/password form.
- `.env` added to `.gitignore`.

## 2026-03-03 — Auto-login + cookie bug fixes

**Bugs fixed:**
- `parse_cookies`: DevTools wraps long cookie names with `\n ` when you copy them. The shibboleth session cookie name is 90+ chars, always gets wrapped. Fixed with `re.sub(r"[\r\n]+[ \t]*", "", ...)` before parsing — rejoins the split key correctly.
- Previous `normalize_event` / `extract_items` crash on `list` items (Primuss returns `[[ev,ev],[ev]]`) — fixed in prior commit.

**Auto-login (Shibboleth SSO automation):**
- Added `FormExtractor(HTMLParser)` — parses all `<form>` elements + input fields from HTML without external dependencies.
- Added `/api/login` endpoint + `shibboleth_login()` async function.
- Added `detect_stgru()`: after login, fetches the Primuss main page and tries to regex-extract the stgru value so the user doesn't need to find it manually.
- Frontend: `step-credentials` now has a tab bar — "✨ Automatisch" (username/password → pre-fills everything) vs "🔑 Manuell" (copy-paste cookies fallback).

**Shibboleth multi-step login fix:**
- Traced the real IDP flow: `e1s1` is a "local storage check" form (no credentials, submit as-is) → `e1s2` is the actual login form (`j_username`/`j_password`).
- Previous code assumed the first form was the login form, injected credentials into the local storage check, which the IDP silently ignored → 401.
- Fixed `shibboleth_login()` to loop through form steps generically: submit as-is until a password field is detected, then inject credentials. Handles up to 6 steps before giving up.

## 2026-03-03 — Initial build

**Decisions:**
- Investigated Primuss auth: uses **Shibboleth SSO** (SAML2 via university IDP). Automating login is impractical; chose "copy-your-cookies" approach instead — user logs in once in browser, copies `PHPSESSID` + `_shibsession_…` cookies and the `Session`/`User` URL params.
- Discovered the timetable endpoint is a week-by-week `POST method=list` with form fields: `showdate`, `viewtype=week`, `timezone`, `Session`, `User`, `mode=calendar`, `stgru` (Studiengruppe ID). Backend iterates every week in the semester range (max 3 concurrent requests).
- Tech stack: **FastAPI** (Python 3.13) backend + **Lit** web components frontend. No JS build step — native ES modules + CDN Lit import. Keeps the project simple to run with just `uv run python run.py`.

**Implemented:**
- `main.py`: FastAPI app with `/api/fetch-all` (week iterator + event normaliser) and `/api/generate-ics` (iCalendar generator with stable UIDs to prevent duplicate imports).
- Frontend split into 4 Lit components: `<app-shell>` (step router + owns all API calls), `<step-credentials>` (form), `<step-events>` (filterable event list), `<step-done>` (success).
- Shared CSS design tokens in `global.css` (pierce shadow DOM via custom properties); reusable Lit `css` block in `shared-styles.js`.
