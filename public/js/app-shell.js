import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import './login-view.js';
import './timetable-view.js';

/**
 * <app-shell>
 * Owns routing between 2 views and all API calls.
 *
 *   Step 'login'     → <login-view>      (auth + group picker)
 *   Step 'timetable' → <timetable-view>  (event list + download)
 */
export class AppShell extends LitElement {
  static properties = {
    _step:       { state: true },    // 'login' | 'timetable'
    _events:     { state: true },
    _weeks:      { state: true },
    _semester:   { state: true },
    _groupLabel: { state: true },
    _session:    { state: true },    // kept for potential re-fetch
  };

  createRenderRoot() { return this; }   // no shadow DOM — global.css applies

  constructor() {
    super();
    this._step       = 'login';
    this._events     = [];
    this._weeks      = 0;
    this._semester   = '';
    this._groupLabel = '';
    this._session    = {};
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('load-timetable', e => this._onLoadTimetable(e));
    this.addEventListener('download-ics',   e => this._onDownloadIcs(e));
    this.addEventListener('restart',        () => { this._step = 'login'; });
  }

  // ── Load timetable after login + group selection ──────
  async _onLoadTimetable(e) {
    const { cookies, session, user, stgru, label } = e.detail;
    this._groupLabel = label;
    this._session    = { cookies, session, user, stgru };

    // Show timetable view immediately with loading state
    this._events = [];
    this._step = 'timetable';
    await this.updateComplete;
    const tv = this.querySelector('timetable-view');
    tv?.setLoading(true);

    try {
      const res = await fetch('/api/timetable', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies, session, user, stgru }),
      });
      const data = await res.json();

      if (!res.ok) {
        tv?.setError(data.detail ?? `Fehler ${res.status}`);
        return;
      }

      this._events   = data.events   ?? [];
      this._weeks    = data.weeks    ?? 0;
      this._semester = data.semester ?? '';

      await this.updateComplete;
      this.querySelector('timetable-view')?.initSelection();
    } catch (err) {
      tv?.setError(`Netzwerkfehler: ${err.message}`);
    } finally {
      this.querySelector('timetable-view')?.setLoading(false);
    }
  }

  // ── Generate and download ICS ─────────────────────────
  async _onDownloadIcs(e) {
    const tv = this.querySelector('timetable-view');
    tv?.setLoading(true);
    tv?.setError('');

    const payload = e.detail.events.map(ev => ({
      summary:     ev.summary,
      dtstart:     ev.dtstart,
      dtend:       ev.dtend || ev.dtstart,
      location:    ev.location    || '',
      description: ev.description || '',
    }));

    try {
      const res = await fetch('/api/ics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: payload }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        tv?.setError(err.detail ?? `Fehler ${res.status}`);
        return;
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = 'stundenplan.ics';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      tv?.setDone();
    } catch (err) {
      tv?.setError(`Netzwerkfehler: ${err.message}`);
    }
  }

  render() {
    switch (this._step) {
      case 'login':
        return html`<login-view></login-view>`;
      case 'timetable':
        return html`
          <timetable-view
            .events=${this._events}
            .weeks=${this._weeks}
            .semester=${this._semester}
            .groupLabel=${this._groupLabel}
          ></timetable-view>`;
    }
  }
}

customElements.define('app-shell', AppShell);
