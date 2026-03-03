import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { base } from './shared-styles.js';

/**
 * <step-credentials>
 * Step 1 – collects Primuss session data, either via automated login or
 * by manually pasting cookies from DevTools.
 *
 * Emits: CustomEvent('fetch-request', { detail: { cookies, session, user, stgru, sem, date_from, date_to } })
 */
export class StepCredentials extends LitElement {
  static properties = {
    _tab:         { state: true },   // 'auto' | 'manual'
    _authPhase:   { state: true },   // 'idle' | 'loading' | 'mfa' | 'done'
    _authError:   { state: true },
    _fetchError:  { state: true },
    _fetchLoading:{ state: true },
    // filled by auto-login, or typed manually
    _cookies:    { state: true },
    _session:    { state: true },
    _user:       { state: true },
    // MFA state
    _mfaStateId:   { state: true },
    _mfaTokenField:{ state: true },  // actual field name from IDP (for the hint)
  };

  static styles = [base, css`
    /* ── Tab bar ────────────────────────────────────────── */
    .tabs {
      display: flex;
      gap: 0;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 3px;
    }
    .tab-btn {
      flex: 1;
      background: transparent;
      color: var(--muted);
      border: none;
      border-radius: 6px;
      padding: .5rem 1rem;
      font-size: .85rem;
      font-weight: 500;
      cursor: pointer;
      transition: background .15s, color .15s;
    }
    .tab-btn:active { transform: none; }
    .tab-btn.active {
      background: var(--surface-2);
      color: var(--text);
    }
    .tab-btn:not(.active):hover { color: var(--text); }

    /* ── Auth status banner ─────────────────────────────── */
    .auth-ok {
      display: flex;
      align-items: center;
      gap: .6rem;
      padding: .65rem .9rem;
      background: rgba(86, 211, 100, .1);
      border: 1px solid rgba(86, 211, 100, .3);
      border-radius: var(--radius-sm);
      font-size: .85rem;
      color: var(--success);
    }

    /* ── Manual accordion ───────────────────────────────── */
    details {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      font-size: .85rem;
    }
    summary {
      padding: .7rem 1rem;
      cursor: pointer;
      color: var(--accent-h);
      font-weight: 500;
      list-style: none;
      user-select: none;
    }
    summary::-webkit-details-marker { display: none; }
    summary::before { content: '▶  '; font-size: .7em; }
    details[open] summary::before { content: '▼  '; }
    ol {
      padding: .75rem 1rem .85rem 2rem;
      border-top: 1px solid var(--border);
      color: var(--muted);
      line-height: 1.8;
    }

    .presets {
      display: flex;
      align-items: center;
      gap: .5rem;
      flex-wrap: wrap;
    }
    .preset-label { font-size: .8rem; color: var(--muted); }
  `];

  constructor() {
    super();
    this._tab          = 'auto';
    this._authPhase    = 'idle';   // 'idle' | 'loading' | 'mfa' | 'done'
    this._authError    = '';
    this._fetchError   = '';
    this._fetchLoading = false;
    this._cookies      = '';
    this._session      = '';
    this._user         = '';
    this._mfaStateId    = '';
    this._mfaTokenField = '';
  }

  // ── called by app-shell ───────────────────────────────────────────────
  setLoading(v) { this._fetchLoading = v; }
  set _error(v)  { this._fetchError = v; }

  // ── Semester date presets ──────────────────────────────────────
  _setDates(from, to) {
    this._q('date-from').value = from;
    this._q('date-to').value   = to;
  }

  _q(id) { return this.shadowRoot.getElementById(id); }

  // ── Auto-login phase 1: username + password ───────────────────
  async _autoLogin() {
    this._authError = '';
    this._authPhase = 'loading';

    const username = this._q('username')?.value.trim() ?? '';
    const password = this._q('password')?.value.trim() ?? '';

    if (!username || !password) {
      this._authError = 'Benutzername und Passwort sind erforderlich.';
      this._authPhase = 'idle';
      return;
    }

    try {
      const res  = await fetch('/api/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        this._authError = data.detail ?? `Fehler ${res.status}`;
        this._authPhase = 'idle';
        return;
      }

      if (data.requires_mfa) {
        // IDP wants a TOTP — show MFA input
        this._mfaStateId    = data.state_id;
        this._mfaTokenField = data.token_field ?? '';
        this._authPhase     = 'mfa';
      } else {
        this._fillSession(data);
      }
    } catch (e) {
      this._authError = `Netzwerkfehler: ${e.message}`;
      this._authPhase = 'idle';
    }
  }

  // ── Auto-login phase 2: submit TOTP ───────────────────────────
  async _submitTotp() {
    this._authError = '';
    this._authPhase = 'loading';

    const totp = this._q('totp')?.value.trim() ?? '';
    if (!totp) {
      this._authError = 'Bitte den Code eingeben.';
      this._authPhase = 'mfa';
      return;
    }

    try {
      const res  = await fetch('/api/login/verify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ state_id: this._mfaStateId, totp }),
      });
      const data = await res.json();

      if (!res.ok) {
        this._authError = data.detail ?? `Fehler ${res.status}`;
        this._authPhase = 'mfa';   // let them try the token again
        return;
      }

      this._fillSession(data);
    } catch (e) {
      this._authError = `Netzwerkfehler: ${e.message}`;
      this._authPhase = 'mfa';
    }
  }

  _fillSession(data) {
    this._cookies   = data.cookies;
    this._session   = data.session;
    this._user      = data.user;
    this._authPhase = 'done';
    if (data.stgru) {
      const el = this._q('stgru');
      if (el) el.value = data.stgru;
    }
  }

  _resetAuth() {
    this._authPhase    = 'idle';
    this._authError    = '';
    this._mfaStateId   = '';
    this._mfaTokenField = '';
    this._cookies = '';
    this._session = '';
    this._user    = '';
  }

  // ── Submit (fetch timetable) ───────────────────────────────────
  _submit() {
    this._fetchError = '';

    // Resolve cookies/session/user from auto-filled state or manual inputs
    const cookies = this._tab === 'auto'
      ? this._cookies
      : (this._q('cookies')?.value.trim() ?? '');
    const session = this._tab === 'auto'
      ? this._session
      : (this._q('session')?.value.trim() ?? '');
    const user = this._tab === 'auto'
      ? this._user
      : (this._q('user')?.value.trim() ?? '');

    const stgru    = this._q('stgru')?.value.trim() ?? '';
    const sem      = this._q('sem')?.value.trim()   || '9';
    const dateFrom = this._q('date-from')?.value    ?? '';
    const dateTo   = this._q('date-to')?.value      ?? '';

    if (!cookies) {
      this._fetchError = this._tab === 'auto'
        ? 'Bitte zuerst einloggen (oben).'
        : 'Cookie-String fehlt.';
      return;
    }
    if (!session) { this._fetchError = 'Session fehlt.'; return; }
    if (!user)    { this._fetchError = 'User fehlt.'; return; }
    if (!stgru)   { this._fetchError = 'Studiengruppe (stgru) fehlt.'; return; }
    if (!dateFrom){ this._fetchError = 'Startdatum fehlt.'; return; }
    if (!dateTo)  { this._fetchError = 'Enddatum fehlt.'; return; }
    if (dateFrom > dateTo) { this._fetchError = 'Startdatum muss vor dem Enddatum liegen.'; return; }

    this.dispatchEvent(new CustomEvent('fetch-request', {
      bubbles: true, composed: true,
      detail: { cookies, session, user, stgru, sem, date_from: dateFrom, date_to: dateTo },
    }));
  }

  // ── Render helpers ─────────────────────────────────────────────
  _renderAutoTab() {
    switch (this._authPhase) {

      case 'done': return html`
        <div class="stack">
          <div class="auth-ok">
            ✅ Eingeloggt als <strong>${this._user}</strong>
          </div>
          <button class="btn-ghost" style="align-self:flex-start"
                  @click=${this._resetAuth}>
            Anderes Konto verwenden
          </button>
        </div>`;

      case 'mfa': return html`
        <div class="stack">
          <p class="hint">
            ✅ Benutzername und Passwort korrekt.<br/>
            Die Hochschule verlangt einen zweiten Faktor.
          </p>
          <div class="field">
            <label>
              Authenticator-Code
              ${this._mfaTokenField ? html`
                <span style="font-weight:400">(Feld: <code>${this._mfaTokenField}</code>)</span>
              ` : ''}
              <span class="required">*</span>
            </label>
            <input id="totp" type="text" inputmode="numeric"
                   pattern="[0-9]*" maxlength="8"
                   placeholder="123456"
                   autocomplete="one-time-code"
                   style="font-size:1.4rem;letter-spacing:.2em;text-align:center"
                   @keydown=${e => e.key === 'Enter' && this._submitTotp()} />
          </div>
          <p class="hint" style="color:var(--error)">
            ⏱ Codes sind nur ~30 Sekunden gültig — Code aus der App kopieren und sofort absenden.
          </p>
          ${this._authError ? html`<p class="error-msg">❌ ${this._authError}</p>` : ''}
          <div style="display:flex;gap:.75rem;flex-wrap:wrap">
            <button class="btn-primary" @click=${this._submitTotp}>
              ${this._authPhase === 'loading'
                ? html`<span class="spinner"></span> Prüfen…`
                : 'Code bestätigen →'}
            </button>
            <button class="btn-ghost" @click=${this._resetAuth}>Abbrechen</button>
          </div>
        </div>`;

      case 'loading': return html`
        <div class="stack" style="align-items:center;padding:1rem 0">
          <span class="spinner" style="width:28px;height:28px;border-width:3px"></span>
          <p class="hint">Verbinde mit Hochschule…</p>
        </div>`;

      default: return html`  <!-- idle -->
        <div class="stack">
          <p class="hint">
            Melde dich mit deinen HS-Landshut-Zugangsdaten an.
            Passwort und Token werden <strong>nicht gespeichert</strong> —
            nur für diesen Login-Request verwendet.
          </p>
          <div class="row">
            <div class="field">
              <label>Benutzername <span class="required">*</span></label>
              <input id="username" type="text" placeholder="s-nhohnn"
                     autocomplete="username" />
            </div>
            <div class="field">
              <label>Passwort <span class="required">*</span></label>
              <input id="password" type="password" placeholder="••••••••"
                     autocomplete="current-password"
                     @keydown=${e => e.key === 'Enter' && this._autoLogin()} />
            </div>
          </div>
          ${this._authError ? html`<p class="error-msg">❌ ${this._authError}</p>` : ''}
          <button class="btn-primary" @click=${this._autoLogin}>
            🔑 Einloggen
          </button>
        </div>`;
    }
  }

  _renderManualTab() {
    return html`
      <div class="stack">
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
              Klicke irgendeinen Request an →
              <strong>Request Headers</strong> → Wert von <code>Cookie:</code> kopieren.
            </li>
            <li>
              <strong>Session</strong> &amp; <strong>User</strong> stehen in der URL:<br/>
              <code>…&amp;Session=<em>XXX</em>&amp;User=<em>YYY</em></code>
            </li>
          </ol>
        </details>

        <div class="field">
          <label>Cookie-String <span class="required">*</span></label>
          <textarea id="cookies" rows="2"
            .value=${this._cookies}
            @input=${e => this._cookies = e.target.value}
            placeholder="PHPSESSID=7bfk…; _shibsession_646…=_86f1c…"></textarea>
        </div>

        <div class="row">
          <div class="field">
            <label>Session <span class="required">*</span></label>
            <input id="session" type="text"
                   .value=${this._session}
                   @input=${e => this._session = e.target.value}
                   placeholder="h5ws3a4xk3oz…" />
          </div>
          <div class="field">
            <label>User <span class="required">*</span></label>
            <input id="user" type="text"
                   .value=${this._user}
                   @input=${e => this._user = e.target.value}
                   placeholder="s-nhohnn" />
          </div>
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <div class="stack">
        <h2><span class="badge">1</span> Anmelden</h2>

        <!-- Tab switcher -->
        <div class="tabs" role="tablist">
          <button class="tab-btn ${this._tab === 'auto'   ? 'active' : ''}"
                  @click=${() => this._tab = 'auto'}>
            ✨ Automatisch
          </button>
          <button class="tab-btn ${this._tab === 'manual' ? 'active' : ''}"
                  @click=${() => this._tab = 'manual'}>
            🔑 Manuell (Cookies)
          </button>
        </div>

        <!-- Tab content -->
        ${this._tab === 'auto' ? this._renderAutoTab() : this._renderManualTab()}

        <div class="divider"></div>
        <span class="section-label">📆 Kurs &amp; Semesterzeitraum</span>

        <!-- stgru + sem (always visible) -->
        <div class="row">
          <div class="field">
            <label>Studiengruppe (stgru) <span class="required">*</span></label>
            <input id="stgru" type="text" placeholder="165" />
          </div>
          <div class="field">
            <label>Semester-Nr.</label>
            <input id="sem" type="number" value="9" min="1" max="20" />
          </div>
        </div>

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

        ${this._fetchError ? html`<p class="error-msg">❌ ${this._fetchError}</p>` : ''}

        <button class="btn-primary" ?disabled=${this._fetchLoading} @click=${this._submit}>
          ${this._fetchLoading
            ? html`<span class="spinner"></span> Lade Wochen…`
            : 'Stundenplan laden →'}
        </button>
      </div>
    `;
  }
}

customElements.define('step-credentials', StepCredentials);
