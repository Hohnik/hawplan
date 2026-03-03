# TODO

## Blocking
- [ ] **Verify Primuss JSON shape** — capture a real `/api/fetch-all` response (session was expired during dev). Adjust `normalize_event()` in `main.py` and `_fmtDt` / rendering in `step-events.js` to match actual field names.
- [ ] **Test ICS import** — validate the generated `.ics` in Google Calendar and Apple Calendar once real event data is available.

## Enhancements
- [ ] **Auto-detect stgru** — after a successful session, fetch the user's default study group from Primuss instead of making them find it manually.
- [ ] **Persist form values** — save cookies/session/stgru to `sessionStorage` so a page reload doesn't wipe everything.
- [ ] **Recurring events** — if Primuss returns repeating lectures (same name, same time, different dates), collapse them into `RRULE` in the ICS instead of individual events.
- [ ] **Error recovery per week** — currently a timeout on one week is silently skipped; surface a warning in the UI showing which weeks failed.
- [ ] **CORS hardening** — restrict `CORSMiddleware` to `localhost` only (not `*`) since the backend is only meant to run locally.

## Nice to have
- [ ] Dark/light theme toggle
- [ ] Show a per-week progress indicator while loading (SSE or polling)
- [ ] Export to `.csv` as alternative to ICS
