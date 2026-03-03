import { LitElement, html, css } from 'https://esm.sh/lit@3';
import { shared } from './shared-styles.js';
import './week-grid.js';

/* ── Color palette for courses ─────────────────────── */
const COLORS = [
  '#6c8cff','#ff6b9d','#56d364','#f0c541','#c084fc',
  '#fb923c','#22d3ee','#f87171','#a3e635','#e879f9',
  '#2dd4bf','#fbbf24','#818cf8','#fb7185','#34d399',
];
function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

const DAY_SHORT = ['So','Mo','Di','Mi','Do','Fr','Sa'];

/**
 * <timetable-view>
 * Full timetable builder: pick study groups → toggle courses → preview → download.
 *
 * Props: .session  { cookies, session, user }
 *        .courseGroups  [{ label, stg, stgru }]
 *
 * Emits: 'session-expired', 'restart'
 */
export class TimetableView extends LitElement {
  static properties = {
    session:       { type: Object },
    courseGroups:   { type: Array },

    _groupQuery:   { state: true },
    _loaded:       { state: true },    // Map<stgru, { label, courses[] }>
    _loadingStgru: { state: true },    // stgru currently loading, or null
    _selected:     { state: true },    // Set<courseId>
    _error:        { state: true },
    _downloading:  { state: true },
    _done:         { state: true },
  };

  static styles = [shared, css`
    /* ── Group chips ──────────────────────── */
    .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; max-height: 200px; overflow-y: auto; }
    .chip {
      padding: 0.28rem 0.65rem; font-size: 0.74rem; border-radius: 99px;
      border: 1px solid var(--border); background: var(--bg);
      color: var(--muted); cursor: pointer; transition: all 0.15s;
      display: inline-flex; align-items: center; gap: 0.25rem;
    }
    .chip:hover { border-color: var(--accent); color: var(--text); }
    .chip.active { background: var(--accent-bg); border-color: var(--accent); color: var(--accent); font-weight: 600; }
    .chip .x { font-size: 0.6rem; opacity: 0.5; margin-left: 2px; }
    .chip .x:hover { opacity: 1; }
    .chip.loading { opacity: 0.5; pointer-events: none; }

    /* ── Course list ──────────────────────── */
    .course-list {
      display: flex; flex-direction: column; gap: 0.35rem;
      max-height: 340px; overflow-y: auto; padding-right: 4px;
    }
    .course-list::-webkit-scrollbar { width: 4px; }
    .course-list::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 99px; }

    .group-hdr {
      display: flex; align-items: center; gap: 0.5rem;
      font-size: 0.76rem; font-weight: 600; color: var(--muted);
      text-transform: uppercase; letter-spacing: 0.04em;
      margin-top: 0.5rem; padding-bottom: 0.15rem;
      border-bottom: 1px solid var(--border);
    }
    .group-hdr button { font-size: 0.66rem; text-transform: none; letter-spacing: 0; padding: 0.2rem 0.55rem; }

    .course {
      display: flex; align-items: flex-start; gap: 0.6rem;
      padding: 0.55rem 0.8rem; background: var(--bg);
      border: 1px solid var(--border); border-radius: 8px;
      cursor: pointer; transition: border-color 0.14s; user-select: none;
    }
    .course:hover { border-color: var(--border-2); }
    .course.on { border-color: var(--accent); background: var(--accent-bg); }
    .course input[type='checkbox'] { margin-top: 3px; accent-color: var(--accent); cursor: pointer; width: auto; }

    .color-dot {
      width: 8px; height: 8px; border-radius: 50%;
      flex-shrink: 0; margin-top: 5px;
    }
    .c-name { font-weight: 600; font-size: 0.84rem; display: flex; align-items: center; gap: 0.4rem; }
    .c-meta { color: var(--muted); font-size: 0.72rem; margin-top: 1px; line-height: 1.5; }
    .c-count { margin-left: auto; font-size: 0.7rem; color: var(--muted); white-space: nowrap; padding-top: 2px; }

    .c-info {
      display: inline-flex; align-items: center; justify-content: center;
      width: 16px; height: 16px; border-radius: 50%;
      background: var(--border); color: var(--muted);
      font-size: 0.58rem; font-weight: 700; cursor: help;
      flex-shrink: 0; position: relative;
    }
    .c-info:hover { background: var(--accent-bg); color: var(--accent); }
    .c-tooltip {
      display: none; position: absolute; bottom: calc(100% + 6px); left: 50%;
      transform: translateX(-50%); width: max-content; max-width: 280px;
      background: var(--surface-2, #21263a); color: var(--text);
      border: 1px solid var(--border-2); border-radius: 6px;
      padding: 0.5rem 0.7rem; font-size: 0.72rem; font-weight: 400;
      line-height: 1.5; z-index: 10; pointer-events: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .c-info:hover .c-tooltip { display: block; }

    /* ── Preview label ────────────────────── */
    .section-label {
      font-size: 0.76rem; font-weight: 600; color: var(--muted);
      text-transform: uppercase; letter-spacing: 0.05em;
    }

    /* ── Footer ───────────────────────────── */
    .footer { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
    .stats { font-size: 0.8rem; color: var(--muted); margin-left: auto; }

    /* ── Done state ───────────────────────── */
    .done-box {
      text-align: center; padding: 1.5rem 0;
      display: flex; flex-direction: column; align-items: center; gap: 1rem;
    }
    .done-box h3 { font-size: 1.1rem; color: var(--success); }
    .done-box p { color: var(--muted); font-size: 0.85rem; max-width: 400px; }

    input[type='search'] { padding: 0.35rem 0.75rem; font-size: 0.8rem; }
  `];

  constructor() {
    super();
    this.session = null;
    this.courseGroups = [];
    this._groupQuery = '';
    this._loaded = new Map();
    this._loadingStgru = null;
    this._selected = new Set();
    this._error = '';
    this._downloading = false;
    this._done = false;
  }

  // ══════════════════════════════════════════════════════
  // Group loading
  // ══════════════════════════════════════════════════════

  async _loadGroup(group) {
    if (this._loaded.has(group.stgru) || this._loadingStgru) return;
    this._loadingStgru = group.stgru;
    this._error = '';

    try {
      const res = await fetch('/api/timetable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cookies: this.session.cookies,
          session: this.session.session,
          user:    this.session.user,
          stgru:   group.stgru,
        }),
      });
      const data = await res.json();

      if (res.status === 401) {
        this.dispatchEvent(new CustomEvent('session-expired', { bubbles: true, composed: true }));
        return;
      }
      if (!res.ok) throw new Error(data.detail || `Fehler ${res.status}`);

      const courses = this._buildCourses(data.events || [], group);

      const loaded = new Map(this._loaded);
      loaded.set(group.stgru, { label: group.label, courses });
      this._loaded = loaded;

      // Auto-select all new courses
      const sel = new Set(this._selected);
      for (const c of courses) sel.add(c.id);
      this._selected = sel;
    } catch (e) {
      this._error = e.message;
    } finally {
      this._loadingStgru = null;
    }
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

  // ══════════════════════════════════════════════════════
  // Group events → courses
  // ══════════════════════════════════════════════════════

  _buildCourses(events, group) {
    const map = new Map();

    for (const ev of events) {
      const name = (ev.summary || '').trim();
      if (!name) continue;

      // Group by lv_id (unique lecture), fall back to summary
      const key = ev.lv_id || name;

      if (!map.has(key)) {
        map.set(key, {
          id: `${group.stgru}::${key}`,
          summary: name,
          fullName: ev.fach_name || '',
          lvId: ev.lv_id || '',
          groupLabel: group.label,
          slots: [],
          events: [],
          lecturer: '',
          rooms: new Set(),
        });
      }

      const course = map.get(key);
      course.events.push(ev);

      try {
        const d = new Date(ev.dtstart);
        const day = d.getDay();
        const start = ev.dtstart.slice(11, 16);
        const end = (ev.dtend || ev.dtstart).slice(11, 16);
        const key2 = `${day}-${start}-${end}`;

        if (!course.slots.some(s => s.key === key2)) {
          course.slots.push({ key: key2, day, start, end, room: ev.location || '' });
        }
      } catch {}

      if (ev.location) course.rooms.add(ev.location);
      const lec = ev.description?.match(/Dozent:\s*(.+)/);
      if (lec && !course.lecturer) course.lecturer = lec[1].trim();
    }

    return [...map.values()].sort((a, b) => a.summary.localeCompare(b.summary));
  }

  // ══════════════════════════════════════════════════════
  // Selection
  // ══════════════════════════════════════════════════════

  _toggle(id) {
    const s = new Set(this._selected);
    s.has(id) ? s.delete(id) : s.add(id);
    this._selected = s;
  }

  _selectGroup(stgru, on) {
    const group = this._loaded.get(stgru);
    if (!group) return;
    const s = new Set(this._selected);
    for (const c of group.courses) on ? s.add(c.id) : s.delete(c.id);
    this._selected = s;
  }

  // ══════════════════════════════════════════════════════
  // Computed
  // ══════════════════════════════════════════════════════

  get _allCourses() {
    const out = [];
    for (const [, g] of this._loaded) out.push(...g.courses);
    return out;
  }

  get _selectedCourses() {
    return this._allCourses.filter(c => this._selected.has(c.id));
  }

  get _previewSlots() {
    return this._selectedCourses.flatMap(c => {
      const color = hashColor(c.id);
      return c.slots.map(s => ({
        day: s.day, start: s.start, end: s.end,
        label: c.summary, room: s.room, color,
      }));
    });
  }

  get _totalEvents() {
    return this._selectedCourses.reduce((n, c) => n + c.events.length, 0);
  }

  // ══════════════════════════════════════════════════════
  // Download
  // ══════════════════════════════════════════════════════

  async _download() {
    const events = this._selectedCourses.flatMap(c => c.events);
    if (!events.length) { this._error = 'Keine Kurse ausgewählt.'; return; }

    this._downloading = true;
    this._error = '';

    try {
      const res = await fetch('/api/ics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Fehler ${res.status}`);
      }

      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'stundenplan.ics';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);

      this._done = true;
    } catch (e) {
      this._error = e.message;
    } finally {
      this._downloading = false;
    }
  }

  // ══════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════

  render() {
    if (this._done) return this._renderDone();

    return html`<div class="stack">
      <h2><span class="badge">2</span> Stundenplan zusammenstellen</h2>
      ${this._renderGroupPicker()}
      ${this._loaded.size > 0 ? this._renderCourses() : ''}
      ${this._previewSlots.length > 0 ? html`
        <div class="divider"></div>
        <span class="section-label">Vorschau</span>
        <week-grid .slots=${this._previewSlots}></week-grid>
      ` : ''}
      ${this._error ? html`<p class="error-msg">❌ ${this._error}</p>` : ''}
      ${this._loaded.size > 0 ? this._renderFooter() : ''}
    </div>`;
  }

  _renderGroupPicker() {
    const loadedKeys = [...this._loaded.keys()];
    const q = this._groupQuery.toLowerCase();
    const available = this.courseGroups.filter(g =>
      !loadedKeys.includes(g.stgru) && (!q || g.label.toLowerCase().includes(q))
    );

    return html`
      ${loadedKeys.length > 0 ? html`
        <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap">
          <span class="hint" style="font-weight:600">Geladen:</span>
          ${loadedKeys.map(stgru => {
            const g = this._loaded.get(stgru);
            return html`<span class="chip active">
              ${g.label}
              <span class="x" @click=${() => this._unloadGroup(stgru)}>✕</span>
            </span>`;
          })}
        </div>
      ` : html`<p class="hint">Wähle eine Studiengruppe um Kurse zu laden.</p>`}

      <input type="search" placeholder="🔍 Gruppe suchen… z.B. IF4, WIF6, KI2"
             .value=${this._groupQuery}
             @input=${e => this._groupQuery = e.target.value} />

      <div class="chips">
        ${available.slice(0, 50).map(g => html`
          <span class="chip ${this._loadingStgru === g.stgru ? 'loading' : ''}"
                @click=${() => this._loadGroup(g)}>
            ${this._loadingStgru === g.stgru
              ? html`<span class="spinner" style="width:10px;height:10px;border-width:1.5px"></span>`
              : ''}
            ${g.label}
          </span>`)}
        ${available.length > 50
          ? html`<span class="hint" style="padding:0.3rem">… ${available.length - 50} weitere</span>`
          : ''}
        ${available.length === 0 && q
          ? html`<span class="hint">Keine Treffer</span>`
          : ''}
      </div>`;
  }

  _renderCourses() {
    return html`
      <div class="course-list">
        ${[...this._loaded].map(([stgru, group]) => html`
          <div class="group-hdr">
            ${group.label} · ${group.courses.length} Kurse
            <button class="btn-chip" @click=${() => this._selectGroup(stgru, true)}>Alle</button>
            <button class="btn-chip" @click=${() => this._selectGroup(stgru, false)}>Keine</button>
          </div>

          ${group.courses.map(c => {
            const on = this._selected.has(c.id);
            const color = hashColor(c.id);
            const slots = c.slots.map(s =>
              `${DAY_SHORT[s.day]} ${s.start}–${s.end}${s.room ? ' · ' + s.room : ''}`
            ).join('  ⸱  ');

            return html`
              <div class="course ${on ? 'on' : ''}" @click=${() => this._toggle(c.id)}>
                <div class="color-dot" style="background:${color}"></div>
                <input type="checkbox" .checked=${on}
                       @click=${e => e.stopPropagation()}
                       @change=${() => this._toggle(c.id)} />
                <div style="flex:1;min-width:0">
                  <div class="c-name">
                    ${c.summary}
                    ${c.fullName ? html`
                      <span class="c-info" @click=${e => e.stopPropagation()}>i
                        <span class="c-tooltip">
                          <strong>${c.fullName}</strong>
                          ${c.lvId ? html`<br>LV-ID: ${c.lvId}` : ''}
                          ${c.lecturer ? html`<br>Dozent: ${c.lecturer}` : ''}
                          ${c.rooms.size ? html`<br>Raum: ${[...c.rooms].join(', ')}` : ''}
                        </span>
                      </span>
                    ` : ''}
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
      <div class="footer">
        <button class="btn-ghost" @click=${() =>
            this.dispatchEvent(new CustomEvent('restart', { bubbles: true, composed: true }))}>
          ← Abmelden
        </button>
        <span class="stats">${this._selectedCourses.length} Kurse · ${this._totalEvents} Termine</span>
        <button class="btn-primary"
                ?disabled=${this._downloading || this._selectedCourses.length === 0}
                @click=${this._download}>
          ${this._downloading
            ? html`<span class="spinner"></span> Generiere…`
            : '📅 ICS herunterladen'}
        </button>
      </div>`;
  }

  _renderDone() {
    return html`<div class="stack">
      <h2><span class="badge" style="background:var(--success)">✓</span> Fertig</h2>
      <div class="done-box">
        <h3>🎉 stundenplan.ics heruntergeladen</h3>
        <p>Öffne die Datei in Google Calendar, Apple Kalender oder Outlook um die Termine zu importieren.</p>
        <div class="row" style="justify-content:center;gap:0.5rem">
          <button class="btn-primary" @click=${() => { this._done = false; }}>← Zurück zum Plan</button>
          <button class="btn-ghost" @click=${() =>
              this.dispatchEvent(new CustomEvent('restart', { bubbles: true, composed: true }))}>
            Neuer Plan
          </button>
        </div>
      </div>
    </div>`;
  }
}

customElements.define('timetable-view', TimetableView);
