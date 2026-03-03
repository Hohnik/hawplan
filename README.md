# Stundenplan Generator

Export your **HS Landshut** Primuss timetable as an `.ics` calendar file.

## Quick Start

```bash
# 1. Clone & setup
git clone <repo>
cd stundenplan_generator
uv sync

# 2. Configure credentials
cp .env.example .env
# Edit .env with your HS Landshut credentials

# 3. Run
uv run python run.py
# Open http://localhost:8000
```

## `.env` Configuration

```env
USERNAME=s-mustermann       # HS Landshut username
PASSWORD=your_password      # HS Landshut password
TOTP_SECRET=ABC123...       # TOTP secret (from otpauth:// link) — optional but recommended
STGRU=165                   # Study group ID — optional (skip group picker)
```

With all four values set, the login is **fully automatic** — one click.

## How It Works

1. **🚀 Einloggen** — Authenticates via Shibboleth SSO (credentials + TOTP from `.env`)
2. **📚 Studiengruppe wählen** — Pick your group from a searchable list (e.g. `IF4`)
3. **📅 ICS herunterladen** — Review events, deselect unwanted ones, download `.ics`

## Tech Stack

- **Backend:** Python 3.13 + FastAPI + httpx + pyotp + icalendar
- **Frontend:** Lit web components (CDN, no build step)
- **Auth:** Automated Shibboleth SSO with Fudis MFA support

## Project Structure

```
main.py              # All backend logic (~350 lines)
run.py               # uvicorn launcher
public/
  index.html         # Minimal HTML shell
  global.css         # Design tokens
  js/
    app-shell.js     # View router + API calls
    login-view.js    # Login + group picker
    timetable-view.js # Event list + ICS download
    shared-styles.js  # Shared Lit CSS
```

## API Endpoints

| Method | Path             | Description                          |
|--------|------------------|--------------------------------------|
| GET    | `/api/status`    | Check `.env` configuration           |
| POST   | `/api/login`     | Shibboleth SSO login (phase 1)       |
| POST   | `/api/login/mfa` | Submit TOTP code (phase 2)           |
| POST   | `/api/timetable` | Fetch all events for current semester |
| POST   | `/api/ics`       | Generate `.ics` calendar file        |
