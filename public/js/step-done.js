import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { base } from './shared-styles.js';

/**
 * <step-done>
 * Step 3 – success screen after ICS download.
 * Emits: CustomEvent('restart') when user wants to go again.
 */
export class StepDone extends LitElement {
  static styles = [base, css`
    .icon { font-size: 3rem; line-height: 1; }

    .badge {
      background: var(--success);
    }

    p { color: var(--muted); font-size: 0.92rem; }
    p strong { color: var(--text); }

    .import-links {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      margin-top: 0.25rem;
    }

    /* reuse btn-primary style on <a> tags */
    a.btn-primary {
      background: var(--accent);
      color: #fff;
      padding: 0.65rem 1.4rem;
      font-size: 0.9rem;
      border-radius: var(--radius-sm);
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      text-decoration: none;
      transition: background 0.18s;
    }
    a.btn-primary:hover { background: var(--accent-h); text-decoration: none; }
  `];

  _restart() {
    this.dispatchEvent(new CustomEvent('restart', { bubbles: true, composed: true }));
  }

  render() {
    return html`
      <div class="stack">
        <h2><span class="badge">✓</span> Fertig!</h2>

        <p>
          <strong>stundenplan.ics</strong> wurde heruntergeladen.
          Importiere die Datei in deinen Kalender:
        </p>

        <div class="import-links">
          <a class="btn-primary"
             href="https://calendar.google.com/calendar/r/settings/import"
             target="_blank">
            Google Calendar ↗
          </a>
          <button class="btn-ghost" @click=${this._restart}>
            Nochmal exportieren
          </button>
        </div>

        <p class="hint">
          Tipp: Importiere die Datei erneut, wenn sich dein Stundenplan ändert –
          doppelte Einträge werden durch die stabilen UIDs verhindert.
        </p>
      </div>
    `;
  }
}

customElements.define('step-done', StepDone);
