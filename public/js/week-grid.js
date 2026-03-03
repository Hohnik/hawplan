import { LitElement, html, css } from 'https://esm.sh/lit@3';

const DAYS  = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
const START  = 8;   // 08:00
const END    = 20;  // 20:00
const HOURS  = END - START;
const QROWS  = HOURS * 4;  // 48 quarter-hour rows

/**
 * <week-grid .slots=${[...]}></week-grid>
 *
 * Each slot: { day: 1–5, start: 'HH:MM', end: 'HH:MM', label, color, room }
 * Pure presentational — no state, no events.
 */
export class WeekGrid extends LitElement {
  static properties = {
    slots: { type: Array },
  };

  static styles = css`
    :host { display: block; }

    .grid {
      display: grid;
      grid-template-columns: 36px repeat(5, 1fr);
      grid-template-rows: 22px repeat(${QROWS}, 11px);
      font-size: 0.7rem;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--border, #2a2d3e);
      background: var(--bg, #0f1117);
    }

    /* Header */
    .corner { grid-column: 1; grid-row: 1; background: var(--surface-2, #21263a); }
    .day-hdr {
      grid-row: 1;
      display: flex; align-items: center; justify-content: center;
      font-weight: 600; font-size: 0.72rem;
      color: var(--muted, #8b8fa8);
      background: var(--surface-2, #21263a);
      border-left: 1px solid var(--border, #2a2d3e);
    }

    /* Time labels */
    .time {
      grid-column: 1;
      display: flex; align-items: flex-start; justify-content: flex-end;
      padding-right: 5px; margin-top: -5px;
      color: var(--muted, #8b8fa8);
      font-size: 0.6rem; line-height: 1;
    }

    /* Hour lines */
    .hline {
      grid-column: 2 / -1;
      border-top: 1px solid var(--border, #2a2d3e);
      pointer-events: none;
    }

    /* Event blocks */
    .ev {
      border-radius: 4px;
      padding: 2px 5px;
      margin: 0 2px;
      overflow: hidden;
      font-size: 0.66rem;
      line-height: 1.3;
      cursor: default;
      z-index: 1;
      min-height: 0;
    }
    .ev-label {
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ev-room {
      opacity: 0.7;
      font-size: 0.58rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .empty-msg {
      grid-column: 1 / -1;
      grid-row: 2 / -1;
      display: flex; align-items: center; justify-content: center;
      color: var(--muted, #8b8fa8);
      font-size: 0.82rem;
      z-index: 2;
    }
  `;

  constructor() {
    super();
    this.slots = [];
  }

  /** 'HH:MM' → grid row number (1-based, row 1 = header, row 2 = first quarter). */
  _row(time) {
    const [h, m] = time.split(':').map(Number);
    return (h - START) * 4 + Math.floor(m / 15) + 2;
  }

  render() {
    const slots = (this.slots || []).filter(s => s.day >= 1 && s.day <= 5);
    const hours = Array.from({ length: HOURS }, (_, i) => START + i);

    return html`<div class="grid">
      <div class="corner"></div>
      ${DAYS.map((d, i) => html`<div class="day-hdr" style="grid-column:${i + 2}">${d}</div>`)}

      ${hours.map(h => {
        const row = (h - START) * 4 + 2;
        return html`
          <div class="time" style="grid-row:${row}">${String(h).padStart(2,'0')}:00</div>
          <div class="hline" style="grid-row:${row}"></div>`;
      })}

      ${slots.length === 0 ? html`<div class="empty-msg">Kurse auswählen…</div>` : ''}

      ${slots.map(s => {
        const rowS = this._row(s.start);
        const rowE = this._row(s.end);
        if (rowE <= rowS) return '';
        return html`
          <div class="ev"
               style="grid-column:${s.day + 1}; grid-row:${rowS}/${rowE};
                      background:${s.color}20; border-left:3px solid ${s.color};
                      color:${s.color};"
               title="${s.label}\n${s.start}–${s.end}${s.room ? '\n📍 ' + s.room : ''}">
            <span class="ev-label">${s.label}</span>
            ${(rowE - rowS >= 4 && s.room) ? html`<span class="ev-room">${s.room}</span>` : ''}
          </div>`;
      })}
    </div>`;
  }
}

customElements.define('week-grid', WeekGrid);
