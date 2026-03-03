import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { shared } from './shared-styles.js';

/**
 * <timetable-view>
 * Shows fetched events, lets the user filter/select, then download as .ics.
 * Includes the "done" state inline after a successful download.
 *
 * Props (set by app-shell): events, weeks, semester, groupLabel
 * Emits: 'download-ics' { detail: { events } }, 'restart'
 */
export class TimetableView extends LitElement {
  static properties = {
    events:     { type: Array  },
    weeks:      { type: Number },
    semester:   { type: String },
    groupLabel: { type: String },

    _query:     { state: true },
    _selected:  { state: true },  // Set<index>
    _loading:   { state: true },
    _error:     { state: true },
    _done:      { state: true },  // true after download
  };

  static styles = [shared, css`
    .toolbar {
      display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
    }
    input[type='search'] {
      flex: 1; min-width: 160px; padding: 0.38rem 0.8rem; font-size: 0.82rem;
    }

    .event-list {
      display: flex; flex-direction: column; gap: 0.4rem;
      max-height: 420px; overflow-y: auto; padding-right: 0.15rem;
    }
    .event-list::-webkit-scrollbar       { width: 4px; }
    .event-list::-webkit-scrollbar-track  { background: transparent; }
    .event-list::-webkit-scrollbar-thumb  { background: var(--border-2); border-radius: 99px; }

    .ev {
      display: flex; align-items: flex-start; gap: 0.75rem;
      background: var(--bg); border: 1px solid var(--border);
      border-radius: var(--radius-sm); padding: 0.7rem 0.95rem;
      cursor: pointer; transition: border-color 0.14s, background 0.14s;
      user-select: none;
    }
    .ev:hover            { border-color: var(--border-2); }
    .ev.on               { border-color: var(--accent); background: var(--accent-bg); }
    .ev input[type='checkbox'] {
      width: auto; margin-top: 0.18rem; accent-color: var(--accent);
      flex-shrink: 0; cursor: pointer;
    }
    .ev-name { font-weight: 600; font-size: 0.88rem; }
    .ev-meta {
      color: var(--muted); font-size: 0.76rem; margin-top: 0.2rem; line-height: 1.5;
    }

    .empty { color: var(--muted); font-size: 0.88rem; padding: 1rem 0; text-align: center; }

    .footer {
      display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;
    }
    .count { font-size: 0.82rem; color: var(--muted); margin-left: auto; }

    .done-box {
      text-align: center; padding: 1.5rem 0;
      display: flex; flex-direction: column; align-items: center; gap: 1rem;
    }
    .done-box h3 { font-size: 1.1rem; color: var(--success); }
    .done-box p  { color: var(--muted); font-size: 0.85rem; max-width: 400px; }
  `];

  constructor() {
    super();
    this.events     = [];
    this.weeks      = 0;
    this.semester   = '';
    this.groupLabel = '';
    this._query     = '';
    this._selected  = new Set();
    this._loading   = false;
    this._error     = '';
    this._done      = false;
  }

  /** Called by app-shell after events arrive. */
  initSelection() {
    this._selected = new Set(this.events.map((_, i) => i));
    this._done = false;
  }

  get _filtered() {
    const q = this._query.toLowerCase();
    if (!q) return this.events;
    return this.events.filter(ev =>
      ev.summary.toLowerCase().includes(q) ||
      (ev.location || '').toLowerCase().includes(q) ||
      (ev.description || '').toLowerCase().includes(q),
    );
  }

  _toggle(i) {
    const s = new Set(this._selected);
    s.has(i) ? s.delete(i) : s.add(i);
    this._selected = s;
  }

  _selectAll(on) {
    this._selected = on ? new Set(this.events.map((_, i) => i)) : new Set();
  }

  _download() {
    this._error = '';
    const chosen = [...this._selected].sort().map(i => this.events[i]).filter(Boolean);
    if (!chosen.length) { this._error = 'Mindestens einen Termin auswählen.'; return; }
    this.dispatchEvent(new CustomEvent('download-ics', {
      bubbles: true, composed: true, detail: { events: chosen },
    }));
  }

  /** Called by app-shell after ICS is downloaded. */
  setDone()      { this._done = true; this._loading = false; }
  setLoading(v)  { this._loading = v; }
  setError(msg)  { this._error = msg; this._loading = false; }

  // ── Helpers ───────────────────────────────────────────
  _fmtDt(start, end) {
    if (!start) return '';
    try {
      const s = new Date(start);
      const e = end ? new Date(end) : null;
      const d = s.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
      const t1 = s.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      const t2 = e ? e.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
      return `${d}  ${t1}${t2 ? '–' + t2 : ''}`;
    } catch { return start; }
  }

  // ── Render ────────────────────────────────────────────
  render() {
    if (this._done) return this._renderDone();

    const filtered = this._filtered;
    return html`<div class="stack">
      <h2><span class="badge">2</span> Termine auswählen</h2>

      <p class="hint">
        <strong>${this.groupLabel}</strong> · ${this.events.length} Termine
        in ${this.weeks} Wochen
        ${this.semester ? html` · <code>${this.semester}</code>` : ''}
      </p>

      <div class="toolbar">
        <button class="btn-chip" @click=${() => this._selectAll(true)}>Alle</button>
        <button class="btn-chip" @click=${() => this._selectAll(false)}>Keine</button>
        <input type="search" placeholder="🔍 Filtern…"
               .value=${this._query} @input=${e => this._query = e.target.value} />
      </div>

      <div class="event-list">
        ${filtered.length
          ? filtered.map(ev => {
              const i = this.events.indexOf(ev);
              const on = this._selected.has(i);
              const meta = [
                this._fmtDt(ev.dtstart, ev.dtend),
                ev.location && `📍 ${ev.location}`,
                ev.description?.split('\n')[0],
              ].filter(Boolean).join('  ·  ');
              return html`
                <div class="ev ${on ? 'on' : ''}" @click=${() => this._toggle(i)}>
                  <input type="checkbox" .checked=${on}
                         @click=${e => e.stopPropagation()}
                         @change=${() => this._toggle(i)} />
                  <div>
                    <div class="ev-name">${ev.summary}</div>
                    ${meta ? html`<div class="ev-meta">${meta}</div>` : ''}
                  </div>
                </div>`;
            })
          : html`<p class="empty">Keine Treffer für „${this._query}"</p>`}
      </div>

      ${this._error ? html`<p class="error-msg">❌ ${this._error}</p>` : ''}

      <div class="footer">
        <button class="btn-ghost" @click=${() =>
            this.dispatchEvent(new CustomEvent('restart', { bubbles: true, composed: true }))}>
          ← Zurück
        </button>
        <span class="count">${this._selected.size} ausgewählt</span>
        <button class="btn-primary" ?disabled=${this._loading} @click=${this._download}>
          ${this._loading
            ? html`<span class="spinner"></span> Generiere…`
            : '📅 ICS herunterladen'}
        </button>
      </div>
    </div>`;
  }

  _renderDone() {
    return html`<div class="stack">
      <h2><span class="badge" style="background:var(--success)">✓</span> Fertig</h2>
      <div class="done-box">
        <h3>🎉 stundenplan.ics wurde heruntergeladen</h3>
        <p>
          Öffne die Datei mit Google Calendar, Apple Kalender oder Outlook
          um die Termine zu importieren.
        </p>
        <div class="row" style="justify-content:center">
          <button class="btn-primary" @click=${() =>
              this.dispatchEvent(new CustomEvent('restart', { bubbles: true, composed: true }))}>
            Neuen Plan erstellen
          </button>
        </div>
      </div>
    </div>`;
  }
}

customElements.define('timetable-view', TimetableView);
