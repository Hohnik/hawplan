/**
 * Client-side ICS calendar generation.
 * Produces a valid .ics file from an array of event objects.
 *
 * Each event: { summary, dtstart, dtend, location?, description? }
 * Date format: "YYYY-MM-DDTHH:MM:SS"
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

export function buildICS(events) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Stundenplan Generator//fhla//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Stundenplan HS Landshut',
    'X-WR-TIMEZONE:Europe/Berlin',
  ];

  for (const ev of events) {
    const uid = `${icsTs(ev.dtstart)}-${escText(ev.summary).slice(0, 40)}@stundenplan-gen`;
    const name = ev.fach_name || ev.summary;
    lines.push('BEGIN:VEVENT');
    lines.push(fold(`UID:${uid}`));
    lines.push(`DTSTAMP:${icsNow()}`);
    lines.push(`DTSTART:${icsTs(ev.dtstart)}`);
    lines.push(`DTEND:${icsTs(ev.dtend || ev.dtstart)}`);
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
