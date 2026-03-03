# Logbook

## 2026-03-03 — Auto-login + cookie bug fixes

**Bugs fixed:**
- `parse_cookies`: DevTools wraps long cookie names with `\n ` when you copy them. The shibboleth session cookie name is 90+ chars, always gets wrapped. Fixed with `re.sub(r"[\r\n]+[ \t]*", "", ...)` before parsing — rejoins the split key correctly.
- Previous `normalize_event` / `extract_items` crash on `list` items (Primuss returns `[[ev,ev],[ev]]`) — fixed in prior commit.

**Auto-login (Shibboleth SSO automation):**
- Added `FormExtractor(HTMLParser)` — parses all `<form>` elements + input fields from HTML without external dependencies.
- Added `/api/login` endpoint + `shibboleth_login()` async function: follows redirects to IDP → injects credentials into the login form (detects `j_username`/`j_password` and common variants) → POSTs SAML assertion to SP ACS → extracts final cookies + Session/User from the redirect URL.
- Added `detect_stgru()`: after login, fetches the Primuss main page and tries to regex-extract the stgru value so the user doesn't need to find it manually.
- Frontend: `step-credentials` now has a tab bar — "✨ Automatisch" (username/password → pre-fills everything) vs "🔑 Manuell" (copy-paste cookies fallback).

## 2026-03-03 — Initial build

**Decisions:**
- Investigated Primuss auth: uses **Shibboleth SSO** (SAML2 via university IDP). Automating login is impractical; chose "copy-your-cookies" approach instead — user logs in once in browser, copies `PHPSESSID` + `_shibsession_…` cookies and the `Session`/`User` URL params.
- Discovered the timetable endpoint is a week-by-week `POST method=list` with form fields: `showdate`, `viewtype=week`, `timezone`, `Session`, `User`, `mode=calendar`, `stgru` (Studiengruppe ID). Backend iterates every week in the semester range (max 3 concurrent requests).
- Tech stack: **FastAPI** (Python 3.13) backend + **Lit** web components frontend. No JS build step — native ES modules + CDN Lit import. Keeps the project simple to run with just `uv run python run.py`.

**Implemented:**
- `main.py`: FastAPI app with `/api/fetch-all` (week iterator + event normaliser) and `/api/generate-ics` (iCalendar generator with stable UIDs to prevent duplicate imports).
- Frontend split into 4 Lit components: `<app-shell>` (step router + owns all API calls), `<step-credentials>` (form), `<step-events>` (filterable event list), `<step-done>` (success).
- Shared CSS design tokens in `global.css` (pierce shadow DOM via custom properties); reusable Lit `css` block in `shared-styles.js`.
