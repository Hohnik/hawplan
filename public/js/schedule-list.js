import { LitElement, html, css } from 'https://esm.sh/lit@3';

const DAY_LONG = ['SONNTAG','MONTAG','DIENSTAG','MITTWOCH','DONNERSTAG','FREITAG','SAMSTAG'];

/**
 * <schedule-list .slots=${[...]}></schedule-list>
 * Mobile day-by-day schedule view matching "Mobile — Schedule" pen design.
 * Each slot: { day, start, end, label, room, color, lecturer, rhythmus, courseId }
 * Fires 'slot-click' with { courseId }.
 */
export class ScheduleList extends LitElement {
  static properties = {
    slots: { type: Array },
  };

  static styles = css`
    :host { display: block; }
    *, *::before, *::after { box-sizing: border-box; }

    .sched-list { display: flex; flex-direction: column; }

    .day-section {
      display: flex; flex-direction: column; gap: 8px;
      padding: 12px 0;
    }
    .day-section + .day-section {
      border-top: 1px solid var(--border, #2E2E2E);
    }
    .day-label {
      font-family: var(--mono, monospace); font-size: 11px; font-weight: 600;
      letter-spacing: 2px;
    }
    .day-empty {
      font-family: var(--font, sans-serif); font-size: 12px;
      color: var(--muted, #B8B9B6); opacity: 0.5;
    }

    .card {
      display: flex; align-items: center; gap: 12px;
      border-radius: 8px; padding: 12px 14px;
      width: 100%; min-width: 0; cursor: pointer; transition: filter 0.1s;
    }
    .card:hover { filter: brightness(1.1); }
    .card.excluded { opacity: 0.25; text-decoration: line-through; filter: grayscale(0.8); }
    .card.excluded:hover { opacity: 0.45; filter: grayscale(0.5); }

    .time {
      display: flex; flex-direction: column; align-items: center; gap: 1px;
      font-family: var(--mono, monospace); font-weight: 600;
    }
    .time-start { font-size: 14px; }
    .time-end { font-size: 11px; opacity: 0.6; }

    .divider {
      width: 2px; height: 32px; border-radius: 1px; opacity: 0.3;
    }

    .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .name {
      font-family: var(--font, sans-serif); font-size: 13px; font-weight: 600;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .meta {
      font-family: var(--mono, monospace); font-size: 10px; font-weight: 500;
      letter-spacing: 0.3px; opacity: 0.6;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
  `;

  constructor() {
    super();
    this.slots = [];
  }

  _buildDaySchedule() {
    const days = [1, 2, 3, 4, 5, 6];
    return days
      .map(day => {
        const daySlots = (this.slots || [])
          .filter(s => s.day === day)
          .sort((a, b) => a.start.localeCompare(b.start));
        return { day, label: DAY_LONG[day], slots: daySlots };
      })
      .filter(d => d.slots.length > 0 || d.day <= 5);
  }

  _cardFg(bg) {
    const hex = bg.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#111111' : '#FFFFFF';
  }

  _onCardClick(s) {
    if (s.courseId) {
      this.dispatchEvent(new CustomEvent('slot-click', {
        detail: { courseId: s.courseId, slotKey: s.slotKey }, bubbles: true, composed: true,
      }));
    }
  }

  render() {
    const schedule = this._buildDaySchedule();
    return html`
      <div class="sched-list">
        ${schedule.map(d => this._renderDay(d))}
      </div>`;
  }

  _renderDay({ day, label, slots }) {
    const has = slots.length > 0;
    return html`
      <div class="day-section">
        <span class="day-label" style="color:${has ? 'var(--text)' : 'var(--muted)'}">${label}</span>
        ${has
          ? slots.map(s => this._renderCard(s))
          : html`<span class="day-empty">Keine Kurse</span>`}
      </div>`;
  }

  _renderCard(s) {
    const fg = this._cardFg(s.color);
    const isBi = s.rhythmus === '14';
    return html`
      <div class="card ${s.excluded ? 'excluded' : ''}" style="background:${s.color}"
           @click=${() => this._onCardClick(s)}>
        <div class="time" style="color:${fg}">
          <span class="time-start">${s.start}</span>
          <span class="time-end">${s.end}</span>
        </div>
        <div class="divider" style="background:${fg}"></div>
        <div class="info">
          <span class="name" style="color:${fg}">${s.label}</span>
          <span class="meta" style="color:${fg}">
            ${s.room ? `Raum ${s.room}` : ''}${isBi ? ' · 14-tägig' : ''}
          </span>
        </div>
      </div>`;
  }
}

customElements.define('schedule-list', ScheduleList);
