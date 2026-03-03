# Logbook

## 2026-03-03 — Faculty→Degree→Program tree from Primuss HTML

**Real hierarchy parsed:** Rewrote `_parse_course_groups()` to extract the full Primuss tree structure: Faculty (orga) → Degree (Bachelor/Master/Sonstige) → Program (stg) → Semester groups. Uses a position-based strategy — locates all structural elements (`<label for="orga_N">`, degree text nodes, `<input id="stg_N">`) by their position in the HTML, then walks them in document order to reconstruct ancestry. This avoids nested `<ol>` regex problems entirely.

**Result:** 7 faculties (BW, ET/WI, GKM, IF, MB, SA, SSG), 57 programs, 160 semester groups. Each group carries: `faculty`, `degree`, `program_code`, `program_name`, `stg`, `stgru`, `label`.

**API returns both:** `course_tree` (hierarchical, for accordion rendering) and `course_groups` (flat, for compatibility). Frontend now receives `courseTree` prop.

**3-level accordion in frontend:** timetable-view renders Faculty → Degree → Program → chips. Each level is independently expandable. Search auto-expands all levels to matching items and also matches against program names (e.g. "informatik" finds IF faculty programs). Indentation via padding-left (0.75→1.5→2.25→3rem).

**Padding fix:** User reported 0 padding — increased `:host` padding to `1.25rem 1.5rem` and `.stack` gap to `1rem`.

## 2026-03-03 — Full names in grid, program names from Primuss HTML, spacing fix

**Full names in timetable grid:** Week grid events now show `fullName` (e.g. "Internet of Things") instead of the short code ("IoT"). Long names truncate with ellipsis; hover tooltip shows the complete name. Changed in `_previewSlots` — `label` is now `c.fullName || c.summary`.

**Program names from HTML:** Backend now parses `<li title="...">` attributes from the Primuss landing page. Title format is `"Name (Degree) Name (Type) N. Semester"` — regex `r'(.+?\([^)]+\))'` extracts the first `"Name (Degree)"` portion. Each group now has a `program_name` field (e.g. "Internationale Betriebswirtschaft (MA)"). Accordion headers display: `MIB — Internationale Betriebswirtschaft (MA) · 4`. Search also matches against program names (e.g. typing "informatik" finds IF groups). Regex handles `title` before or after `onclick` attribute.

**Stack spacing:** Increased `:host` padding (`1.15rem 1.35rem` → `1.25rem 1.5rem`) and `.stack` gap (`0.85rem` → `1rem`) for more breathing room between card borders and content.

## 2026-03-03 — Faculty grouping, full names, design polish

**Faculty/program accordion:** Replaced flat chip list ("… 108 weitere") with an accordion grouped by program prefix (IF, WIF, KI, etc.). Each program row is expandable; shows group count and how many are loaded. Search auto-expands all matching programs. Eliminates the 50-item cutoff entirely — all 160 groups accessible via ~20 collapsed program rows.

**Full course names:** Course cards now show `fach_name` (e.g. "Internet of Things") as the primary display name, with `fach_kurzform` (e.g. "IoT") as a small tag. The `_groupEvents()` method also fills `fullName` from any event in the group (not just the first). Week grid keeps short codes as labels (space-limited) but shows full names in hover tooltips.

**Default to no selection:** Removed auto-select on group load. Users now opt-in to each course. The calendar starts empty — cleaner initial state, forces intentional choices.

**Design polish (global.css + shared-styles.js):**
- `--muted` brightened (`#8b8fa8` → `#919bab`) for better contrast on dark surfaces (now ~5.4:1 on surface)
- `--border` brightened (`#2a2d3e` → `#2d3343`) for more visible structure
- `--surface` darkened slightly (`#1a1d27` → `#151b23`) for better card/bg separation
- Card padding tightened (`1.75rem 2rem` → `1.15rem 1.35rem`) — less wasted space
- Header reduced (h1 `2rem` → `1.5rem`) — less vertical consumption
- Button padding refined, input sizing consistent
- Added mobile media query for `<500px` screens
- System font stack simplified to `-apple-system, BlinkMacSystemFont, 'Segoe UI'`

**Code reduction:** `timetable-view.js` rewritten from 488 → ~300 lines. Removed info tooltip (replaced by inline full name display), simplified done state, replaced `hashColor` → `colorOf`, `_buildCourses` → `_groupEvents`. Checkbox uses `pointer-events: none` (purely visual indicator, div handles click).

**Backend:** Added `program` field to course groups — extracted from label prefix via `re.match(r'[A-Za-z]+', label)`. Frontend uses this for accordion grouping.

## 2026-03-03 — Course grouping, multi-group, week preview, session cache

**Course grouping:** Events are now grouped by `summary` into courses. For IF4, 341 individual events → 14 courses. Each course card shows all time slots (e.g. "Mo 08:45–10:15 | Di 14:30–16:00"), lecturer, rooms, and occurrence count (e.g. "30×"). Users select/deselect entire courses, not individual events.

**Multi-group selection:** Users can load courses from multiple study groups simultaneously. Click a group chip (e.g. IF4) to load its courses, click another (e.g. KI2) to add more. Each group's courses are listed separately with Alle/Keine toggles. Loaded groups shown as removable chips with ✕.

**Week preview grid:** New `<week-grid>` component renders a visual weekly timetable (Mon–Fri, 08:00–20:00) using CSS grid with 48 quarter-hour rows. Selected courses appear as colored blocks (deterministic color per course via name hash). Rooms shown on larger blocks, hover for full details.

**Session cache (30-min TTL):** `GET /api/session` returns cached login data. On page refresh, app-shell checks for cached session and skips login entirely if valid. Invalidated on 401 from timetable endpoint. Eliminates ~5s Shibboleth login on every page load.

**Login-view simplified:** Group picker removed (now in timetable-view). Login-view just handles auth and emits `login-success` with session + course groups.

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
