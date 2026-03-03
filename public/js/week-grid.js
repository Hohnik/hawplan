import { LitElement, html, css } from 'https://esm.sh/lit@3';

const DAYS  = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
const START  = 8;
const END    = 20;
const HOURS  = END - START;
const QROWS  = HOURS * 4;

/**
 * <week-grid .slots=${[...]}></week-grid>
 *
 * Each slot: { day: 1–5, start: 'HH:MM', end: 'HH:MM', label, color, room }
 * Handles overlapping slots by subdividing them side-by-side.
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

    .corner { grid-column: 1; grid-row: 1; background: var(--surface-2, #21263a); }
    .day-hdr {
      grid-row: 1;
      display: flex; align-items: center; justify-content: center;
      font-weight: 600; font-size: 0.72rem;
      color: var(--muted, #8b8fa8);
      background: var(--surface-2, #21263a);
      border-left: 1px solid var(--border, #2a2d3e);
    }

    .time {
      grid-column: 1;
      display: flex; align-items: flex-start; justify-content: flex-end;
      padding-right: 5px; margin-top: -5px;
      color: var(--muted, #8b8fa8);
      font-size: 0.6rem; line-height: 1;
    }

    .hline {
      grid-column: 2 / -1;
      border-top: 1px solid var(--border, #2a2d3e);
      pointer-events: none;
    }

    /* Day column container for overlap handling */
    .day-col {
      position: relative;
      grid-row: 2 / -1;
      border-left: 1px solid var(--border, #2a2d3e);
    }

    .ev {
      position: absolute;
      border-radius: 4px;
      padding: 2px 4px;
      overflow: hidden;
      font-size: 0.66rem;
      line-height: 1.3;
      cursor: default;
      box-sizing: border-box;
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

  /** 'HH:MM' → minutes since START hour. */
  _toMin(time) {
    const [h, m] = time.split(':').map(Number);
    return (h - START) * 60 + m;
  }

  /** 'HH:MM' → grid row (for time labels / hlines only). */
  _row(time) {
    const [h, m] = time.split(':').map(Number);
    return (h - START) * 4 + Math.floor(m / 15) + 2;
  }

  /**
   * Compute overlap groups for a single day's slots.
   * Returns each slot with { left, width } as fractions (0–1).
   */
  _layoutDay(daySlots) {
    if (!daySlots.length) return [];

    // Sort by start, then by duration descending (longer first)
    const items = daySlots.map(s => ({
      ...s,
      startMin: this._toMin(s.start),
      endMin:   this._toMin(s.end),
    })).sort((a, b) => a.startMin - b.startMin || (b.endMin - b.startMin) - (a.endMin - a.startMin));

    // Greedy column assignment
    const columns = []; // each column = array of {endMin}
    const assigned = []; // parallel to items: column index

    for (const item of items) {
      let col = columns.findIndex(c => c[c.length - 1].endMin <= item.startMin);
      if (col === -1) {
        col = columns.length;
        columns.push([]);
      }
      columns[col].push(item);
      assigned.push(col);
    }

    // Now find max overlap for each item to determine width
    const totalCols = columns.length;
    return items.map((item, i) => ({
      ...item,
      left:  assigned[i] / totalCols,
      width: 1 / totalCols,
    }));
  }

  render() {
    const slots = (this.slots || []).filter(s => s.day >= 1 && s.day <= 5);
    const hours = Array.from({ length: HOURS }, (_, i) => START + i);
    const totalHeight = QROWS * 11; // px

    // Group slots by day
    const byDay = new Map();
    for (const s of slots) {
      if (!byDay.has(s.day)) byDay.set(s.day, []);
      byDay.get(s.day).push(s);
    }

    // Layout each day with overlap handling
    const laidOut = new Map();
    for (const [day, daySlots] of byDay) {
      laidOut.set(day, this._layoutDay(daySlots));
    }

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

      ${[1,2,3,4,5].map(day => html`
        <div class="day-col" style="grid-column:${day + 1}">
          ${(laidOut.get(day) || []).map(s => {
            const top  = (s.startMin / (HOURS * 60)) * totalHeight;
            const h    = ((s.endMin - s.startMin) / (HOURS * 60)) * totalHeight;
            const left  = s.left * 100;
            const width = s.width * 100;
            const tall  = h > 40;
            return html`
              <div class="ev"
                   style="top:${top}px; height:${h}px; left:${left}%; width:calc(${width}% - 3px);
                          background:${s.color}20; border-left:3px solid ${s.color};
                          color:${s.color};"
                   title="${s.label}\n${s.start}–${s.end}${s.room ? '\n📍 ' + s.room : ''}">
                <span class="ev-label">${s.label}</span>
                ${tall && s.room ? html`<span class="ev-room">${s.room}</span>` : ''}
              </div>`;
          })}
        </div>
      `)}
    </div>`;
  }
}

customElements.define('week-grid', WeekGrid);
