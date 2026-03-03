import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import './step-credentials.js';
import './step-events.js';
import './step-done.js';

/**
 * <app-shell>
 * Owns routing between the 3 steps and all API calls.
 * Steps are self-contained components; this is the thin wiring layer.
 */
export class AppShell extends LitElement {
  static properties = {
    _step:     { state: true },  // 1 | 2 | 3
    _events:   { state: true },  // normalised events from backend
    _weeks:    { state: true },
    _raw:      { state: true },  // first-week raw response (debug)
    _rawItems: { state: true },  // first 3 raw items before normalisation (debug)
  };

  /* No shadow DOM so global.css layout rules (gap etc.) apply to :host */
  createRenderRoot() { return this; }

  constructor() {
    super();
    this._step     = 1;
    this._events   = [];
    this._weeks    = 0;
    this._raw      = null;
    this._rawItems = null;
  }

  /* ── Event routing ───────────────────────────────────────── */
  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('fetch-request', e => this._onFetchRequest(e));
    this.addEventListener('generate-ics',  e => this._onGenerateIcs(e));
    this.addEventListener('back',          () => this._step = 1);
    this.addEventListener('restart',       () => this._step = 1);
  }

  /* ── Step 1 → fetch all weeks ────────────────────────────── */
  async _onFetchRequest(e) {
    const creds = e.detail;
    const credEl = this.querySelector('step-credentials');
    credEl.setLoading(true);

    try {
      const res  = await fetch('/api/fetch-all', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(creds),
      });
      const data = await res.json();

      if (res.status === 401) {
        credEl.setLoading(false);
        credEl._error = data.detail ?? 'Session abgelaufen. Cookies neu kopieren.';
        return;
      }
      if (!res.ok) {
        credEl.setLoading(false);
        credEl._error = data.detail ?? `Serverfehler ${res.status}`;
        return;
      }

      this._events    = data.events       ?? [];
      this._weeks     = data.weeks        ?? 0;
      this._raw       = data._first_raw   ?? null;
      this._rawItems  = data._first_items ?? null;

      credEl.setLoading(false);
      this._step = 2;

      /* Let the step-events element initialise its selection set
         after Lit has rendered it */
      await this.updateComplete;
      this.querySelector('step-events')?.initSelection();

    } catch (err) {
      credEl.setLoading(false);
      credEl._error = `Netzwerkfehler: ${err.message}`;
    }
  }

  /* ── Step 2 → generate ICS ───────────────────────────────── */
  async _onGenerateIcs(e) {
    const eventsEl = this.querySelector('step-events');
    eventsEl.setLoading(true);
    eventsEl.setError('');

    const payload = e.detail.events.map(ev => ({
      summary:     ev.summary,
      dtstart:     ev.dtstart,
      dtend:       ev.dtend || ev.dtstart,
      location:    ev.location    || '',
      description: ev.description || '',
    }));

    try {
      const res = await fetch('/api/generate-ics', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ events: payload }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        eventsEl.setError(err.detail ?? `Fehler ${res.status}`);
        return;
      }

      /* Trigger browser download */
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'stundenplan.ics';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      this._step = 3;

    } catch (err) {
      eventsEl.setError(`Netzwerkfehler: ${err.message}`);
    } finally {
      eventsEl.setLoading(false);
    }
  }

  /* ── Render ──────────────────────────────────────────────── */
  render() {
    return html`
      ${this._step === 1 ? html`
        <step-credentials></step-credentials>
      ` : ''}

      ${this._step === 2 ? html`
        <step-events
          .events=${this._events}
          .weeks=${this._weeks}
          .rawFirst=${this._raw}
          .rawItems=${this._rawItems}
        ></step-events>
      ` : ''}

      ${this._step === 3 ? html`
        <step-done></step-done>
      ` : ''}
    `;
  }
}

customElements.define('app-shell', AppShell);
