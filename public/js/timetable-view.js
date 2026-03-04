import { LitElement, html, css } from 'https://esm.sh/lit@3';
import { shared } from './shared-styles.js';
import './week-grid.js';

const PALETTE = [
  '#6c8cff','#ff6b9d','#56d364','#f0c541','#c084fc',
  '#fb923c','#22d3ee','#f87171','#a3e635','#e879f9',
  '#2dd4bf','#fbbf24','#818cf8','#fb7185','#34d399',
];
function colorOf(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
const DAY = ['So','Mo','Di','Mi','Do','Fr','Sa'];

/** ISO week number */
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y) / 86400000 + 1) / 7);
}

/** Format DD.MM. */
function fmtDate(s) {
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.`;
}

/**
 * <timetable-view>
 * Self-initializing: fetches course tree on mount, then lets user
 * pick groups → select courses → preview → download ICS.
 */
export class TimetableView extends LitElement {
  static properties = {
    _courseTree:    { state: true },
    _initError:    { state: true },
    _loading:      { state: true },
    _query:        { state: true },
    _open:         { state: true },   // Set<string> — expanded accordion keys
    _loaded:       { state: true },   // Map<stgru, { label, courses[] }>
    _loadingStgru: { state: true },
    _selected:     { state: true },   // Set<courseId>
    _detailCourseId: { state: true }, // courseId shown in detail panel
    _error:        { state: true },
    _downloading:  { state: true },
    _done:         { state: true },
  };

  static styles = [shared, css`
    .center {
      display: flex; flex-direction: column; align-items: center;
      gap: 0.75rem; padding: 2rem 0;
    }
    .big-spinner {
      width: 28px; height: 28px; border-width: 3px;
      border-color: rgba(108,140,255,0.2); border-top-color: var(--accent);
    }

    /* ── Tree accordion ───────────────── */
    .tree {
      border: 1px solid var(--border); border-radius: var(--radius-sm);
      max-height: 340px; overflow-y: auto;
    }
    .tree::-webkit-scrollbar { width: 4px; }
    .tree::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 99px; }

    .row-fac, .row-deg, .row-prog {
      display: flex; align-items: center; gap: 0.45rem;
      cursor: pointer; transition: background 0.1s;
      border-bottom: 1px solid var(--border);
    }
    .row-fac:hover, .row-deg:hover, .row-prog:hover { background: var(--surface-2); }
    .tree > :last-child { border-bottom: none; }
    .row-fac  { padding: 0.5rem 0.75rem; font-size: 0.86rem; font-weight: 600; }
    .row-deg  { padding: 0.4rem 0.75rem 0.4rem 1.5rem; font-size: 0.8rem; color: var(--muted); font-weight: 600; }
    .row-prog { padding: 0.35rem 0.75rem 0.35rem 2.25rem; font-size: 0.8rem; }
    .arrow { color: var(--muted); font-size: 0.55em; width: 0.8em; flex-shrink: 0; }
    .prog-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .count { font-size: 0.72rem; color: var(--muted); margin-left: auto; flex-shrink: 0; }

    .chips-row {
      display: flex; flex-wrap: wrap; gap: 0.3rem;
      padding: 0.35rem 0.75rem 0.45rem 3rem;
      background: var(--bg); border-bottom: 1px solid var(--border);
    }

    /* ── Chips ─────────────────────────── */
    .loaded-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; }
    .loaded-label { font-size: 0.78rem; font-weight: 600; color: var(--muted); }

    .chip {
      padding: 0.22rem 0.55rem; font-size: 0.74rem;
      border-radius: 99px; border: 1px solid var(--border);
      background: var(--bg); color: var(--muted);
      cursor: pointer; transition: all 0.12s;
      display: inline-flex; align-items: center; gap: 0.2rem;
    }
    .chip:hover { border-color: var(--accent); color: var(--text); }
    .chip.active {
      background: var(--accent-bg); border-color: var(--accent);
      color: var(--accent); font-weight: 600;
    }
    .chip.loading { opacity: 0.5; pointer-events: none; }
    .chip .x { font-size: 0.55rem; opacity: 0.6; }
    .chip .x:hover { opacity: 1; }

    /* ── Course list ───────────────────── */
    .courses {
      display: flex; flex-direction: column; gap: 0.3rem;
      max-height: 460px; overflow-y: auto; padding-right: 2px;
    }
    .courses::-webkit-scrollbar { width: 4px; }
    .courses::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 99px; }

    .grp-hdr {
      display: flex; align-items: center; gap: 0.5rem;
      font-size: 0.75rem; font-weight: 600; color: var(--muted);
      text-transform: uppercase; letter-spacing: 0.03em;
      margin-top: 0.5rem; padding-bottom: 0.2rem;
      border-bottom: 1px solid var(--border);
    }
    .grp-hdr span:first-child { flex: 1; }

    .course {
      display: flex; align-items: flex-start; gap: 0.55rem;
      padding: 0.55rem 0.75rem;
      border: 1px solid var(--border); border-radius: var(--radius-sm);
      cursor: pointer; transition: border-color 0.12s;
      user-select: none; flex-wrap: wrap;
    }
    .course:hover { border-color: var(--border-2); }
    .course.on { border-color: var(--accent); background: var(--accent-bg); }
    .course input[type='checkbox'] {
      margin-top: 3px; accent-color: var(--accent);
      pointer-events: none; width: auto; flex-shrink: 0;
    }
    .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; margin-top: 6px; }

    .c-name {
      font-weight: 600; font-size: 0.86rem; line-height: 1.35;
      display: flex; align-items: baseline; gap: 0.35rem; flex-wrap: wrap;
    }
    .c-tag {
      font-size: 0.65rem; font-weight: 600;
      padding: 0.08rem 0.35rem; border-radius: 4px;
      background: var(--surface-2); color: var(--muted);
      white-space: nowrap; letter-spacing: 0.02em;
    }
    .c-meta {
      font-size: 0.76rem; color: var(--muted);
      margin-top: 2px; line-height: 1.5;
    }
    .c-biweekly {
      font-size: 0.65rem; font-weight: 600;
      padding: 0.05rem 0.35rem; border-radius: 4px;
      background: rgba(251,191,36,0.12); color: #fbbf24;
      white-space: nowrap;
    }
    .c-count {
      margin-left: auto; font-size: 0.72rem; color: var(--muted);
      white-space: nowrap; flex-shrink: 0; padding-top: 3px;
    }

    /* ── Detail panel (below grid) ───── */
    .detail {
      border: 1px solid var(--border); border-radius: var(--radius-sm);
      padding: 0.65rem 0.85rem; background: var(--bg);
    }
    .detail-hdr {
      display: flex; align-items: center; gap: 0.45rem;
      margin-bottom: 0.4rem;
    }
    .detail-hdr .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .detail-name { font-weight: 600; font-size: 0.88rem; }
    .detail-tag {
      font-size: 0.65rem; font-weight: 600;
      padding: 0.08rem 0.35rem; border-radius: 4px;
      background: var(--surface-2); color: var(--muted);
    }
    .detail-close {
      margin-left: auto; cursor: pointer;
      font-size: 0.72rem; color: var(--muted); opacity: 0.6;
    }
    .detail-close:hover { opacity: 1; }
    .detail-meta { font-size: 0.76rem; color: var(--muted); margin-bottom: 0.35rem; }
    .detail-slot-hdr {
      font-size: 0.72rem; font-weight: 600; color: var(--muted);
      margin-top: 0.3rem; margin-bottom: 0.15rem;
    }
    .detail-dates {
      font-size: 0.72rem; color: var(--muted); line-height: 1.7;
      display: flex; flex-wrap: wrap; gap: 0.15rem 0.4rem;
    }

    /* ── Grids section ─────────────────── */
    .grids { display: flex; flex-direction: column; gap: 0.75rem; }
    .grid-label {
      font-size: 0.78rem; font-weight: 600; color: var(--muted);
      display: flex; align-items: center; gap: 0.4rem;
    }

    /* ── Footer / Done ─────────────────── */
    .foot { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
    .stats { font-size: 0.82rem; color: var(--muted); flex: 1; }
    .done {
      text-align: center; padding: 1.5rem 0;
      display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
    }
    .done h3 { font-size: 1.05rem; color: var(--success); }
  `];

  constructor() {
    super();
    this._courseTree = [];
    this._initError = '';
    this._loading = 'init';
    this._query = '';
    this._open = new Set();
    this._loaded = new Map();
    this._loadingStgru = null;
    this._selected = new Set();
    this._detailCourseId = null;
    this._error = '';
    this._downloading = false;
    this._done = false;
  }

  connectedCallback() { super.connectedCallback(); this._init(); }

  /* ═══ Init ═══════════════════════════════════════ */

  async _init() {
    this._loading = 'init';
    this._initError = '';
    try {
      const res = await fetch('/api/init');
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Fehler ${res.status}`);
      this._courseTree = data.course_tree || [];
    } catch (e) { this._initError = e.message; }
    this._loading = null;
  }

  /* ═══ Tree toggle ════════════════════════════════ */

  _toggleOpen(key) {
    const s = new Set(this._open);
    s.has(key) ? s.delete(key) : s.add(key);
    this._open = s;
  }

  /* ═══ Data loading ═══════════════════════════════ */

  async _loadGroup(g) {
    if (this._loaded.has(g.stgru) || this._loadingStgru) return;
    this._loadingStgru = g.stgru;
    this._error = '';
    try {
      const res = await fetch('/api/timetable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stgru: g.stgru }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Fehler ${res.status}`);
      const courses = this._groupEvents(data.events || [], g);
      const loaded = new Map(this._loaded);
      loaded.set(g.stgru, { label: g.label, courses });
      this._loaded = loaded;
    } catch (e) { this._error = e.message; }
    finally { this._loadingStgru = null; }
  }

  _unloadGroup(stgru) {
    const loaded = new Map(this._loaded);
    const group = loaded.get(stgru);
    loaded.delete(stgru);
    this._loaded = loaded;
    if (group) {
      const sel = new Set(this._selected);
      for (const c of group.courses) sel.delete(c.id);
      this._selected = sel;
      if (group.courses.some(c => c.id === this._detailCourseId))
        this._detailCourseId = null;
    }
  }

  _groupEvents(events, group) {
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
          slot = {
            key: sk, day, start, end,
            room: ev.location || '', rhythmus: ev.rhythmus || '7',
            weeks: new Set(),
          };
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

  /* ═══ Selection ══════════════════════════════════ */

  _toggle(id) {
    const s = new Set(this._selected);
    s.has(id) ? s.delete(id) : s.add(id);
    this._selected = s;
    if (!s.has(id) && this._detailCourseId === id) this._detailCourseId = null;
  }

  _onSlotClick(e) {
    const id = e.detail?.courseId;
    this._detailCourseId = this._detailCourseId === id ? null : id;
  }

  _selectGroup(stgru, on) {
    const g = this._loaded.get(stgru);
    if (!g) return;
    const s = new Set(this._selected);
    for (const c of g.courses) on ? s.add(c.id) : s.delete(c.id);
    this._selected = s;
  }

  /* ═══ Computed ═══════════════════════════════════ */

  get _allCourses() { return [...this._loaded.values()].flatMap(g => g.courses); }
  get _selectedCourses() { return this._allCourses.filter(c => this._selected.has(c.id)); }
  get _totalEvents() { return this._selectedCourses.reduce((n, c) => n + c.events.length, 0); }

  _buildSlots(parity) {
    return this._selectedCourses.flatMap(c => {
      const color = colorOf(c.id);
      return c.slots
        .filter(s => {
          if (!parity) return true;
          const wks = [...s.weeks];
          return parity === 'even'
            ? wks.some(w => w % 2 === 0)
            : wks.some(w => w % 2 !== 0);
        })
        .map(s => ({
          day: s.day, start: s.start, end: s.end,
          label: c.fullName || c.summary,
          tag: c.fullName && c.summary !== c.fullName ? c.summary : '',
          room: s.room, color, lecturer: c.lecturer,
          eventCount: c.events.length, courseId: c.id,
          rhythmus: s.rhythmus, weeks: s.weeks,
        }));
    });
  }

  get _hasBiweekly() {
    const all = this._buildSlots(null);
    return all.some(s => {
      const wks = [...(s.weeks || [])];
      if (wks.length < 2) return wks.length === 1; // single event = show in one grid
      const hasEven = wks.some(w => w % 2 === 0);
      const hasOdd  = wks.some(w => w % 2 !== 0);
      return !(hasEven && hasOdd);
    });
  }

  /* ═══ Download ═══════════════════════════════════ */

  async _download() {
    const events = this._selectedCourses.flatMap(c => c.events);
    if (!events.length) { this._error = 'Keine Kurse ausgewählt.'; return; }
    this._downloading = true; this._error = '';
    try {
      const res = await fetch('/api/ics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `Fehler ${res.status}`);
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(await res.blob()), download: 'stundenplan.ics',
      });
      a.click();
      URL.revokeObjectURL(a.href);
      this._done = true;
    } catch (e) { this._error = e.message; }
    finally { this._downloading = false; }
  }

  /* ═══ Render ═════════════════════════════════════ */

  render() {
    if (this._loading === 'init') {
      return html`<div class="center">
        <span class="spinner big-spinner"></span>
        <p class="hint">Verbinde mit Primuss…</p>
      </div>`;
    }
    if (this._initError) {
      return html`<div class="stack">
        <p class="error-msg">❌ ${this._initError}</p>
        <button class="btn-primary" @click=${this._init}>Erneut versuchen</button>
      </div>`;
    }
    if (this._done) {
      return html`<div class="stack">
        <div class="done">
          <h3>🎉 stundenplan.ics heruntergeladen</h3>
          <p class="hint">Öffne die Datei in Google Calendar, Apple Kalender oder Outlook.</p>
          <button class="btn-primary" @click=${() => { this._done = false; }}>← Zurück</button>
        </div>
      </div>`;
    }

    const allSlots = this._buildSlots(null);
    const biweekly = this._hasBiweekly;

    return html`<div class="stack">
      <h2>Stundenplan</h2>
      ${this._renderPicker()}
      ${this._loaded.size > 0 ? this._renderCourses() : ''}
      ${allSlots.length > 0 ? (biweekly
        ? this._renderBiweeklyGrids()
        : html`<week-grid .slots=${allSlots} @slot-click=${this._onSlotClick}></week-grid>`) : ''}
      ${this._detailCourseId ? this._renderDetail() : ''}
      ${this._error ? html`<p class="error-msg">❌ ${this._error}</p>` : ''}
      ${this._loaded.size > 0 ? this._renderFooter() : ''}
    </div>`;
  }

  _renderBiweeklyGrids() {
    return html`<div class="grids">
      <div>
        <div class="grid-label">📅 Ungerade KW</div>
        <week-grid .slots=${this._buildSlots('odd')} @slot-click=${this._onSlotClick}></week-grid>
      </div>
      <div>
        <div class="grid-label">📅 Gerade KW</div>
        <week-grid .slots=${this._buildSlots('even')} @slot-click=${this._onSlotClick}></week-grid>
      </div>
    </div>`;
  }

  _renderPicker() {
    const q = this._query.toLowerCase();
    const loadedKeys = new Set([...this._loaded.keys()]);

    return html`
      ${loadedKeys.size > 0 ? html`
        <div class="loaded-chips">
          <span class="loaded-label">Geladen:</span>
          ${[...this._loaded].map(([stgru, g]) => html`
            <span class="chip active">${g.label}
              <span class="x" @click=${() => this._unloadGroup(stgru)}>✕</span>
            </span>`)}
        </div>
      ` : html`<p class="hint">Wähle eine Studiengruppe um Kurse zu laden.</p>`}

      <input type="search" placeholder="🔍 Studiengruppe suchen…"
             .value=${this._query} @input=${e => this._query = e.target.value} />

      <div class="tree">
        ${(this._courseTree || []).map(fac => this._renderFac(fac, q, loadedKeys))}
      </div>`;
  }

  _renderFac(fac, q, loadedKeys) {
    const allGroups = fac.degrees.flatMap(d => d.programs.flatMap(p => p.groups));
    const matches = q
      ? allGroups.filter(g => g.label.toLowerCase().includes(q)
          || (g.program_name || '').toLowerCase().includes(q)
          || fac.label.toLowerCase().includes(q))
      : allGroups;
    if (!matches.length) return '';
    const key = `fac::${fac.label}`;
    const open = q || this._open.has(key);
    const loadedN = allGroups.filter(g => loadedKeys.has(g.stgru)).length;
    return html`
      <div class="row-fac" @click=${() => !q && this._toggleOpen(key)}>
        <span class="arrow">${open ? '▾' : '▸'}</span>
        ${fac.label}
        <span class="count">${allGroups.length}${loadedN ? html` · <strong>${loadedN} aktiv</strong>` : ''}</span>
      </div>
      ${open ? fac.degrees.map(deg => this._renderDeg(fac, deg, q, loadedKeys)) : ''}`;
  }

  _renderDeg(fac, deg, q, loadedKeys) {
    const allGroups = deg.programs.flatMap(p => p.groups);
    const matches = q
      ? allGroups.filter(g => g.label.toLowerCase().includes(q)
          || (g.program_name || '').toLowerCase().includes(q)
          || fac.label.toLowerCase().includes(q))
      : allGroups;
    if (!matches.length) return '';
    const key = `deg::${fac.label}::${deg.label}`;
    const open = q || this._open.has(key);
    return html`
      <div class="row-deg" @click=${() => !q && this._toggleOpen(key)}>
        <span class="arrow">${open ? '▾' : '▸'}</span>
        ${deg.label}
        <span class="count">${allGroups.length}</span>
      </div>
      ${open ? deg.programs.map(prog => this._renderProg(fac, deg, prog, q, loadedKeys)) : ''}`;
  }

  _renderProg(fac, deg, prog, q, loadedKeys) {
    const groups = q
      ? prog.groups.filter(g => g.label.toLowerCase().includes(q)
          || (g.program_name || '').toLowerCase().includes(q)
          || fac.label.toLowerCase().includes(q))
      : prog.groups;
    if (!groups.length) return '';
    const key = `prog::${fac.label}::${prog.code}`;
    const open = q || this._open.has(key);
    return html`
      <div class="row-prog" @click=${() => !q && this._toggleOpen(key)}>
        <span class="arrow">${open ? '▾' : '▸'}</span>
        <span class="prog-name">${prog.name || prog.code}</span>
        <span class="count">${groups.length}</span>
      </div>
      ${open ? html`
        <div class="chips-row">
          ${groups.map(g => {
            const active = loadedKeys.has(g.stgru);
            const loading = this._loadingStgru === g.stgru;
            return html`
              <span class="chip ${active ? 'active' : ''} ${loading ? 'loading' : ''}"
                    @click=${e => { e.stopPropagation(); active ? this._unloadGroup(g.stgru) : this._loadGroup(g); }}>
                ${loading ? html`<span class="spinner" style="width:10px;height:10px;border-width:1.5px"></span>` : ''}
                ${g.label}${active ? html` <span class="x">✕</span>` : ''}
              </span>`;
          })}
        </div>` : ''}`;
  }

  _renderCourses() {
    return html`
      <div class="courses">
        ${[...this._loaded].map(([stgru, group]) => html`
          <div class="grp-hdr">
            <span>${group.label} · ${group.courses.length} Kurse</span>
            <button class="btn-chip" @click=${() => this._selectGroup(stgru, true)}>Alle</button>
            <button class="btn-chip" @click=${() => this._selectGroup(stgru, false)}>Keine</button>
          </div>
          ${group.courses.map(c => this._renderCourse(c))}
        `)}
      </div>`;
  }

  _renderCourse(c) {
    const on = this._selected.has(c.id);
    const color = colorOf(c.id);
    const name = c.fullName || c.summary;
    const tag = c.fullName && c.summary !== c.fullName ? c.summary : '';
    const hasBi = c.slots.some(s => s.rhythmus === '14');
    const slots = c.slots.map(s =>
      `${DAY[s.day]} ${s.start}–${s.end}`).join(', ');

    return html`
      <div class="course ${on ? 'on' : ''}" @click=${() => this._toggle(c.id)}>
        <input type="checkbox" .checked=${on} />
        <span class="dot" style="background:${color}"></span>
        <div style="flex:1;min-width:0">
          <div class="c-name">
            ${name}${tag ? html` <span class="c-tag">${tag}</span>` : ''}
            ${hasBi ? html` <span class="c-biweekly">14-tägig</span>` : ''}
          </div>
          <div class="c-meta">
            ${slots}${c.lecturer ? ` · ${c.lecturer}` : ''}
          </div>
        </div>
        <span class="c-count">${c.events.length}×</span>
      </div>`;
  }

  _renderDetail() {
    const c = this._allCourses.find(c => c.id === this._detailCourseId);
    if (!c) return '';
    const color = colorOf(c.id);
    const name = c.fullName || c.summary;
    const tag = c.fullName && c.summary !== c.fullName ? c.summary : '';

    // Group events by slot (day+time)
    const bySlot = new Map();
    for (const ev of c.events) {
      try {
        const d = new Date(ev.dtstart);
        const day = d.getDay();
        const start = ev.dtstart.slice(11, 16);
        const end = (ev.dtend || ev.dtstart).slice(11, 16);
        const sk = `${DAY[day]} ${start}–${end}`;
        if (!bySlot.has(sk)) bySlot.set(sk, []);
        bySlot.get(sk).push(ev);
      } catch {}
    }

    return html`
      <div class="detail">
        <div class="detail-hdr">
          <span class="dot" style="background:${color}"></span>
          <span class="detail-name">${name}</span>
          ${tag ? html`<span class="detail-tag">${tag}</span>` : ''}
          <span class="detail-close" @click=${() => { this._detailCourseId = null; }}>✕</span>
        </div>
        ${c.lecturer ? html`<div class="detail-meta">👤 ${c.lecturer}</div>` : ''}
        ${[...bySlot].map(([sk, evs]) => html`
          <div class="detail-slot-hdr">
            ${sk}${evs[0]?.location ? ` · 📍 ${evs[0].location}` : ''}
            · ${evs.length} Termine
          </div>
          <div class="detail-dates">
            ${evs.sort((a, b) => a.dtstart.localeCompare(b.dtstart))
                 .map(ev => html`<span>${fmtDate(ev.dtstart)}</span>`)}
          </div>
        `)}
      </div>`;
  }

  _renderFooter() {
    return html`
      <div class="foot">
        <span class="stats">${this._selectedCourses.length} Kurse · ${this._totalEvents} Termine</span>
        <button class="btn-primary"
                ?disabled=${this._downloading || !this._selectedCourses.length}
                @click=${this._download}>
          ${this._downloading
            ? html`<span class="spinner"></span> Generiere…`
            : '📅 ICS herunterladen'}
        </button>
      </div>`;
  }
}

customElements.define('timetable-view', TimetableView);
