# Stundenplan Generator — HS Landshut

Export your Primuss timetable to a `.ics` file that you can import into any calendar app.

## Run

```bash
uv run python run.py
# → opens on http://localhost:8000
```

## How it works

1. You log in to Primuss normally in your browser
2. You copy three things from DevTools (F12 → Network):
   - The `Cookie:` header value (`PHPSESSID=…; _shibsession_…=…`)
   - `Session=…` and `User=…` from the URL bar
   - `stgru=…` from the POST payload of any calendar request
3. You pick a semester date range
4. The app fires a POST to `method=list` for **every week** in that range  
   (concurrency-limited to 3 parallel requests, so Primuss doesn't get hammered)
5. All events are deduplicated, sorted, and displayed as checkboxes
6. You pick what you want → download `.ics`

## Technical overview

```
main.py          FastAPI app
  POST /api/fetch-all    → iterates weeks, normalizes events
  POST /api/generate-ics → builds iCalendar file
  GET  /                 → serves public/

public/
  index.html   3-step UI
  style.css    Dark theme
  app.js       Fetch + ICS download logic
```

## Why not just automate the login?

Primuss uses **Shibboleth SSO** (SAML2 federated login via the university IDP).  
Replicating that flow requires handling SAML assertions, signed XML, and the university's IDP endpoint — way more complexity than just copying two cookies that are valid for your whole browser session.
