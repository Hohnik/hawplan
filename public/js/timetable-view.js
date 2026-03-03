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

/**
 * <timetable-view>
 * Group picker → course selection → preview → download.
 */
export class TimetableView extends LitElement {
  static properties = {
    session:       { type: Object },
    courseGroups:   { type: Array },
    _query:        { state: true },
    _expanded:     { state: true },   // Set<program>
    _loaded:       { state: true },   // Map<stgru, { label, courses[] }>
    _loadingStgru: { state: true },
    _selected:     { state: true },   // Set<courseId>
    _error:        { state: true },
    _downloading:  { state: true },
    _done:         { state: true },
  };

  static styles = [shared, css`
    /* ── Program accordion ────────────── */
    .progs {
      border: 1px solid var(--border); border-radius: var(--radius-sm);
      max-height: 300px; overflow-y: auto;
    }
    .progs::-webkit-scrollbar { width: 4px; }
    .progs::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 99px; }

    .prog-hdr {
      display: flex; align-items: center; gap: 0.5rem;
      padding: 0.5rem 0.8rem;
      cursor: pointer; font-size: 0.84rem;
      border-bottom: 1px solid var(--border);
      transition: background 0.1s;
    }
    .prog-hdr:hover { background: var(--surface-2); }
    .prog-arrow { color: var(--muted); font-size: 0.6em; width: 0.85em; flex-shrink: 0; }
    .prog-name  { font-weight: 600; }
    .prog-count { margin-left: auto; font-size: 0.75rem; color: var(--muted); }

    .prog-chips {
      display: flex; flex-wrap: wrap; gap: 0.3rem;
      padding: 0.4rem 0.8rem 0.5rem;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
    }
    .progs > :last-child { border-bottom: none; }

    /* ── Chips ─────────────────────────── */
    .loaded-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; }
    .loaded-label { font-size: 0.78rem; font-weight: 600; color: var(--muted); }

    .chip {
      padding: 0.25rem 0.6rem; font-size: 0.76rem;
      border-radius: 99px; border: 1px solid var(--border);
      background: var(--bg); color: var(--muted);
      cursor: pointer; transition: all 0.12s;
      display: inline-flex; align-items: center; gap: 0.25rem;
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
      user-select: none;
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
    .c-count {
      margin-left: auto; font-size: 0.72rem; color: var(--muted);
      white-space: nowrap; flex-shrink: 0; padding-top: 3px;
    }

    /* ── Footer ────────────────────────── */
    .foot { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
    .stats { font-size: 0.82rem; color: var(--muted); margin-left: auto; }

    /* ── Done ──────────────────────────── */
    .done {
      text-align: center; padding: 1.5rem 0;
      display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
    }
    .done h3 { font-size: 1.05rem; color: var(--success); }

    input[type='search'] { padding: 0.4rem 0.8rem; font-size: 0.84rem; }
  `];

  constructor() {
    super();
    this.session = null;
    this.courseGroups = [];
    this._query = '';
    this._expanded = new Set();
    this._loaded = new Map();
    this._loadingStgru = null;
    this._selected = new Set();
    this._error = '';
    this._downloading = false;
    this._done = false;
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
        body: JSON.stringify({
          cookies: this.session.cookies, session: this.session.session,
          user: this.session.user, stgru: g.stgru,
        }),
      });
      const data = await res.json();
      if (res.status === 401) {
        this.dispatchEvent(new CustomEvent('session-expired', { bubbles: true, composed: true }));
        return;
      }
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
        const day = d.getDay(), start = ev.dtstart.slice(11, 16);
        const end = (ev.dtend || ev.dtstart).slice(11, 16);
        const sk = `${day}-${start}-${end}`;
        if (!c.slots.some(s => s.key === sk))
          c.slots.push({ key: sk, day, start, end, room: ev.location || '' });
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
  }

  _selectGroup(stgru, on) {
    const g = this._loaded.get(stgru);
    if (!g) return;
    const s = new Set(this._selected);
    for (const c of g.courses) on ? s.add(c.id) : s.delete(c.id);
    this._selected = s;
  }

  _toggleExpand(prog) {
    const e = new Set(this._expanded);
    e.has(prog) ? e.delete(prog) : e.add(prog);
    this._expanded = e;
  }

  /* ═══ Computed ═══════════════════════════════════ */

  get _allCourses() { return [...this._loaded.values()].flatMap(g => g.courses); }
  get _selectedCourses() { return this._allCourses.filter(c => this._selected.has(c.id)); }
  get _totalEvents() { return this._selectedCourses.reduce((n, c) => n + c.events.length, 0); }

  get _previewSlots() {
    return this._selectedCourses.flatMap(c => {
      const color = colorOf(c.id);
      return c.slots.map(s => ({
        day: s.day, start: s.start, end: s.end,
        label: c.summary, title: c.fullName || c.summary,
        room: s.room, color,
      }));
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
    if (this._done) return html`<div class="stack">
      <div class="done">
        <h3>🎉 stundenplan.ics heruntergeladen</h3>
        <p class="hint">Öffne die Datei in Google Calendar, Apple Kalender oder Outlook.</p>
        <div class="row" style="justify-content:center">
          <button class="btn-primary" @click=${() => { this._done = false; }}>← Zurück</button>
          <button class="btn-ghost" @click=${() =>
            this.dispatchEvent(new CustomEvent('restart', { bubbles: true, composed: true }))}>
            Neuer Plan</button>
        </div>
      </div>
    </div>`;

    return html`<div class="stack">
      <h2><span class="badge">2</span> Stundenplan</h2>
      ${this._renderPicker()}
      ${this._loaded.size > 0 ? this._renderCourses() : ''}
      ${this._previewSlots.length > 0 ? html`
        <week-grid .slots=${this._previewSlots}></week-grid>` : ''}
      ${this._error ? html`<p class="error-msg">❌ ${this._error}</p>` : ''}
      ${this._loaded.size > 0 ? this._renderFooter() : ''}
    </div>`;
  }

  _renderPicker() {
    const q = this._query.toLowerCase();
    const loadedKeys = new Set([...this._loaded.keys()]);

    // Group by program prefix
    const progs = new Map();
    for (const g of this.courseGroups) {
      const p = g.program || '?';
      if (q && !g.label.toLowerCase().includes(q) && !p.toLowerCase().includes(q)) continue;
      if (!progs.has(p)) progs.set(p, []);
      progs.get(p).push(g);
    }

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

      <div class="progs">
        ${[...progs].sort(([a], [b]) => a.localeCompare(b)).map(([prog, groups]) => {
          const open = q || this._expanded.has(prog);
          const loadedN = groups.filter(g => loadedKeys.has(g.stgru)).length;
          return html`
            <div class="prog-hdr" @click=${() => !q && this._toggleExpand(prog)}>
              <span class="prog-arrow">${open ? '▾' : '▸'}</span>
              <span class="prog-name">${prog}</span>
              <span class="prog-count">
                ${groups.length} Gruppen${loadedN ? html` · <strong>${loadedN} aktiv</strong>` : ''}
              </span>
            </div>
            ${open ? html`
              <div class="prog-chips">
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
        })}
      </div>`;
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
          ${group.courses.map(c => {
            const on = this._selected.has(c.id);
            const color = colorOf(c.id);
            const name = c.fullName || c.summary;
            const tag = c.fullName && c.summary !== c.fullName ? c.summary : '';
            const slots = c.slots.map(s =>
              `${DAY[s.day]} ${s.start}–${s.end}`).join(', ');
            return html`
              <div class="course ${on ? 'on' : ''}" @click=${() => this._toggle(c.id)}>
                <input type="checkbox" .checked=${on} />
                <span class="dot" style="background:${color}"></span>
                <div style="flex:1;min-width:0">
                  <div class="c-name">
                    ${name}${tag ? html` <span class="c-tag">${tag}</span>` : ''}
                  </div>
                  <div class="c-meta">
                    ${slots}${c.lecturer ? ` · ${c.lecturer}` : ''}
                  </div>
                </div>
                <span class="c-count">${c.events.length}×</span>
              </div>`;
          })}
        `)}
      </div>`;
  }

  _renderFooter() {
    return html`
      <div class="foot">
        <button class="btn-ghost" @click=${() =>
          this.dispatchEvent(new CustomEvent('restart', { bubbles: true, composed: true }))}>
          ← Abmelden</button>
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
