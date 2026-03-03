import { LitElement, html } from 'https://esm.sh/lit@3';
import './login-view.js';
import './timetable-view.js';

/**
 * <app-shell>
 * Routes between login and timetable builder.
 * Checks for cached session on load to skip login.
 */
export class AppShell extends LitElement {
  static properties = {
    _step:         { state: true },   // 'login' | 'timetable'
    _session:      { state: true },   // { cookies, session, user }
    _courseGroups: { state: true },   // [{ label, stg, stgru }]
    _checking:     { state: true },   // true while checking cached session
  };

  createRenderRoot() { return this; }

  constructor() {
    super();
    this._step = 'login';
    this._session = null;
    this._courseGroups = [];
    this._checking = true;
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('login-success', e => this._onLoginSuccess(e.detail));
    this.addEventListener('session-expired', () => this._onSessionExpired());
    this.addEventListener('restart', () => { this._step = 'login'; });
    this._checkCachedSession();
  }

  async _checkCachedSession() {
    try {
      const res = await fetch('/api/session');
      const data = await res.json();
      if (data.cookies) {
        this._session = { cookies: data.cookies, session: data.session, user: data.user };
        this._courseGroups = data.course_groups || [];
        this._step = 'timetable';
      }
    } catch { /* no cached session */ }
    this._checking = false;
  }

  _onLoginSuccess(detail) {
    this._session = { cookies: detail.cookies, session: detail.session, user: detail.user };
    this._courseGroups = detail.courseGroups || [];
    this._step = 'timetable';
  }

  _onSessionExpired() {
    this._session = null;
    this._courseGroups = [];
    this._step = 'login';
  }

  render() {
    if (this._checking) return html``;

    if (this._step === 'timetable' && this._session) {
      return html`<timetable-view
        .session=${this._session}
        .courseGroups=${this._courseGroups}
      ></timetable-view>`;
    }
    return html`<login-view></login-view>`;
  }
}

customElements.define('app-shell', AppShell);
