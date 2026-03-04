/** Shared helpers for the timetable app. */

export const PALETTE = [
  '#FF8400','#7C5CFC','#00AA55','#FF5C33','#22d3ee',
  '#fb923c','#e879f9','#f0c541','#2dd4bf','#f87171',
  '#818cf8','#a3e635','#fbbf24','#34d399','#ff6b9d',
];

export function colorOf(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export const DAY_NAMES = ['So','Mo','Di','Mi','Do','Fr','Sa'];

export function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y) / 86400000 + 1) / 7);
}

export function fmtDate(s) {
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.`;
}

/** Count real time conflicts — only when slots share at least one week. */
export function countConflicts(slots) {
  let n = 0;
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i], b = slots[j];
      if (a.day !== b.day || a.start >= b.end || b.start >= a.end) continue;
      if (a.weeks?.size && b.weeks?.size) {
        let shared = false;
        for (const w of a.weeks) { if (b.weeks.has(w)) { shared = true; break; } }
        if (!shared) continue;
      }
      n++;
    }
  }
  return n;
}

/** Group raw Primuss events by course (lv_id or summary). */
export function groupEvents(events, group) {
  const map = new Map();
  for (const ev of events) {
    const name = (ev.summary || '').trim();
    if (!name) continue;
    const key = ev.lv_id || name;
    if (!map.has(key)) {
      map.set(key, {
        id: `${group.stgru}::${key}`, summary: name, fullName: '',
        groupLabel: group.label, slots: [], events: [],
        lecturer: '', rooms: new Set(),
      });
    }
    const c = map.get(key);
    if (!c.fullName && ev.fach_name) c.fullName = ev.fach_name;
    c.events.push(ev);
    try {
      const d = new Date(ev.dtstart);
      const day = d.getDay(), wk = isoWeek(d);
      const start = ev.dtstart.slice(11, 16);
      const end = (ev.dtend || ev.dtstart).slice(11, 16);
      const sk = `${day}-${start}-${end}`;
      let slot = c.slots.find(s => s.key === sk);
      if (!slot) {
        slot = { key: sk, day, start, end, room: ev.location || '', rhythmus: ev.rhythmus || '7', weeks: new Set() };
        c.slots.push(slot);
      }
      slot.weeks.add(wk);
    } catch {}
    if (ev.location) c.rooms.add(ev.location);
    const lec = ev.description?.match(/Dozent:\s*(.+)/);
    if (lec && !c.lecturer) c.lecturer = lec[1].trim();
  }
  return [...map.values()].sort((a, b) =>
    (a.fullName || a.summary).localeCompare(b.fullName || b.summary));
}
