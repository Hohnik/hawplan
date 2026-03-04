import { LitElement, html, css } from 'https://esm.sh/lit@3';
import { shared } from './shared-styles.js';
import { colorOf, DAY_NAMES, fmtDate, groupEvents, countConflicts } from './helpers.js';
import { downloadICS } from './ics.js';
import './week-grid.js';
import './schedule-list.js';
import './course-picker.js';

export class TimetableView extends LitElement {
  static properties = {
    _courseTree:      { state: true },
    _initError:      { state: true },
    _loading:        { state: true },
    _query:          { state: true },
    _loaded:         { state: true },
    _loadingStgru:   { state: true },
    _selected:       { state: true },
    _detailCourseId: { state: true },
    _error:          { state: true },
    _downloading:    { state: true },
    _done:           { state: true },
    _mobileTab:      { state: true },
  };

  static styles = [shared, css`
    :host { background: var(--bg); }

    /* ═══ Desktop split ═══════════════════════ */
    .left-panel {
      width: 380px; min-width: 380px;
      display: flex; flex-direction: column;
      background: var(--surface);
      border-right: 1px solid var(--border);
      height: 100vh; overflow: hidden;
    }
    .right-panel {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column;
      height: 100vh; overflow: hidden;
    }

    .left-hdr {
      display: flex; flex-direction: column; gap: 6px;
      padding: 20px 20px 14px;
    }
    .app-title {
      font-family: var(--mono); font-size: 11px; font-weight: 600;
      letter-spacing: 3px; color: var(--text);
    }
    .app-sub { font-size: 13px; color: var(--muted); }

    .picker-wrap {
      flex: 1; overflow: hidden;
      display: flex; flex-direction: column;
      padding: 0 20px;
    }

    /* ── Right header ──────────────────────── */
    .right-hdr {
      display: flex; align-items: center; justify-content: space-between;
      gap: 8px; padding: 20px 32px; flex-shrink: 0;
      border-bottom: 1px solid var(--border);
    }
    .sched-title {
      font-family: var(--mono); font-size: 11px; font-weight: 600;
      letter-spacing: 3px;
    }
    .sem-label { font-size: 13px; color: var(--muted); }
    .timetable-wrap { flex: 1; overflow: auto; padding: 0 32px 32px; }

    /* ── Bottom bar ────────────────────────── */
    .bottom-bar {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; padding: 14px 20px; flex-shrink: 0;
      background: var(--surface); border-top: 1px solid var(--border);
    }
    .sel-info { display: flex; flex-direction: column; gap: 1px; }
    .sel-count { font-size: 14px; font-weight: 600; }
    .sel-note {
      font-family: var(--mono); font-size: 9px; font-weight: 500;
      letter-spacing: 0.3px;
    }

    /* ── Detail panel ──────────────────────── */
    .detail {
      border: 1px solid var(--border); border-radius: var(--radius-sm);
      padding: 0.65rem 0.85rem; background: var(--bg); margin: 12px 0;
    }
    .detail-hdr { display: flex; align-items: center; gap: 0.45rem; margin-bottom: 0.4rem; }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .detail-name { font-weight: 600; font-size: 0.88rem; }
    .detail-tag {
      font-size: 0.65rem; font-weight: 600;
      padding: 0.08rem 0.35rem; border-radius: 4px;
      background: var(--surface-2); color: var(--muted);
    }
    .detail-close {
      margin-left: auto; cursor: pointer; font-size: 0.72rem;
      color: var(--muted); opacity: 0.6;
    }
    .detail-close:hover { opacity: 1; }
    .detail-meta { font-size: 0.76rem; color: var(--muted); margin-bottom: 0.35rem; }
    .detail-slot-hdr { font-size: 0.72rem; font-weight: 600; color: var(--muted); margin-top: 0.3rem; }
    .detail-dates {
      font-size: 0.72rem; color: var(--muted); line-height: 1.7;
      display: flex; flex-wrap: wrap; gap: 0.15rem 0.4rem;
    }

    /* ── Biweekly grids ────────────────────── */
    .grids { display: flex; flex-direction: column; gap: 0.75rem; }
    .grid-label {
      font-family: var(--mono); font-size: 11px; font-weight: 600;
      color: var(--muted); letter-spacing: 0.05em; padding: 8px 0 4px;
    }

    /* ── Center states ─────────────────────── */
    .center {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 0.75rem; width: 100%; height: 100%;
    }
    .big-spinner {
      width: 28px; height: 28px; border-width: 3px;
      border-color: rgba(255,132,0,0.2); border-top-color: var(--primary);
    }
    .done {
      text-align: center; display: flex; flex-direction: column;
      align-items: center; gap: 1rem; max-width: 380px;
    }
    .done h3 { font-size: 1.05rem; color: var(--success); }
    .done-hint { font-size: 0.85rem; color: var(--muted); line-height: 1.55; }
    .done-actions { display: flex; flex-direction: column; gap: 8px; width: 100%; }
    .done-btn {
      display: flex; align-items: center; gap: 10px;
      padding: 12px 16px; border-radius: var(--radius-sm);
      background: var(--surface); border: 1px solid var(--border);
      color: var(--text); font-family: var(--font); font-size: 0.88rem;
      font-weight: 500; cursor: pointer; text-decoration: none;
      transition: border-color 0.15s, background 0.15s;
    }
    .done-btn:hover { border-color: var(--border-2); background: var(--surface-2); }
    .done-btn .icon { font-size: 1.3rem; flex-shrink: 0; }
    .done-btn .label { text-align: left; }
    .done-btn .sub {
      display: block; font-size: 0.75rem; color: var(--muted);
      font-family: var(--mono); letter-spacing: 0.2px; margin-top: 2px;
    }
    .done-btn .sub a {
      color: var(--primary); text-decoration: underline;
      text-underline-offset: 2px;
    }

    /* ═══ Mobile ═══════════════════════════════ */
    .mobile-shell {
      display: none; flex-direction: column; width: 100%; min-height: 100vh;
      max-width: 100vw; overflow-x: hidden;
      background: var(--bg);
    }
    .mob-header {
      display: flex; flex-direction: column; gap: 12px;
      padding: 16px 16px 12px; flex-shrink: 0;
    }
    .mob-title-row { display: flex; align-items: center; justify-content: space-between; }
    .mob-title {
      font-family: var(--mono); font-size: 16px; font-weight: 700;
      letter-spacing: 3px;
    }
    .mob-dl-icon { cursor: pointer; font-size: 18px; }
    .mob-content {
      flex: 1; overflow-y: auto; overflow-x: hidden; padding: 0 16px;
      display: flex; flex-direction: column; min-width: 0;
    }
    .mob-bottom {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px 28px; background: var(--surface);
      border-top: 1px solid var(--border); flex-shrink: 0;
    }

    @media (max-width: 768px) {
      .left-panel, .right-panel { display: none !important; }
      .mobile-shell { display: flex !important; }
    }
  `];

  constructor() {
    super();
    this._courseTree = [];
    this._initError = '';
    this._loading = 'init';
    this._query = '';
    this._loaded = new Map();
    this._loadingStgru = null;
    this._selected = new Set();
    this._detailCourseId = null;
    this._error = '';
    this._downloading = false;
    this._done = false;
    this._mobileTab = 'courses';
  }

  connectedCallback() { super.connectedCallback(); this._init(); }

  async _init() {
    this._loading = 'init'; this._initError = '';
    try {
      const res = await fetch('data/tree.json');
      if (!res.ok) throw new Error(`Kursliste konnte nicht geladen werden (${res.status})`);
      this._courseTree = await res.json();
    } catch (e) { this._initError = e.message; }
    this._loading = null;
  }

  /* ═══ Data loading ═══════════════════════════ */

  async _loadGroup(g) {
    if (this._loaded.has(g.stgru) || this._loadingStgru) return;
    this._loadingStgru = g.stgru; this._error = '';
    try {
      const res = await fetch(`data/groups/${g.stgru}.json`);
      if (!res.ok) throw new Error(`Keine Daten für ${g.label} (${res.status})`);
      const events = await res.json();
      const courses = groupEvents(events, g);
      const loaded = new Map(this._loaded);
      loaded.set(g.stgru, { label: g.label, courses });
      this._loaded = loaded;
    } catch (e) { this._error = e.message; }
    finally { this._loadingStgru = null; }
  }

  _unloadGroup(stgru) {
    const loaded = new Map(this._loaded);
    const group = loaded.get(stgru);
    loaded.delete(stgru); this._loaded = loaded;
    if (group) {
      const sel = new Set(this._selected);
      for (const c of group.courses) sel.delete(c.id);
      this._selected = sel;
      if (group.courses.some(c => c.id === this._detailCourseId))
        this._detailCourseId = null;
    }
  }

  /* ═══ Selection ══════════════════════════════ */

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

  _onPickerEvent(e) {
    const t = e.type;
    if (t === 'load-group')    this._loadGroup(e.detail);
    if (t === 'unload-group')  this._unloadGroup(e.detail.stgru);
    if (t === 'toggle-course') this._toggle(e.detail.id);
    if (t === 'select-group')  this._selectGroup(e.detail.stgru, e.detail.on);
    if (t === 'query-change')  this._query = e.detail;
  }

  /* ═══ Computed ═══════════════════════════════ */

  get _allCourses() { return [...this._loaded.values()].flatMap(g => g.courses); }
  get _selectedCourses() { return this._allCourses.filter(c => this._selected.has(c.id)); }
  get _totalEvents() { return this._selectedCourses.reduce((n, c) => n + c.events.length, 0); }
  get _conflictCount() { return countConflicts(this._buildSlots(null)); }

  _buildSlots(parity) {
    return this._selectedCourses.flatMap(c => {
      const color = colorOf(c.id);
      return c.slots
        .filter(s => {
          if (!parity) return true;
          const wks = [...s.weeks];
          return parity === 'even' ? wks.some(w => w % 2 === 0) : wks.some(w => w % 2 !== 0);
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
    return this._buildSlots(null).some(s => {
      const wks = [...(s.weeks || [])];
      if (wks.length < 2) return wks.length === 1;
      return !(wks.some(w => w % 2 === 0) && wks.some(w => w % 2 !== 0));
    });
  }

  /* ═══ Download ═══════════════════════════════ */

  async _download() {
    const events = this._selectedCourses.flatMap(c => c.events);
    if (!events.length) { this._error = 'Keine Kurse ausgewählt.'; return; }
    this._downloading = true; this._error = '';
    try {
      downloadICS(events);
      this._done = true;
    } catch (e) { this._error = e.message; }
    finally { this._downloading = false; }
  }

  _redownload() {
    const events = this._selectedCourses.flatMap(c => c.events);
    if (events.length) downloadICS(events);
  }

  /* ═══ Picker template (shared desktop + mobile) ═══ */

  _pickerTemplate() {
    return html`
      <course-picker
        .courseTree=${this._courseTree} .loaded=${this._loaded}
        .selected=${this._selected} .loadingStgru=${this._loadingStgru}
        .query=${this._query}
        @load-group=${this._onPickerEvent} @unload-group=${this._onPickerEvent}
        @toggle-course=${this._onPickerEvent} @select-group=${this._onPickerEvent}
        @query-change=${this._onPickerEvent}>
      </course-picker>`;
  }

  /* ═══ Render ═════════════════════════════════ */

  render() {
    if (this._loading === 'init')
      return html`<div class="center"><span class="spinner big-spinner"></span><p class="hint">Lade Studiengänge…</p></div>`;
    if (this._initError)
      return html`<div class="center"><p class="error-msg">${this._initError}</p><button class="btn-primary" @click=${this._init}>Erneut versuchen</button></div>`;
    if (this._done)
      return html`<div class="center"><div class="done">
        <h3>✓ stundenplan.ics heruntergeladen</h3>
        <p class="done-hint">Jetzt in deinen Kalender importieren:</p>
        <div class="done-actions">
          <button class="done-btn" @click=${() => this._redownload()}>
            <span class="icon">📅</span>
            <span class="label">Google Kalender<span class="sub">Die App kann keine .ics importieren!<br><a href="https://calendar.google.com/calendar/u/0/r/settings/export" target="_blank" rel="noopener" @click=${(e) => e.stopPropagation()}>Import-Seite im Browser öffnen</a> → Datei auswählen</span></span>
          </button>
          <button class="done-btn" @click=${() => this._redownload()}>
            <span class="icon">🍎</span>
            <span class="label">Apple Kalender<span class="sub">Datei muss über Safari heruntergeladen werden!</span></span>
          </button>
          <button class="done-btn" @click=${() => this._redownload()}>
            <span class="icon">📧</span>
            <span class="label">Outlook<span class="sub">Am PC: .ics Datei öffnen oder per Drag & Drop<br>Handy: <a href="https://outlook.live.com/calendar/0/addcalendar" target="_blank" rel="noopener" @click=${(e) => e.stopPropagation()}>Outlook Web öffnen</a> → Aus Datei importieren</span></span>
          </button>
        </div>
        <button class="btn-ghost" style="margin-top:8px" @click=${() => { this._done = false; }}>← Zurück zur Auswahl</button>
      </div></div>`;

    return html`${this._renderDesktop()}${this._renderMobile()}`;
  }

  _renderDesktop() {
    const allSlots = this._buildSlots(null);
    const biweekly = this._hasBiweekly;
    return html`
      <div class="left-panel">
        <div class="left-hdr">
          <span class="app-title">STUNDENPLAN</span>
          <span class="app-sub">Suche deine Studiengruppe</span>
        </div>
        <div class="picker-wrap">${this._pickerTemplate()}</div>
        ${this._renderBottomBar()}
      </div>
      <div class="right-panel">
        <div class="right-hdr">
          <span class="sched-title">WOCHENPLAN</span>
          <span class="sem-label">SoSe 2026</span>
        </div>
        <div class="timetable-wrap">
          ${allSlots.length > 0 ? (biweekly ? this._renderBiweeklyGrids() :
            html`<week-grid .slots=${allSlots} @slot-click=${this._onSlotClick}></week-grid>`) : ''}
          ${this._detailCourseId ? this._renderDetail() : ''}
        </div>
        ${this._error ? html`<p class="error-msg" style="margin:0 32px 16px">${this._error}</p>` : ''}
      </div>`;
  }

  _renderMobile() {
    const n = this._selectedCourses.length;
    return html`
      <div class="mobile-shell">
        <div class="mob-header">
          <div class="mob-title-row">
            <span class="mob-title">STUNDENPLAN</span>
            <span class="mob-dl-icon" @click=${this._download} title="Download .ics">⬇</span>
          </div>
          <div class="tabs">
            <button class="tab ${this._mobileTab === 'courses' ? 'active' : ''}"
                    @click=${() => this._mobileTab = 'courses'}>Kurse</button>
            <button class="tab ${this._mobileTab === 'schedule' ? 'active' : ''}"
                    @click=${() => this._mobileTab = 'schedule'}>Wochenplan</button>
          </div>
        </div>
        <div class="mob-content">
          ${this._mobileTab === 'courses'
            ? this._pickerTemplate()
            : html`
              <schedule-list .slots=${this._buildSlots(null)}
                @slot-click=${this._onSlotClick}>
              </schedule-list>`}
        </div>
        <div class="mob-bottom">
          <div class="sel-info">
            <span class="sel-count">${n} Kurs${n !== 1 ? 'e' : ''} ausgewählt</span>
            ${n > 0 ? html`<span class="sel-note" style="color:${this._conflictCount ? 'var(--error)' : 'var(--success)'}">
              ${this._conflictCount ? `⚠ ${this._conflictCount} Zeitkonflikt${this._conflictCount > 1 ? 'e' : ''}` : '✓ Keine Zeitkonflikte'}
            </span>` : ''}
          </div>
          <button class="btn-primary" ?disabled=${this._downloading || !n} @click=${this._download}>
            ${this._downloading ? html`<span class="spinner"></span>` : 'Download .ics'}
          </button>
        </div>
      </div>`;
  }

  _renderBottomBar() {
    const n = this._selectedCourses.length;
    const conflicts = this._conflictCount;
    return html`
      <div class="bottom-bar">
        <div class="sel-info">
          <span class="sel-count">${n} Kurs${n !== 1 ? 'e' : ''} ausgewählt</span>
          ${n > 0 ? html`<span class="sel-note" style="color:${conflicts ? 'var(--error)' : 'var(--success)'}">
            ${conflicts ? `⚠ ${conflicts} Zeitkonflikt${conflicts > 1 ? 'e' : ''}` : '✓ Keine Zeitkonflikte'}
          </span>` : ''}
        </div>
        <button class="btn-primary" ?disabled=${this._downloading || !n} @click=${this._download}>
          ${this._downloading ? html`<span class="spinner"></span> Erstelle…` : 'Download .ics'}
        </button>
      </div>`;
  }

  _renderBiweeklyGrids() {
    return html`<div class="grids">
      <div><div class="grid-label">UNGERADE KW</div>
        <week-grid .slots=${this._buildSlots('odd')} @slot-click=${this._onSlotClick}></week-grid></div>
      <div><div class="grid-label">GERADE KW</div>
        <week-grid .slots=${this._buildSlots('even')} @slot-click=${this._onSlotClick}></week-grid></div>
    </div>`;
  }

  _renderDetail() {
    const c = this._allCourses.find(c => c.id === this._detailCourseId);
    if (!c) return '';
    const color = colorOf(c.id);
    const name = c.fullName || c.summary;
    const tag = c.fullName && c.summary !== c.fullName ? c.summary : '';
    const bySlot = new Map();
    for (const ev of c.events) {
      try {
        const d = new Date(ev.dtstart);
        const sk = `${DAY_NAMES[d.getDay()]} ${ev.dtstart.slice(11, 16)}–${(ev.dtend || ev.dtstart).slice(11, 16)}`;
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
        ${c.lecturer ? html`<div class="detail-meta">${c.lecturer}</div>` : ''}
        ${[...bySlot].map(([sk, evs]) => html`
          <div class="detail-slot-hdr">${sk}${evs[0]?.location ? ` · ${evs[0].location}` : ''} · ${evs.length} Termine</div>
          <div class="detail-dates">${evs.sort((a, b) => a.dtstart.localeCompare(b.dtstart)).map(ev => html`<span>${fmtDate(ev.dtstart)}</span>`)}</div>
        `)}
      </div>`;
  }
}

customElements.define('timetable-view', TimetableView);
