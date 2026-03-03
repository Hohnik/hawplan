import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { base } from './shared-styles.js';

/**
 * <step-credentials>
 * Step 1 – collects all Primuss session data from the user.
 * Emits: CustomEvent('fetch-request', { detail: { cookies, session, user, stgru, sem, date_from, date_to } })
 */
export class StepCredentials extends LitElement {
  static properties = {
    _error:   { state: true },
    _loading: { state: true },
  };

  static styles = [base, css`
    details {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      font-size: 0.85rem;
    }
    summary {
      padding: 0.75rem 1rem;
      cursor: pointer;
      color: var(--accent-h);
      font-weight: 500;
      list-style: none;
      user-select: none;
    }
    summary::-webkit-details-marker { display: none; }
    summary::before { content: '▶  '; font-size: 0.7em; }
    details[open] summary::before { content: '▼  '; }

    ol {
      padding: 0.75rem 1rem 0.85rem 2rem;
      border-top: 1px solid var(--border);
      color: var(--muted);
      line-height: 1.8;
    }

    .presets {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .preset-label { font-size: 0.8rem; color: var(--muted); }
  `];

  constructor() {
    super();
    this._error   = '';
    this._loading = false;
  }

  /* pre-fill semester dates */
  _setDates(from, to) {
    this.shadowRoot.getElementById('date-from').value = from;
    this.shadowRoot.getElementById('date-to').value   = to;
  }

  _validate() {
    const g = id => this.shadowRoot.getElementById(id)?.value.trim() ?? '';
    if (!g('cookies'))   return 'Cookie-String fehlt.';
    if (!g('session'))   return 'Session fehlt (aus der URL).';
    if (!g('user'))      return 'User fehlt (aus der URL).';
    if (!g('stgru'))     return 'Studiengruppe (stgru) fehlt.';
    if (!g('date-from')) return 'Startdatum fehlt.';
    if (!g('date-to'))   return 'Enddatum fehlt.';
    if (g('date-from') > g('date-to')) return 'Startdatum muss vor dem Enddatum liegen.';
    return null;
  }

  _submit() {
    const err = this._validate();
    if (err) { this._error = err; return; }
    this._error = '';

    const g = id => this.shadowRoot.getElementById(id).value.trim();
    this.dispatchEvent(new CustomEvent('fetch-request', {
      bubbles: true, composed: true,
      detail: {
        cookies:   g('cookies'),
        session:   g('session'),
        user:      g('user'),
        stgru:     g('stgru'),
        sem:       g('sem') || '9',
        date_from: g('date-from'),
        date_to:   g('date-to'),
      },
    }));
  }

  setLoading(v) { this._loading = v; }

  render() {
    return html`
      <div class="stack">
        <h2><span class="badge">1</span> Zugangsdaten aus dem Browser holen</h2>

        <details>
          <summary>Schritt-für-Schritt Anleitung</summary>
          <ol>
            <li>
              Öffne den
              <a href="https://www3.primuss.de/stpl/index.php?FH=fhla&Language=de" target="_blank">
                Primuss Stundenplan ↗
              </a>
              und logge dich ein.
            </li>
            <li>Drücke <kbd>F12</kbd> → Reiter <strong>Network</strong> → Seite neu laden (<kbd>F5</kbd>).</li>
            <li>
              Klicke irgendeinen Request zu <code>primuss.de</code> an →
              <strong>Request Headers</strong> → Wert von <code>Cookie:</code> kopieren.
            </li>
            <li>
              <strong>Session</strong> &amp; <strong>User</strong> stehen in der URL-Leiste:<br/>
              <code>…&amp;Session=<em>XXX</em>&amp;User=<em>YYY</em></code>
            </li>
            <li>
              <strong>stgru</strong> findest du im selben Network-Tab bei einem POST-Request →
              Reiter <strong>Payload</strong> → <code>stgru=<em>165</em></code>
            </li>
          </ol>
        </details>

        <!-- Cookie string -->
        <div class="field">
          <label>Cookie-String <span class="required">*</span></label>
          <textarea id="cookies" rows="2"
            placeholder="PHPSESSID=7bfk1e8t0bn26kg…; _shibsession_646566…=_86f1c20c…"
          ></textarea>
        </div>

        <!-- Session + User -->
        <div class="row">
          <div class="field">
            <label>Session <span class="required">*</span></label>
            <input id="session" type="text" placeholder="h5ws3a4xk3ozpyzt…" />
          </div>
          <div class="field">
            <label>User <span class="required">*</span></label>
            <input id="user" type="text" placeholder="s-nhohnn" />
          </div>
        </div>

        <!-- stgru + sem -->
        <div class="row">
          <div class="field">
            <label>Studiengruppe (stgru) <span class="required">*</span></label>
            <input id="stgru" type="text" placeholder="165" />
          </div>
          <div class="field">
            <label>Semester-Nr. (URL-Param)</label>
            <input id="sem" type="number" value="9" min="1" max="20" />
          </div>
        </div>

        <div class="divider"></div>
        <span class="section-label">📆 Semesterzeitraum</span>

        <!-- Date range -->
        <div class="row">
          <div class="field">
            <label>Von <span class="required">*</span></label>
            <input id="date-from" type="date" />
          </div>
          <div class="field">
            <label>Bis <span class="required">*</span></label>
            <input id="date-to" type="date" />
          </div>
        </div>

        <!-- Quick presets -->
        <div class="presets">
          <span class="preset-label">Schnellwahl:</span>
          <button class="btn-chip" @click=${() => this._setDates('2026-03-16','2026-07-11')}>SoSe 2026</button>
          <button class="btn-chip" @click=${() => this._setDates('2025-10-01','2026-01-31')}>WiSe 25/26</button>
          <button class="btn-chip" @click=${() => this._setDates('2025-03-17','2025-07-11')}>SoSe 2025</button>
        </div>

        ${this._error ? html`<p class="error-msg">❌ ${this._error}</p>` : ''}

        <button class="btn-primary" ?disabled=${this._loading} @click=${this._submit}>
          ${this._loading ? html`<span class="spinner"></span> Lade Wochen…` : 'Stundenplan laden →'}
        </button>
      </div>
    `;
  }
}

customElements.define('step-credentials', StepCredentials);
