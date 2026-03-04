/**
 * Client-side ICS calendar generation with recurring event support.
 *
 * Events sharing the same course + day + time slot are grouped.
 * Consecutive runs at a consistent interval (7 or 14 days) become
 * a single VEVENT with RRULE. Gaps split into separate series.
 * Isolated events stay as individual VEVENTs.
 */

function icsTs(s) {
  return s.replace(/[-:]/g, '').replace('T', 'T').slice(0, 15);
}

function icsNow() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '').slice(0, 15) + 'Z';
}

function fold(line) {
  const out = [];
  while (line.length > 75) { out.push(line.slice(0, 75)); line = ' ' + line.slice(75); }
  out.push(line);
  return out.join('\r\n');
}

function escText(s) {
  return (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;')
    .replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function diffDays(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

/** Find the most common interval (7 or 14) between sorted events. */
function detectInterval(evs) {
  const counts = new Map();
  for (let i = 1; i < evs.length; i++) {
    const d = diffDays(evs[i - 1].dtstart, evs[i].dtstart);
    if (d === 7 || d === 14) counts.set(d, (counts.get(d) || 0) + 1);
  }
  let best = 7, bestN = 0;
  for (const [d, n] of counts) {
    if (n > bestN) { best = d; bestN = n; }
  }
  return best;
}

/** Split sorted events into consecutive runs at the given interval. */
function findRuns(evs, interval) {
  const runs = [];
  let i = 0;
  while (i < evs.length) {
    let j = i + 1;
    while (j < evs.length && diffDays(evs[j - 1].dtstart, evs[j].dtstart) === interval) j++;
    runs.push(evs.slice(i, j));
    i = j;
  }
  return runs;
}

/** Group events into series (RRULE) and singles. */
function buildEntries(events) {
  const groups = new Map();
  for (const ev of events) {
    const day = new Date(ev.dtstart).getDay();
    const time = ev.dtstart.slice(11, 16) + '-' + (ev.dtend || ev.dtstart).slice(11, 16);
    const key = `${ev.lv_id || ev.summary}|${day}|${time}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ev);
  }

  const entries = [];
  for (const evs of groups.values()) {
    evs.sort((a, b) => a.dtstart.localeCompare(b.dtstart));
    if (evs.length === 1) { entries.push({ ev: evs[0] }); continue; }

    const interval = detectInterval(evs);
    for (const run of findRuns(evs, interval)) {
      if (run.length >= 2) {
        entries.push({ ev: run[0], count: run.length, interval });
      } else {
        entries.push({ ev: run[0] });
      }
    }
  }
  return entries;
}

export function buildICS(events) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HAWplan//stundenplan-gen//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Stundenplan HS Landshut',
    'X-WR-TIMEZONE:Europe/Berlin',
  ];

  for (const entry of buildEntries(events)) {
    const ev = entry.ev;
    const name = ev.fach_name || ev.summary;
    const uid = `${icsTs(ev.dtstart)}-${escText(ev.summary).slice(0, 40)}@hawplan`;

    lines.push('BEGIN:VEVENT');
    lines.push(fold(`UID:${uid}`));
    lines.push(`DTSTAMP:${icsNow()}`);
    lines.push(`DTSTART:${icsTs(ev.dtstart)}`);
    lines.push(`DTEND:${icsTs(ev.dtend || ev.dtstart)}`);
    if (entry.count) {
      const intv = entry.interval === 14 ? ';INTERVAL=2' : '';
      lines.push(`RRULE:FREQ=WEEKLY${intv};COUNT=${entry.count}`);
    }
    lines.push(fold(`SUMMARY:${escText(name)}`));
    if (ev.location) lines.push(fold(`LOCATION:${escText(ev.location)}`));
    if (ev.description) lines.push(fold(`DESCRIPTION:${escText(ev.description)}`));
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICS(events, filename = 'stundenplan.ics') {
  const text = buildICS(events);
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob), download: filename,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}
