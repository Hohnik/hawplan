# TODO

## Done
- [x] Shibboleth SSO auto-login (username + password + TOTP)
- [x] Course group picker (160 groups from Primuss)
- [x] Primuss event parsing (list format with metadata dict)
- [x] ICS generation with stable UIDs
- [x] Auto-detect current semester dates
- [x] .env credentials (USERNAME, PASSWORD, TOTP_SECRET)
- [x] Full codebase refactor (clean naming, reduced files, better UX)
- [x] Event grouping into courses (341 events → 14 courses for IF4)
- [x] Multi-group selection (load from multiple study groups)
- [x] Visual week preview grid (<week-grid> component)
- [x] Session caching (30-min TTL, skip login on refresh)
- [x] Faculty/program accordion — groups organized by program prefix
- [x] Full course names — fach_name shown as primary, fach_kurzform as tag
- [x] Default to no selection — users opt-in to courses
- [x] Design polish — better contrast, spacing, sizing, consistent tokens

## Next
- [ ] Validate session caching end-to-end (cached cookies survive refresh)
- [ ] Test ICS import in Google Calendar / Apple Calendar
- [ ] Test with multiple groups loaded simultaneously

## Further Considerations
- [ ] Remember last-used study groups in localStorage
- [ ] Conflict detection — highlight overlapping time slots in red
- [ ] Course search within loaded groups (not just group search)
- [ ] Light theme toggle (prefers-color-scheme media query)
- [ ] Mobile: responsive card layout, touch-friendly chip sizes
- [ ] Persist course selection in localStorage across sessions
- [ ] Show semester date range in UI header
- [ ] Better error recovery: retry button on failed group loads
- [ ] Keyboard navigation: arrow keys in program list, Enter to toggle
- [ ] Export shareable link with selected groups + courses encoded
