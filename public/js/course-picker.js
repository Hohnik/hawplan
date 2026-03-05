import { LitElement, html, css } from 'https://esm.sh/lit@3';
import { shared } from './shared-styles.js';

const DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/**
 * <course-picker .courseTree .loaded .selected .loadingStgru .query></course-picker>
 *
 * Redesigned: search-first group picker with dropdown, active chips,
 * and flat course list as the main content area.
 *
 * Fires: 'load-group', 'unload-group', 'toggle-course', 'select-group'.
 */
export class CoursePicker extends LitElement {
  static properties = {
    courseTree: { type: Array },
    loaded: { type: Object },
    selected: { type: Object },
    loadingStgru: { type: String },
    query: { type: String },
    _dropOpen: { state: true },
  };

  static styles = [shared, css`
    :host { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

    /* ── Search + Dropdown ── */
    .search-area { position: relative; }
    .search-area input {
      width: 100%; background: var(--bg);
      border: 1px solid var(--border); border-radius: var(--radius-sm);
      color: var(--text); font-size: 13px; padding: 8px 12px; outline: none;
    }
    .search-area input:focus { border-color: var(--primary); }
    .search-area input::placeholder { color: var(--muted); opacity: 0.6; }

    .dropdown {
      position: fixed; z-index: 100;
      max-height: 260px; overflow-y: auto;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius-sm); box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    }
    .dropdown::-webkit-scrollbar { width: 4px; }
    .dropdown::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 99px; }
    .drop-item {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; cursor: pointer; transition: background 0.1s;
    }
    .drop-item:hover { background: var(--surface-2); }
    .drop-item.active { opacity: 0.4; pointer-events: none; }
    .drop-label { font-size: 12px; font-weight: 600; }
    .drop-path {
      font-size: 10px; color: var(--muted);
      font-family: var(--mono); letter-spacing: 0.2px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .drop-empty {
      padding: 16px 12px; text-align: center;
      font-size: 12px; color: var(--muted);
    }

    /* ── Active group chips ── */
    .chips {
      display: flex; flex-wrap: wrap; gap: 6px;
      padding: 10px 0 0;
      min-height: 0;
    }
    .chip {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 5px 10px; border-radius: 999px;
      font-size: 11px; font-weight: 600;
      font-family: var(--mono); letter-spacing: 0.3px;
      cursor: pointer; transition: all 0.12s;
    }
    .chip-active {
      background: var(--primary); color: var(--primary-fg);
    }
    .chip-active:hover { filter: brightness(1.1); }
    .chip-active .x { opacity: 0.5; font-size: 9px; }
    .chip-active .x:hover { opacity: 1; }
    .chip-loading {
      background: var(--accent-bg); color: var(--primary);
      border: 1px dashed var(--primary);
    }

    /* ── Course list ── */
    .course-list {
      flex: 1; overflow-y: auto; padding-top: 4px;
    }
    .course-list::-webkit-scrollbar { width: 4px; }
    .course-list::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 99px; }

    .grp-hdr {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 0 6px;
      border-bottom: 1px solid var(--border);
    }
    .grp-hdr:not(:first-child) { margin-top: 8px; }
    .grp-label {
      flex: 1; font-size: 10px; font-weight: 600; color: var(--muted);
      font-family: var(--mono); letter-spacing: 1px; text-transform: uppercase;
    }
    .grp-btn {
      font-size: 10px; font-weight: 600; font-family: var(--mono);
      background: none; border: none; cursor: pointer; padding: 2px 6px;
      border-radius: 4px;
    }
    .grp-btn-all { color: var(--primary); }
    .grp-btn-all:hover { background: var(--accent-bg); }
    .grp-btn-none { color: var(--muted); }
    .grp-btn-none:hover { background: var(--surface-2); }

    .course-item {
      display: flex; align-items: center; gap: 10px;
      padding: 7px 8px; border-radius: 6px;
      cursor: pointer; user-select: none; margin-top: 3px;
      transition: background 0.1s;
    }
    .course-item:hover { background: var(--surface-2); }
    .course-item.on { background: var(--accent-bg); }
    .course-item input[type='checkbox'] {
      accent-color: var(--primary); pointer-events: none; flex-shrink: 0;
    }
    .ci-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .ci-name {
      font-weight: 500; font-size: 12px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .ci-meta {
      font-family: var(--mono); font-size: 9px; font-weight: 500;
      color: var(--muted); letter-spacing: 0.3px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    .empty-hint {
      text-align: center; padding: 40px 20px;
      color: var(--muted); font-size: 13px; line-height: 1.6;
    }
    .empty-hint strong { color: var(--text); }
  `];

  constructor() {
    super();
    this.courseTree = [];
    this.loaded = new Map();
    this.selected = new Set();
    this.loadingStgru = null;
    this.query = '';
    this._dropOpen = false;
  }

  _fire(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  updated() {
    if (this._dropOpen) {
      const input = this.shadowRoot.querySelector('input');
      const drop = this.shadowRoot.querySelector('.dropdown');
      if (input && drop) {
        const r = input.getBoundingClientRect();
        const maxH = Math.min(260, window.innerHeight - r.bottom - 16);
        Object.assign(drop.style, {
          top: `${r.bottom + 4}px`,
          left: `${r.left}px`,
          width: `${r.width}px`,
          maxHeight: `${maxH}px`,
        });
      }
    }
  }

  /** Flatten all groups from the tree for search. */
  get _allGroups() {
    return (this.courseTree || []).flatMap(fac =>
      fac.degrees.flatMap(deg =>
        deg.programs.flatMap(prog =>
          prog.groups.map(g => ({
            ...g, path: [fac.label, prog.name || prog.code].filter(Boolean).join(' › '),
          }))
        )
      )
    );
  }

  /**
   * Fuzzy-match: subsequence search with scoring.
   * Returns { score, indices } or null. Consecutive matches and
   * start-of-word hits score higher.
   */
  _fuzzy(query, text) {
    const q = query.toLowerCase(), t = text.toLowerCase();
    let qi = 0, score = 0, indices = [], prev = -2;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
      if (t[ti] === q[qi]) {
        indices.push(ti);
        // consecutive bonus
        score += (ti === prev + 1) ? 8 : 1;
        // start-of-word bonus
        if (ti === 0 || ' ›·-_('.includes(t[ti - 1])) score += 5;
        prev = ti; qi++;
      }
    }
    return qi === q.length ? { score, indices } : null;
  }

  /** Groups matching the current query (fuzzy). */
  get _filteredGroups() {
    const q = (this.query || '').trim();
    if (!q) return [];
    return this._allGroups
      .map(g => {
        const targets = [g.label, g.program_name || '', g.path];
        let best = null;
        for (const t of targets) {
          const m = this._fuzzy(q, t);
          if (m && (!best || m.score > best.score)) best = m;
        }
        return best ? { ...g, _score: best.score } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b._score - a._score)
      .slice(0, 20);
  }

  _onInput(e) {
    this._fire('query-change', e.target.value);
    this._dropOpen = e.target.value.trim().length > 0;
  }

  _onFocus() {
    if ((this.query || '').trim()) this._dropOpen = true;
  }

  _pickGroup(g) {
    this._fire('load-group', g);
    this._fire('query-change', '');
    this._dropOpen = false;
  }

  render() {
    const loadedKeys = new Set([...this.loaded.keys()]);
    const hasLoaded = this.loaded.size > 0;

    return html`
      <div class="search-area">
        <input type="search" placeholder="Studiengang suchen"
               .value=${this.query}
               @input=${this._onInput}
               @focus=${this._onFocus}
               @blur=${() => setTimeout(() => { this._dropOpen = false; }, 200)} />
        ${this._dropOpen && this.query?.trim() ? this._renderDropdown(loadedKeys) : ''}
      </div>

      ${hasLoaded || this.loadingStgru ? html`
        <div class="chips">
          ${[...this.loaded].map(([stgru, group]) => html`
            <span class="chip chip-active"
                  @click=${() => this._fire('unload-group', { stgru })}>
              ${group.label} <span class="x">✕</span>
            </span>
          `)}
          ${this.loadingStgru ? html`
            <span class="chip chip-loading">
              <span class="spinner" style="width:10px;height:10px;border-width:1.5px"></span>
              Laden…
            </span>
          ` : ''}
        </div>
      ` : ''}

      <div class="course-list">
        ${hasLoaded ? this._renderCourses() : html`
          <div class="empty-hint">
            <strong>Kein Studiengang geladen</strong><br>
            wähle im Suchfeld deinen Studiengang (z.B. Künstliche Intelligenz,...)
          </div>
        `}
      </div>
    `;
  }

  _renderDropdown(loadedKeys) {
    const groups = this._filteredGroups;
    if (!groups.length) {
      return html`<div class="dropdown"><div class="drop-empty">Keine Gruppen für „${this.query}"</div></div>`;
    }
    return html`
      <div class="dropdown">
        ${groups.map(g => {
      const active = loadedKeys.has(g.stgru);
      return html`
            <div class="drop-item ${active ? 'active' : ''}"
                 @mousedown=${(e) => { e.preventDefault(); if (!active) this._pickGroup(g); }}>
              <div>
                <div class="drop-label">${g.label}${active ? ' ✓' : ''}</div>
                <div class="drop-path">${g.path}</div>
              </div>
            </div>`;
    })}
      </div>`;
  }

  _renderCourses() {
    return html`${[...this.loaded].map(([stgru, group]) => html`
      <div class="grp-hdr">
        <span class="grp-label">${group.label} · ${group.courses.length} Kurse</span>
        <button class="grp-btn grp-btn-all" @click=${() => this._fire('select-group', { stgru, on: true })}>Alle</button>
        <button class="grp-btn grp-btn-none" @click=${() => this._fire('select-group', { stgru, on: false })}>Keine</button>
      </div>
      ${group.courses.map(c => this._renderCourseItem(c))}
    `)}`;
  }

  _renderCourseItem(c) {
    const on = this.selected.has(c.id);
    const name = c.fullName || c.summary;
    const hasBi = c.slots.some(s => s.rhythmus === '14');
    const slots = c.slots.map(s => `${DAY_NAMES[s.day]} ${s.start}–${s.end}`).join(' · ');
    const meta = [slots, c.lecturer].filter(Boolean).join(' · ');

    return html`
      <div class="course-item ${on ? 'on' : ''}"
           @click=${() => this._fire('toggle-course', { id: c.id })}>
        <input type="checkbox" .checked=${on} />
        <div class="ci-info">
          <span class="ci-name">${name}</span>
          <span class="ci-meta">${meta}${hasBi ? ' · 14-tägig' : ''}</span>
        </div>
      </div>`;
  }
}

customElements.define('course-picker', CoursePicker);
