import { LitElement, html, css } from 'https://esm.sh/lit@3';
import { shared } from './shared-styles.js';

/**
 * <login-view>
 * Handles Shibboleth login (auto from .env or manual entry).
 * Emits: 'login-success' { detail: { cookies, session, user, courseTree } }
 */
export class LoginView extends LitElement {
  static properties = {
    _phase:    { state: true },   // idle | loading | mfa
    _error:    { state: true },
    _hasCreds: { state: true },
    _hasTotp:  { state: true },
    _username: { state: true },
    _mfaId:    { state: true },
  };

  static styles = [shared, css`
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
    this._hasTotp = false;
    this._username = '';
    this._mfaId = '';
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
    } catch {}
  }

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
        this._mfaId = data.state_id;
        this._phase = 'mfa';
        return;
      }

      this._emitSuccess(data);
    } catch (e) {
      this._error = `Netzwerkfehler: ${e.message}`;
      this._phase = 'idle';
    }
  }

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

      this._emitSuccess(data);
    } catch (e) {
      this._error = `Netzwerkfehler: ${e.message}`;
      this._phase = 'mfa';
    }
  }

  _emitSuccess(data) {
    this.dispatchEvent(new CustomEvent('login-success', {
      bubbles: true, composed: true,
      detail: {
        cookies:      data.cookies,
        session:      data.session,
        user:         data.user,
        courseTree:    data.course_tree ?? [],
      },
    }));
  }

  _q(id) { return this.shadowRoot?.getElementById(id); }

  render() {
    return html`<div class="stack">
      <h2><span class="badge">1</span> Anmelden</h2>
      ${this._renderPhase()}
    </div>`;
  }

  _renderPhase() {
    if (this._phase === 'loading') {
      return html`<div class="center">
        <span class="spinner big-spinner"></span>
        <p class="hint">Verbinde mit Hochschule…</p>
      </div>`;
    }

    if (this._phase === 'mfa') {
      return html`<div class="stack">
        <div class="banner banner-ok">✅ Passwort korrekt — Zweiter Faktor nötig</div>
        <div style="max-width:240px">
          <label>Authenticator-Code</label>
          <input id="totp" type="text" inputmode="numeric"
                 pattern="[0-9]*" maxlength="8" placeholder="123456"
                 style="font-size:1.3rem;letter-spacing:.2em;text-align:center"
                 @keydown=${e => e.key === 'Enter' && this._submitMfa()} />
        </div>
        ${this._error ? html`<p class="error-msg">❌ ${this._error}</p>` : ''}
        <div class="row">
          <button class="btn-primary" @click=${this._submitMfa}>Code bestätigen →</button>
          <button class="btn-ghost" @click=${() => { this._phase = 'idle'; this._error = ''; }}>Abbrechen</button>
        </div>
      </div>`;
    }

    // idle
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

customElements.define('login-view', LoginView);
