import { LitElement, html, css } from 'https://esm.sh/lit@3';

const ALL_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const START = 8, END = 20, HOURS = END - START, QROWS = HOURS * 4;

/**
 * <week-grid .slots=${[...]}></week-grid>
 * Each slot: { day: 1–6, start, end, label, tag?, color, room,
 *              lecturer?, eventCount?, rhythmus?, weeks?: Set, courseId? }
 * Fires 'slot-click' with { courseId } when an event is clicked.
 */
export class WeekGrid extends LitElement {
  static properties = { slots: { type: Array } };

  static styles = css`
    :host { display: block; }

    .grid {
      display: grid;
      grid-template-rows: 24px repeat(${QROWS}, 11px);
      font-size: 0.72rem;
      border-radius: var(--radius-sm, 8px);
      overflow: hidden;
      border: 1px solid var(--border, #2E2E2E);
      background: var(--bg, #111111);
    }

    .corner { grid-column: 1; grid-row: 1; background: var(--surface-2, #2E2E2E); }
    .day-hdr {
      grid-row: 1;
      display: flex; align-items: center; justify-content: center;
      font-weight: 600; font-size: 0.74rem;
      font-family: var(--mono, monospace);
      letter-spacing: 2px;
      color: var(--text, #FFFFFF);
      background: var(--surface-2, #2E2E2E);
      border-left: 1px solid var(--border, #2E2E2E);
    }

    .time {
      grid-column: 1;
      display: flex; align-items: flex-start; justify-content: flex-end;
      padding-right: 5px; margin-top: -5px;
      color: var(--muted, #B8B9B6);
      font-family: var(--mono, monospace);
      font-size: 0.62rem; line-height: 1;
    }

    .hline {
      grid-column: 2 / -1;
      border-top: 1px solid var(--border, #2E2E2E);
      pointer-events: none;
    }

    .day-col {
      position: relative;
      grid-row: 2 / -1;
      border-left: 1px solid var(--border, #2E2E2E);
    }

    .ev {
      position: absolute;
      border-radius: 4px;
      padding: 2px 4px;
      overflow: hidden;
      font-size: 0.68rem;
      line-height: 1.3;
      cursor: pointer;
      box-sizing: border-box;
    }
    .ev:hover { filter: brightness(1.3); }
    .ev.conflict {
      outline: 1.5px dashed rgba(255,92,51,0.7);
      outline-offset: -1.5px;
    }
    .ev-label {
      font-weight: 600;
      font-family: var(--font, sans-serif);
      overflow: hidden;
      display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
      text-shadow: 0 0 0 transparent; /* ensure crisp text on colored bg */
    }
    .ev-sub {
      font-size: 0.58rem;
      font-family: var(--mono, monospace);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      opacity: 0.7;
    }

    .empty-msg {
      grid-column: 1 / -1; grid-row: 2 / -1;
      display: flex; align-items: center; justify-content: center;
      color: var(--muted, #B8B9B6); font-size: 0.82rem; z-index: 2;
    }
  `;

  constructor() { super(); this.slots = []; }

  _toMin(t) { const [h, m] = t.split(':').map(Number); return (h - START) * 60 + m; }

  /** Pick dark/light text for readable contrast on a colored background. */
  _contrastFg(hex) {
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#111111' : '#FFFFFF';
  }

  _layoutDay(daySlots) {
    if (!daySlots.length) return [];
    const items = daySlots.map(s => ({
      ...s, startMin: this._toMin(s.start), endMin: this._toMin(s.end),
    })).sort((a, b) => a.startMin - b.startMin || (b.endMin - b.startMin) - (a.endMin - a.startMin));

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
      for (let i = 0; i < group.length; i++) {
        let conflict = false;
        if (total > 1) {
          const a = group[i];
          for (let j = 0; j < group.length && !conflict; j++) {
            if (i === j) continue;
            const b = group[j];
            if (a.startMin >= b.endMin || b.startMin >= a.endMin) continue;
            if (a.weeks?.size && b.weeks?.size) {
              for (const w of a.weeks) { if (b.weeks.has(w)) { conflict = true; break; } }
            } else {
              conflict = true;
            }
          }
        }
        result.push({ ...group[i], left: assigned[i] / total, width: 1 / total, conflict });
      }
    }
    return result;
  }

  _tooltip(s) {
    const lines = [s.label];
    if (s.tag) lines[0] += ` (${s.tag})`;
    lines.push(`${s.start}–${s.end}`);
    if (s.room) lines.push(`${s.room}`);
    if (s.lecturer) lines.push(`${s.lecturer}`);
    const r = s.rhythmus;
    const n = s.eventCount || '';
    if (r === '14') lines.push(`Alle 2 Wochen${n ? ` · ${n} Termine` : ''}`);
    else if (n) lines.push(`Wöchentlich · ${n} Termine`);
    if (s.weeks?.size && r === '14') {
      const wks = [...s.weeks].sort((a, b) => a - b);
      lines.push(`KW ${wks.join(', ')}`);
    }
    return lines.join('\n');
  }

  _onClick(s) {
    if (s.courseId) {
      this.dispatchEvent(new CustomEvent('slot-click', {
        detail: { courseId: s.courseId }, bubbles: true, composed: true,
      }));
    }
  }

  render() {
    const hasSat = (this.slots || []).some(s => s.day === 6);
    const dayCount = hasSat ? 6 : 5;
    const days = ALL_DAYS.slice(0, dayCount);
    const dayNums = Array.from({ length: dayCount }, (_, i) => i + 1);

    const slots = (this.slots || []).filter(s => s.day >= 1 && s.day <= dayCount);
    const hours = Array.from({ length: HOURS }, (_, i) => START + i);
    const totalH = QROWS * 11;

    const byDay = new Map();
    for (const s of slots) {
      if (!byDay.has(s.day)) byDay.set(s.day, []);
      byDay.get(s.day).push(s);
    }
    const laid = new Map();
    for (const [day, ds] of byDay) laid.set(day, this._layoutDay(ds));

    return html`<div class="grid"
      style="grid-template-columns: 36px repeat(${dayCount}, 1fr)">
      <div class="corner"></div>
      ${days.map((d, i) => html`<div class="day-hdr" style="grid-column:${i + 2}">${d}</div>`)}

      ${hours.map(h => {
        const row = (h - START) * 4 + 2;
        return html`
          <div class="time" style="grid-row:${row}">${String(h).padStart(2, '0')}:00</div>
          <div class="hline" style="grid-row:${row}"></div>`;
      })}

      ${!slots.length ? html`<div class="empty-msg">Kurse auswählen…</div>` : ''}

      ${dayNums.map(day => html`
        <div class="day-col" style="grid-column:${day + 1}">
          ${(laid.get(day) || []).map(s => {
            const top = (s.startMin / (HOURS * 60)) * totalH;
            const h = ((s.endMin - s.startMin) / (HOURS * 60)) * totalH;
            const fg = this._contrastFg(s.color);
            return html`
              <div class="ev ${s.conflict ? 'conflict' : ''}"
                   style="top:${top}px;height:${h}px;left:${s.left * 100}%;width:calc(${s.width * 100}% - 2px);
                          background:${s.color};color:${fg}"
                   title=${this._tooltip(s)}
                   @click=${() => this._onClick(s)}>
                <span class="ev-label">${s.label}</span>
                ${h > 30 ? html`<span class="ev-sub">${s.start} – ${s.end}</span>` : ''}
                ${h > 45 && s.room ? html`<span class="ev-sub">${s.room}</span>` : ''}
              </div>`;
          })}
        </div>`)}
    </div>`;
  }
}

customElements.define('week-grid', WeekGrid);
