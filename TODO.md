# TODO

## Blocking
- [ ] **Verify Primuss JSON shape** — capture a real `/api/fetch-all` response. The debug panel in step-events will show the raw items if field names don't match. Adjust `normalize_event()` accordingly.
- [ ] **Test ICS import** — validate the generated `.ics` in Google Calendar and Apple Calendar once real event data is available.
- [x] **Cookie newline bug** — fixed: `parse_cookies` now strips `\r\n` line-wrapping inserted by DevTools when copying long cookie names.
- [x] **Auto-login** — Shibboleth SSO flow automated via `FormExtractor` + `/api/login`.

## Enhancements
- [~] **Auto-detect stgru** — `detect_stgru()` implemented; needs real-world test to confirm the regex matches Primuss's actual HTML/JS output.
- [ ] **Persist form values** — save cookies/session/stgru to `sessionStorage` so a page reload doesn't wipe everything.
- [ ] **Recurring events** — if Primuss returns repeating lectures (same name, same time, different dates), collapse them into `RRULE` in the ICS instead of individual events.
- [ ] **Error recovery per week** — currently a timeout on one week is silently skipped; surface a warning in the UI showing which weeks failed.
- [ ] **CORS hardening** — restrict `CORSMiddleware` to `localhost` only (not `*`) since the backend is only meant to run locally.

## Nice to have
- [ ] Dark/light theme toggle
- [ ] Show a per-week progress indicator while loading (SSE or polling)
- [ ] Export to `.csv` as alternative to ICS
