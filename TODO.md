# TODO

## Done
- [x] Shibboleth SSO auto-login (username + password + TOTP)
- [x] Course group picker (160 groups from Primuss)
- [x] Primuss event parsing (list format with metadata dict)
- [x] ICS generation with stable UIDs
- [x] Auto-detect current semester dates
- [x] .env credentials (USERNAME, PASSWORD, TOTP_SECRET)
- [x] Event grouping into courses
- [x] Multi-group selection (load from multiple study groups)
- [x] Visual week preview grid (<week-grid> component)
- [x] Faculty → Degree → Program tree from Primuss HTML
- [x] Full course names — fach_name shown as primary, fach_kurzform as tag
- [x] Server-side session — auto-login, auto-refresh, no login page
- [x] Cluster-based week grid — only overlapping events share column width
- [x] Saturday column — auto-shown when Saturday events exist
- [x] Even/odd week grids — biweekly courses shown in separate KW grids
- [x] Conflict marking — dashed outline on overlapping events
- [x] Rich hover tooltips — lecturer, rhythm, event count, week numbers
- [x] Clickable grid events → detail panel with individual dates
- [x] Pencil design alignment — solid fill events, English day headers, JetBrains Mono + Geist
- [x] Component extraction — course-picker, schedule-list, week-grid, helpers
- [x] Desktop split panel layout (380px left + flex right)
- [x] Mobile responsive — Courses/Schedule tab switcher
- [x] Conflict detection — "✓ No time conflicts" / "⚠ N conflicts" in bottom bar
- [x] UX redesign — search-first group picker, dropdown, active chips, flat course list
- [x] Fuzzy search for study groups
- [x] Fix mobile horizontal scroll (box-sizing in shadow DOM)
- [x] Remove unused Weekly/Bi-weekly legend
- [x] Static site conversion — pre-fetched JSON data, client-side ICS
- [x] GitHub Pages deployment + weekly auto-scrape via Actions
- [x] Repository secrets configured (PRIMUSS_USERNAME, PASSWORD, TOTP_SECRET)

## Next
- [ ] Test ICS import in Google Calendar / Apple Calendar
- [ ] Test with multiple groups loaded simultaneously
- [ ] localStorage persistence — remember last-used study groups + selections

## Further Considerations
- [ ] Course search within loaded groups (not just group search)
- [ ] Show semester date range dynamically in header
