import { LitElement, html, css } from 'https://esm.sh/lit@3';

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];
const START = 8, END = 20, HOURS = END - START, QROWS = HOURS * 4;

/**
 * <week-grid .slots=${[...]}></week-grid>
 * Each slot: { day: 1–5, start, end, label, title?, color, room }
 */
export class WeekGrid extends LitElement {
  static properties = { slots: { type: Array } };

  static styles = css`
    :host { display: block; }

    .grid {
      display: grid;
      grid-template-columns: 36px repeat(5, 1fr);
      grid-template-rows: 24px repeat(${QROWS}, 11px);
      font-size: 0.72rem;
      border-radius: var(--radius-sm, 7px);
      overflow: hidden;
      border: 1px solid var(--border, #2d3343);
      background: var(--bg, #0d1017);
    }

    .corner { grid-column: 1; grid-row: 1; background: var(--surface-2, #1c2333); }
    .day-hdr {
      grid-row: 1;
      display: flex; align-items: center; justify-content: center;
      font-weight: 600; font-size: 0.74rem;
      color: var(--muted, #919bab);
      background: var(--surface-2, #1c2333);
      border-left: 1px solid var(--border, #2d3343);
    }

    .time {
      grid-column: 1;
      display: flex; align-items: flex-start; justify-content: flex-end;
      padding-right: 5px; margin-top: -5px;
      color: var(--muted, #919bab);
      font-size: 0.62rem; line-height: 1;
    }

    .hline {
      grid-column: 2 / -1;
      border-top: 1px solid var(--border, #2d3343);
      pointer-events: none;
    }

    .day-col {
      position: relative;
      grid-row: 2 / -1;
      border-left: 1px solid var(--border, #2d3343);
    }

    .ev {
      position: absolute;
      border-radius: 4px;
      padding: 2px 4px;
      overflow: hidden;
      font-size: 0.68rem;
      line-height: 1.3;
      cursor: default;
      box-sizing: border-box;
    }
    .ev-label {
      font-weight: 600;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .ev-room {
      opacity: 0.7; font-size: 0.58rem;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    .empty-msg {
      grid-column: 1 / -1; grid-row: 2 / -1;
      display: flex; align-items: center; justify-content: center;
      color: var(--muted, #919bab); font-size: 0.82rem; z-index: 2;
    }
  `;

  constructor() { super(); this.slots = []; }

  _toMin(t) { const [h, m] = t.split(':').map(Number); return (h - START) * 60 + m; }

  _layoutDay(daySlots) {
    if (!daySlots.length) return [];
    const items = daySlots.map(s => ({
      ...s, startMin: this._toMin(s.start), endMin: this._toMin(s.end),
    })).sort((a, b) => a.startMin - b.startMin || (b.endMin - b.startMin) - (a.endMin - a.startMin));

    // Split into clusters of overlapping events
    const clusters = [];
    let cur = [items[0]], curEnd = items[0].endMin;
    for (let i = 1; i < items.length; i++) {
      if (items[i].startMin < curEnd) {
        cur.push(items[i]);
        curEnd = Math.max(curEnd, items[i].endMin);
      } else {
        clusters.push(cur);
        cur = [items[i]];
        curEnd = items[i].endMin;
      }
    }
    clusters.push(cur);

    // Layout each cluster independently — only overlapping events share columns
    const result = [];
    for (const group of clusters) {
      const cols = [];
      const assigned = [];
      for (const item of group) {
        let col = cols.findIndex(c => c[c.length - 1].endMin <= item.startMin);
        if (col === -1) { col = cols.length; cols.push([]); }
        cols[col].push(item);
        assigned.push(col);
      }
      const total = cols.length;
      for (let i = 0; i < group.length; i++)
        result.push({ ...group[i], left: assigned[i] / total, width: 1 / total });
    }
    return result;
  }

  render() {
    const slots = (this.slots || []).filter(s => s.day >= 1 && s.day <= 5);
    const hours = Array.from({ length: HOURS }, (_, i) => START + i);
    const totalH = QROWS * 11;

    const byDay = new Map();
    for (const s of slots) {
      if (!byDay.has(s.day)) byDay.set(s.day, []);
      byDay.get(s.day).push(s);
    }
    const laid = new Map();
    for (const [day, ds] of byDay) laid.set(day, this._layoutDay(ds));

    return html`<div class="grid">
      <div class="corner"></div>
      ${DAYS.map((d, i) => html`<div class="day-hdr" style="grid-column:${i + 2}">${d}</div>`)}

      ${hours.map(h => {
        const row = (h - START) * 4 + 2;
        return html`
          <div class="time" style="grid-row:${row}">${String(h).padStart(2, '0')}:00</div>
          <div class="hline" style="grid-row:${row}"></div>`;
      })}

      ${!slots.length ? html`<div class="empty-msg">Kurse auswählen…</div>` : ''}

      ${[1, 2, 3, 4, 5].map(day => html`
        <div class="day-col" style="grid-column:${day + 1}">
          ${(laid.get(day) || []).map(s => {
            const top = (s.startMin / (HOURS * 60)) * totalH;
            const h = ((s.endMin - s.startMin) / (HOURS * 60)) * totalH;
            return html`
              <div class="ev"
                   style="top:${top}px;height:${h}px;left:${s.left * 100}%;width:calc(${s.width * 100}% - 2px);
                          background:${s.color}18;border-left:3px solid ${s.color};color:${s.color}"
                   title="${s.label}\n${s.start}–${s.end}${s.room ? '\n📍 ' + s.room : ''}">
                <span class="ev-label">${s.label}</span>
                ${h > 38 && s.room ? html`<span class="ev-room">${s.room}</span>` : ''}
              </div>`;
          })}
        </div>`)}
    </div>`;
  }
}

customElements.define('week-grid', WeekGrid);
