import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { base } from './shared-styles.js';

/**
 * <step-events>
 * Step 2 – shows the fetched events as a filterable, selectable list.
 *
 * Properties (set by app-shell):
 *   events  – Array of normalised event objects
 *   weeks   – Number of weeks fetched
 *   rawFirst – Raw first-week response (shown when no events parsed)
 *
 * Emits:
 *   CustomEvent('generate-ics', { detail: { events: [...selected] } })
 *   CustomEvent('back')
 */
export class StepEvents extends LitElement {
  static properties = {
    events:   { type: Array  },
    weeks:    { type: Number },
    rawFirst: { type: Object },

    _query:   { state: true },
    _selected:{ state: true },   // Set of event indices
    _loading: { state: true },
    _error:   { state: true },
  };

  static styles = [base, css`
    .toolbar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    input[type='search'] {
      flex: 1;
      min-width: 160px;
      padding: 0.38rem 0.8rem;
      font-size: 0.82rem;
    }

    .event-list {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      max-height: 420px;
      overflow-y: auto;
      padding-right: 0.15rem;
    }

    /* Thin scrollbar */
    .event-list::-webkit-scrollbar { width: 4px; }
    .event-list::-webkit-scrollbar-track { background: transparent; }
    .event-list::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 99px; }

    .event-item {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 0.7rem 0.95rem;
      cursor: pointer;
      transition: border-color 0.14s, background 0.14s;
      user-select: none;
    }
    .event-item:hover { border-color: var(--border-2); }
    .event-item.selected {
      border-color: var(--accent);
      background: var(--accent-bg);
    }

    input[type='checkbox'] {
      width: auto;
      margin-top: 0.18rem;
      accent-color: var(--accent);
      flex-shrink: 0;
      cursor: pointer;
    }

    .event-name { font-weight: 600; font-size: 0.88rem; }
    .event-meta { color: var(--muted); font-size: 0.76rem; margin-top: 0.2rem; line-height: 1.5; }

    .empty { color: var(--muted); font-size: 0.88rem; padding: 1rem 0; text-align: center; }

    /* Debug panel */
    .debug {
      background: var(--bg);
      border: 1px solid var(--error-bdr);
      border-radius: var(--radius-sm);
      padding: 1rem;
    }
    .debug strong { color: var(--error); font-size: 0.85rem; }
    pre {
      margin-top: 0.5rem;
      font-family: var(--mono);
      font-size: 0.75rem;
      color: var(--accent-h);
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 280px;
      overflow-y: auto;
    }

    .footer-row {
      display: flex;
      gap: 0.75rem;
      align-items: center;
      flex-wrap: wrap;
    }
    .count-label { font-size: 0.82rem; color: var(--muted); margin-left: auto; }
  `];

  constructor() {
    super();
    this.events   = [];
    this.weeks    = 0;
    this.rawFirst = null;
    this._query   = '';
    this._selected = new Set();
    this._loading = false;
    this._error   = '';
  }

  /* Called by app-shell after new events arrive */
  initSelection() {
    this._selected = new Set(this.events.map((_, i) => i));
  }

  get _filtered() {
    const q = this._query.toLowerCase();
    if (!q) return this.events;
    return this.events.filter(ev =>
      ev.summary.toLowerCase().includes(q) ||
      (ev.location    || '').toLowerCase().includes(q) ||
      (ev.description || '').toLowerCase().includes(q),
    );
  }

  _toggle(idx) {
    const s = new Set(this._selected);
    s.has(idx) ? s.delete(idx) : s.add(idx);
    this._selected = s;
  }

  _selectAll(state) {
    this._selected = state ? new Set(this.events.map((_, i) => i)) : new Set();
  }

  _generate() {
    this._error = '';
    const chosen = [...this._selected].map(i => this.events[i]).filter(Boolean);
    if (!chosen.length) { this._error = 'Bitte mindestens einen Termin auswählen.'; return; }
    this.dispatchEvent(new CustomEvent('generate-ics', {
      bubbles: true, composed: true,
      detail: { events: chosen },
    }));
  }

  setLoading(v) { this._loading = v; }
  setError(msg)  { this._error = msg; }

  /* ── helpers ─────────────────────────────────────────────── */
  _fmtDt(dtstart, dtend) {
    if (!dtstart) return '';
    try {
      const s = new Date(dtstart);
      const e = dtend ? new Date(dtend) : null;
      const d = s.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
      const t1 = s.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      const t2 = e ? e.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
      return `${d}  ${t1}${t2 ? '–' + t2 : ''}`;
    } catch { return dtstart; }
  }

  /* ── render ──────────────────────────────────────────────── */
  _renderDebug() {
    return html`
      <div class="debug">
        <strong>🐛 Unbekanntes Antwortformat — bitte teile diesen Output:</strong>
        <pre>${JSON.stringify(this.rawFirst, null, 2)}</pre>
      </div>
    `;
  }

  _renderEventItem(ev, globalIdx) {
    const selected = this._selected.has(globalIdx);
    const meta = [
      this._fmtDt(ev.dtstart, ev.dtend),
      ev.location && `📍 ${ev.location}`,
      ev.description?.split('\n')[0],
    ].filter(Boolean).join('  ·  ');

    return html`
      <div
        class="event-item ${selected ? 'selected' : ''}"
        @click=${() => this._toggle(globalIdx)}
      >
        <input type="checkbox" .checked=${selected}
               @click=${e => e.stopPropagation()}
               @change=${() => this._toggle(globalIdx)} />
        <div>
          <div class="event-name">${ev.summary}</div>
          ${meta ? html`<div class="event-meta">${meta}</div>` : ''}
        </div>
      </div>
    `;
  }

  render() {
    const noEvents  = !this.events.length;
    const filtered  = this._filtered;
    const selCount  = this._selected.size;

    return html`
      <div class="stack">
        <h2><span class="badge">2</span> Veranstaltungen auswählen</h2>

        ${noEvents
          ? this._renderDebug()
          : html`
            <p class="hint">
              ${this.events.length} Termin${this.events.length !== 1 ? 'e' : ''}
              in ${this.weeks} Wochen gefunden.
            </p>

            <div class="toolbar">
              <button class="btn-chip" @click=${() => this._selectAll(true)}>Alle auswählen</button>
              <button class="btn-chip" @click=${() => this._selectAll(false)}>Alle abwählen</button>
              <input
                type="search"
                placeholder="🔍 Filtern…"
                .value=${this._query}
                @input=${e => this._query = e.target.value}
              />
            </div>

            <div class="event-list">
              ${filtered.length
                ? filtered.map(ev => this._renderEventItem(ev, this.events.indexOf(ev)))
                : html`<p class="empty">Keine Treffer für „${this._query}"</p>`
              }
            </div>

            ${this._error ? html`<p class="error-msg">❌ ${this._error}</p>` : ''}

            <div class="footer-row">
              <button class="btn-ghost" @click=${() => this.dispatchEvent(new CustomEvent('back', { bubbles: true, composed: true }))}>
                ← Zurück
              </button>
              <span class="count-label">${selCount} ausgewählt</span>
              <button class="btn-primary" ?disabled=${this._loading} @click=${this._generate}>
                ${this._loading
                  ? html`<span class="spinner"></span> Generiere…`
                  : 'ICS herunterladen →'
                }
              </button>
            </div>
        `}
      </div>
    `;
  }
}

customElements.define('step-events', StepEvents);
