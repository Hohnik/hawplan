# TODO

## Done
- [x] Shibboleth SSO auto-login (username + password + TOTP)
- [x] Course group picker (160 groups from Primuss)
- [x] Primuss event parsing (list format with metadata dict)
- [x] ICS generation with stable UIDs
- [x] Auto-detect current semester dates
- [x] .env credentials (USERNAME, PASSWORD, TOTP_SECRET)
- [x] Event grouping into courses (341 events → 14 courses for IF4)
- [x] Multi-group selection (load from multiple study groups)
- [x] Visual week preview grid (<week-grid> component)
- [x] Faculty → Degree → Program tree from Primuss HTML
- [x] Full course names — fach_name shown as primary, fach_kurzform as tag
- [x] Default to no selection — users opt-in to courses
- [x] Design polish — better contrast, spacing, sizing, consistent tokens
- [x] Server-side session — auto-login, auto-refresh, no login page
- [x] Cluster-based week grid — only overlapping events share column width

## Next
- [ ] Test ICS import in Google Calendar / Apple Calendar
- [ ] Test with multiple groups loaded simultaneously

## Further Considerations
- [ ] Remember last-used study groups in localStorage
- [ ] Conflict detection — highlight overlapping time slots in red
- [ ] Course search within loaded groups (not just group search)
- [ ] Mobile: responsive card layout, touch-friendly chip sizes
- [ ] Persist course selection in localStorage across sessions
- [ ] Show semester date range in UI header
