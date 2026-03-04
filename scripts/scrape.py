#!/usr/bin/env python3
"""
Scrape all Primuss timetables → static JSON files.

Authenticates once via Shibboleth SSO, then fetches every study group's
events for the current semester. Output:
  public/data/tree.json            — course group tree
  public/data/groups/<stgru>.json  — events per study group

Usage:  uv run scripts/scrape.py
Env:    USERNAME, PASSWORD, TOTP_SECRET
"""

import sys, os, json, asyncio
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pathlib import Path
from main import (
    _shibboleth_login, _parse_cookies, _current_semester,
    _week_mondays, _primuss_date, _normalize_event, _dedupe,
    PRIMUSS_URL, FH, LANG, SEM, _UA, _USERNAME, _PASSWORD,
)
import httpx

DATA = Path(__file__).resolve().parent.parent / "public" / "data"


async def fetch_group(stgru: str, session: dict, http_sem: asyncio.Semaphore) -> list[dict]:
    """Fetch all events for one study group across the semester."""
    cookies = _parse_cookies(session["cookies"])
    sem_start, sem_end = _current_semester()
    mondays = list(_week_mondays(sem_start, sem_end))
    base = {"viewtype": "week", "timezone": "1", "mode": "calendar",
            "Session": session["session"], "User": session["user"], "stgru": stgru}

    async def fetch_week(client, monday):
        async with http_sem:
            try:
                r = await client.post(
                    f"{PRIMUSS_URL}?FH={FH}&Language={LANG}&sem={SEM}&method=list",
                    data={**base, "showdate": _primuss_date(monday)},
                    cookies=cookies, timeout=15,
                    headers={"User-Agent": _UA,
                             "X-Requested-With": "XMLHttpRequest",
                             "Accept": "application/json",
                             "Content-Type": "application/x-www-form-urlencoded"})
                return r.json() if r.status_code == 200 else None
            except Exception:
                return None

    async with httpx.AsyncClient(follow_redirects=False) as client:
        results = await asyncio.gather(*[fetch_week(client, m) for m in mondays])

    events = []
    for data in results:
        if isinstance(data, dict):
            for raw in data.get("events", []):
                ev = _normalize_event(raw)
                if ev:
                    events.append(ev)
    return _dedupe(events)


async def main():
    if not (_USERNAME and _PASSWORD):
        print("ERROR: Set USERNAME, PASSWORD, TOTP_SECRET in .env or environment")
        sys.exit(1)

    print("🔐 Authenticating…")
    session = await _shibboleth_login(_USERNAME, _PASSWORD)
    tree = session["course_tree"]

    # Save tree
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / "groups").mkdir(exist_ok=True)
    (DATA / "tree.json").write_text(json.dumps(tree, ensure_ascii=False, separators=(",", ":")))

    # Collect all groups
    groups = [g for fac in tree for deg in fac.get("degrees", [])
              for prog in deg.get("programs", []) for g in prog.get("groups", [])]
    print(f"📋 {len(groups)} groups\n")

    # Scrape in batches of 5 concurrent groups, 6 concurrent HTTP requests
    http_sem = asyncio.Semaphore(6)
    batch_size = 5
    ok = 0

    for i in range(0, len(groups), batch_size):
        batch = groups[i:i + batch_size]
        tasks = [fetch_group(g["stgru"], session, http_sem) for g in batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for g, result in zip(batch, results):
            idx = i + batch.index(g) + 1
            if isinstance(result, Exception):
                print(f"  [{idx:3d}/{len(groups)}] {g['label']:8s} ✗ {result}")
            else:
                (DATA / "groups" / f"{g['stgru']}.json").write_text(
                    json.dumps(result, ensure_ascii=False, separators=(",", ":")))
                ok += 1
                print(f"  [{idx:3d}/{len(groups)}] {g['label']:8s} → {len(result):4d} events")

    print(f"\n✓ {ok}/{len(groups)} groups scraped")


if __name__ == "__main__":
    asyncio.run(main())
