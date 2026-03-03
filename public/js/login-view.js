import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { shared } from './shared-styles.js';

/**
 * <login-view>
 * Handles login + course group selection.
 * Phases: idle → loading → mfa? → groups → done
 *
 * Emits: CustomEvent('load-timetable', { detail: { cookies, session, user, stgru } })
 */
export class LoginView extends LitElement {
  static properties = {
    _phase:     { state: true },   // idle | loading | mfa | groups
    _error:     { state: true },
    // .env status
    _hasCreds:  { state: true },
    _hasTotp:   { state: true },
    _username:  { state: true },
    // session (filled after login)
    _cookies:   { state: true },
    _session:   { state: true },
    _user:      { state: true },
    // group picker
    _groups:    { state: true },
    _groupFilter: { state: true },
    // MFA
    _mfaId:     { state: true },
    _mfaField:  { state: true },
  };

  static styles = [shared, css`
    .group-grid {
      display: flex; flex-wrap: wrap; gap: 0.4rem;
      max-height: 320px; overflow-y: auto; padding: 0.15rem 0;
    }
    .group-btn {
      font-size: 0.84rem; padding: 0.4rem 0.9rem;
      transition: background 0.12s, border-color 0.12s;
    }
    .group-btn:hover {
      background: var(--accent); color: #fff;
    }
    .center {
      display: flex; flex-direction: column; align-items: center;
      gap: 0.75rem; padding: 1.5rem 0;
    }
    .big-spinner {
      width: 28px; height: 28px; border-width: 3px;
      border-color: rgba(108,140,255,0.2); border-top-color: var(--accent);
    }
  `];

  constructor() {
    super();
    this._phase = 'idle';
    this._error = '';
    this._hasCreds = false;
    this._hasTotp  = false;
    this._username = '';
    this._cookies  = '';
    this._session  = '';
    this._user     = '';
    this._groups   = [];
    this._groupFilter = '';
    this._mfaId    = '';
    this._mfaField = '';
  }

  connectedCallback() {
    super.connectedCallback();
    this._fetchStatus();
  }

  async _fetchStatus() {
    try {
      const data = await (await fetch('/api/status')).json();
      this._hasCreds = data.credentials ?? false;
      this._hasTotp  = data.totp ?? false;
      this._username = data.username ?? '';
      // Auto-login if fully configured? — No, let the user click.
    } catch { /* server not ready */ }
  }

  // ── Login ─────────────────────────────────────────────
  async _login() {
    this._error = '';
    this._phase = 'loading';

    const username = this._hasCreds ? '' : this._q('username')?.value.trim();
    const password = this._hasCreds ? '' : this._q('password')?.value.trim();

    if (!this._hasCreds && (!username || !password)) {
      this._error = 'Benutzername und Passwort eingeben.';
      this._phase = 'idle';
      return;
    }

    try {
      const res  = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        this._error = data.detail ?? `Fehler ${res.status}`;
        this._phase = 'idle';
        return;
      }

      if (data.requires_mfa) {
        this._mfaId    = data.state_id;
        this._mfaField = data.token_field ?? '';
        this._phase    = 'mfa';
        return;
      }

      this._onLoginSuccess(data);
    } catch (e) {
      this._error = `Netzwerkfehler: ${e.message}`;
      this._phase = 'idle';
    }
  }

  // ── MFA ───────────────────────────────────────────────
  async _submitMfa() {
    const code = this._q('totp')?.value.trim();
    if (!code) { this._error = 'Bitte Code eingeben.'; return; }

    this._error = '';
    this._phase = 'loading';

    try {
      const res  = await fetch('/api/login/mfa', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state_id: this._mfaId, totp: code }),
      });
      const data = await res.json();

      if (!res.ok) {
        this._error = data.detail ?? `Fehler ${res.status}`;
        this._phase = 'mfa';
        return;
      }

      this._onLoginSuccess(data);
    } catch (e) {
      this._error = `Netzwerkfehler: ${e.message}`;
      this._phase = 'mfa';
    }
  }

  _onLoginSuccess(data) {
    this._cookies = data.cookies;
    this._session = data.session;
    this._user    = data.user;
    this._groups  = data.course_groups ?? [];
    this._phase   = 'groups';
  }

  // ── Group selection ───────────────────────────────────
  _pickGroup(group) {
    this.dispatchEvent(new CustomEvent('load-timetable', {
      bubbles: true, composed: true,
      detail: {
        cookies: this._cookies,
        session: this._session,
        user:    this._user,
        stgru:   group.stgru,
        label:   group.label,
      },
    }));
  }

  _restart() {
    this._phase = 'idle';
    this._error = '';
    this._cookies = '';
    this._session = '';
    this._user    = '';
    this._groups  = [];
    this._groupFilter = '';
  }

  _q(id) { return this.shadowRoot?.getElementById(id); }

  // ── Render ────────────────────────────────────────────
  render() {
    return html`<div class="stack">
      <h2><span class="badge">1</span> Anmelden & Studiengruppe wählen</h2>
      ${this._renderPhase()}
    </div>`;
  }

  _renderPhase() {
    switch (this._phase) {

      case 'loading':
        return html`<div class="center">
          <span class="spinner big-spinner"></span>
          <p class="hint">Verbinde mit Hochschule…</p>
        </div>`;

      case 'mfa':
        return html`<div class="stack">
          <div class="banner banner-ok">✅ Passwort korrekt — Zweiter Faktor nötig</div>
          <div style="max-width:240px">
            <label>Authenticator-Code</label>
            <input id="totp" type="text" inputmode="numeric"
                   pattern="[0-9]*" maxlength="8" placeholder="123456"
                   autocomplete="one-time-code"
                   style="font-size:1.3rem;letter-spacing:.2em;text-align:center"
                   @keydown=${e => e.key === 'Enter' && this._submitMfa()} />
          </div>
          ${this._error ? html`<p class="error-msg">❌ ${this._error}</p>` : ''}
          <div class="row">
            <button class="btn-primary" @click=${this._submitMfa}>Code bestätigen →</button>
            <button class="btn-ghost" @click=${this._restart}>Abbrechen</button>
          </div>
        </div>`;

      case 'groups': {
        const q = this._groupFilter.toLowerCase();
        const filtered = q
          ? this._groups.filter(g => g.label.toLowerCase().includes(q))
          : this._groups;
        return html`<div class="stack">
          <div class="banner banner-ok">✅ Eingeloggt als <strong>${this._user}</strong></div>
          <label>Studiengruppe wählen</label>
          <input type="search" placeholder="🔍 z.B. IF4, WIF6, KI2…"
                 .value=${this._groupFilter}
                 @input=${e => this._groupFilter = e.target.value} />
          <div class="group-grid">
            ${filtered.length
              ? filtered.map(g => html`
                  <button class="btn-chip group-btn" @click=${() => this._pickGroup(g)}>
                    ${g.label}
                  </button>`)
              : html`<p class="hint">Keine Treffer für „${this._groupFilter}"</p>`}
          </div>
          <button class="btn-ghost" style="align-self:flex-start" @click=${this._restart}>
            ← Anderes Konto
          </button>
        </div>`;
      }

      default: // idle
        return this._hasCreds
          ? html`<div class="stack">
              <div class="banner banner-info">
                ${this._hasTotp
                  ? html`🤖 Vollautomatisch — <strong>${this._username}</strong> (Passwort + TOTP aus <code>.env</code>)`
                  : html`🔐 <strong>${this._username}</strong> — Passwort aus <code>.env</code>`}
              </div>
              ${this._error ? html`<p class="error-msg">❌ ${this._error}</p>` : ''}
              <button class="btn-primary" @click=${this._login}>🚀 Einloggen</button>
            </div>`
          : html`<div class="stack">
              <p class="hint">Melde dich mit deinen HS-Landshut-Zugangsdaten an.</p>
              <div class="row">
                <div style="flex:1;min-width:140px">
                  <label>Benutzername</label>
                  <input id="username" type="text" placeholder="s-nhohnn" />
                </div>
                <div style="flex:1;min-width:140px">
                  <label>Passwort</label>
                  <input id="password" type="password" placeholder="••••••••"
                         @keydown=${e => e.key === 'Enter' && this._login()} />
                </div>
              </div>
              ${this._error ? html`<p class="error-msg">❌ ${this._error}</p>` : ''}
              <button class="btn-primary" @click=${this._login}>🔑 Einloggen</button>
            </div>`;
    }
  }
}

customElements.define('login-view', LoginView);
