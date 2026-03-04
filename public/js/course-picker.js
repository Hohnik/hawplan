import { LitElement, html, css } from 'https://esm.sh/lit@3';
import { shared } from './shared-styles.js';

const DAY_NAMES = ['So','Mo','Di','Mi','Do','Fr','Sa'];

/**
 * <course-picker .courseTree=${[...]} .loaded=${Map} .selected=${Set}></course-picker>
 * Renders the faculty tree accordion + course list with checkboxes.
 * Fires: 'load-group', 'unload-group', 'toggle-course', 'select-group'.
 */
export class CoursePicker extends LitElement {
  static properties = {
    courseTree:    { type: Array },
    loaded:       { type: Object },
    selected:     { type: Object },
    loadingStgru: { type: String },
    query:        { type: String },
    _open:        { state: true },
  };

  static styles = [shared, css`
    :host { display: block; }

    .tree { border-top: 1px solid var(--border); }

    .row-fac, .row-deg, .row-prog {
      display: flex; align-items: center; gap: 0.45rem;
      cursor: pointer; transition: background 0.1s;
      border-bottom: 1px solid var(--border);
    }
    .row-fac:hover, .row-deg:hover, .row-prog:hover { background: var(--surface-2); }
    .row-fac  { padding: 12px 24px; font-size: 13px; font-weight: 600; }
    .row-deg  { padding: 10px 24px 10px 40px; font-size: 12px; color: var(--muted); font-weight: 600; }
    .row-prog { padding: 8px 24px 8px 56px; font-size: 12px; }
    .arrow { color: var(--muted); font-size: 0.55em; width: 0.8em; flex-shrink: 0; }
    .prog-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .count { font-size: 0.72rem; color: var(--muted); margin-left: auto; flex-shrink: 0; }

    .chips-row {
      display: flex; flex-wrap: wrap; gap: 0.3rem;
      padding: 8px 24px 10px 64px;
      background: var(--bg); border-bottom: 1px solid var(--border);
    }
    .chip {
      padding: 0.22rem 0.55rem; font-size: 0.74rem;
      border-radius: 99px; border: 1px solid var(--border);
      background: var(--bg); color: var(--muted);
      cursor: pointer; transition: all 0.12s;
      display: inline-flex; align-items: center; gap: 0.2rem;
    }
    .chip:hover { border-color: var(--primary); color: var(--text); }
    .chip.active {
      background: var(--accent-bg); border-color: var(--primary);
      color: var(--primary); font-weight: 600;
    }
    .chip.loading { opacity: 0.5; pointer-events: none; }
    .chip .x { font-size: 0.55rem; opacity: 0.6; }

    .courses-section { padding: 8px 24px 0; }
    .grp-hdr {
      display: flex; align-items: center; gap: 0.5rem;
      font-size: 0.72rem; font-weight: 600; color: var(--muted);
      font-family: var(--mono); letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-top: 8px; padding-bottom: 4px;
      border-bottom: 1px solid var(--border);
    }
    .grp-hdr span:first-child { flex: 1; }

    .course-item {
      display: flex; align-items: center; gap: 10px;
      padding: 6px 8px; border-radius: 4px; background: var(--bg);
      cursor: pointer; user-select: none; margin-top: 4px;
    }
    .course-item:hover { background: var(--surface-2); }
    .course-item.on { background: var(--accent-bg); }
    .course-item input[type='checkbox'] {
      accent-color: var(--primary); pointer-events: none; flex-shrink: 0;
    }
    .ci-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .ci-name {
      font-weight: 500; font-size: 12px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .ci-meta {
      font-family: var(--mono); font-size: 9px; font-weight: 500;
      color: var(--muted); letter-spacing: 0.3px;
    }
  `];

  constructor() {
    super();
    this.courseTree = [];
    this.loaded = new Map();
    this.selected = new Set();
    this.loadingStgru = null;
    this.query = '';
    this._open = new Set();
  }

  _toggleOpen(key) {
    const s = new Set(this._open);
    s.has(key) ? s.delete(key) : s.add(key);
    this._open = s;
  }

  _fire(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  render() {
    const q = this.query.toLowerCase();
    const loadedKeys = new Set([...this.loaded.keys()]);
    return html`
      <div class="tree">
        ${(this.courseTree || []).map(fac => this._renderFac(fac, q, loadedKeys))}
      </div>
      ${this.loaded.size > 0 ? this._renderCourseList(loadedKeys) : ''}
    `;
  }

  _renderFac(fac, q, loadedKeys) {
    const allGroups = fac.degrees.flatMap(d => d.programs.flatMap(p => p.groups));
    const matches = q
      ? allGroups.filter(g => g.label.toLowerCase().includes(q)
          || (g.program_name || '').toLowerCase().includes(q)
          || fac.label.toLowerCase().includes(q))
      : allGroups;
    if (!matches.length) return '';
    const key = `fac::${fac.label}`;
    const open = q || this._open.has(key);
    const loadedN = allGroups.filter(g => loadedKeys.has(g.stgru)).length;
    return html`
      <div class="row-fac" @click=${() => !q && this._toggleOpen(key)}>
        <span class="arrow">${open ? '▾' : '▸'}</span>
        ${fac.label}
        <span class="count">${allGroups.length}${loadedN ? html` · <strong>${loadedN} aktiv</strong>` : ''}</span>
      </div>
      ${open ? fac.degrees.map(deg => this._renderDeg(fac, deg, q, loadedKeys)) : ''}`;
  }

  _renderDeg(fac, deg, q, loadedKeys) {
    const allGroups = deg.programs.flatMap(p => p.groups);
    const matches = q
      ? allGroups.filter(g => g.label.toLowerCase().includes(q)
          || (g.program_name || '').toLowerCase().includes(q)
          || fac.label.toLowerCase().includes(q))
      : allGroups;
    if (!matches.length) return '';
    const key = `deg::${fac.label}::${deg.label}`;
    const open = q || this._open.has(key);
    return html`
      <div class="row-deg" @click=${() => !q && this._toggleOpen(key)}>
        <span class="arrow">${open ? '▾' : '▸'}</span>
        ${deg.label}
        <span class="count">${allGroups.length}</span>
      </div>
      ${open ? deg.programs.map(prog => this._renderProg(fac, deg, prog, q, loadedKeys)) : ''}`;
  }

  _renderProg(fac, deg, prog, q, loadedKeys) {
    const groups = q
      ? prog.groups.filter(g => g.label.toLowerCase().includes(q)
          || (g.program_name || '').toLowerCase().includes(q)
          || fac.label.toLowerCase().includes(q))
      : prog.groups;
    if (!groups.length) return '';
    const key = `prog::${fac.label}::${prog.code}`;
    const open = q || this._open.has(key);
    return html`
      <div class="row-prog" @click=${() => !q && this._toggleOpen(key)}>
        <span class="arrow">${open ? '▾' : '▸'}</span>
        <span class="prog-name">${prog.name || prog.code}</span>
        <span class="count">${groups.length}</span>
      </div>
      ${open ? html`
        <div class="chips-row">
          ${groups.map(g => {
            const active = loadedKeys.has(g.stgru);
            const loading = this.loadingStgru === g.stgru;
            return html`
              <span class="chip ${active ? 'active' : ''} ${loading ? 'loading' : ''}"
                    @click=${e => { e.stopPropagation(); this._fire(active ? 'unload-group' : 'load-group', g); }}>
                ${loading ? html`<span class="spinner" style="width:10px;height:10px;border-width:1.5px"></span>` : ''}
                ${g.label}${active ? html` <span class="x">✕</span>` : ''}
              </span>`;
          })}
        </div>` : ''}`;
  }

  _renderCourseList() {
    return html`
      <div class="courses-section">
        ${[...this.loaded].map(([stgru, group]) => html`
          <div class="grp-hdr">
            <span>${group.label} · ${group.courses.length} Kurse</span>
            <button class="btn-chip" @click=${() => this._fire('select-group', { stgru, on: true })}>Alle</button>
            <button class="btn-chip" @click=${() => this._fire('select-group', { stgru, on: false })}>Keine</button>
          </div>
          ${group.courses.map(c => this._renderCourseItem(c))}
        `)}
      </div>`;
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
          <span class="ci-meta">${meta}${hasBi ? ' · Bi-weekly' : ''}</span>
        </div>
      </div>`;
  }
}

customElements.define('course-picker', CoursePicker);
