import { css } from 'https://esm.sh/lit@3';

/**
 * Shared Lit CSS — imported via `static styles = [shared, css`…`]`.
 * Uses CSS custom properties from global.css (inherited through shadow DOM).
 */
export const shared = css`
  :host {
    display: block;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.75rem 2rem;
  }

  /* ── Typography ─────────────────────────────────────── */
  h2 {
    font-size: 1.1rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 0.25rem;
  }
  .badge {
    display: inline-flex; align-items: center; justify-content: center;
    width: 1.65rem; height: 1.65rem; border-radius: 50%;
    background: var(--accent); color: #fff;
    font-size: 0.78rem; font-weight: 700; flex-shrink: 0;
  }
  .hint { font-size: 0.8rem; color: var(--muted); line-height: 1.6; }
  code  {
    background: var(--accent-bg); color: var(--accent-h);
    padding: 0.1em 0.4em; border-radius: 4px;
    font-family: var(--mono); font-size: 0.82em;
  }

  /* ── Layout ─────────────────────────────────────────── */
  .stack   { display: flex; flex-direction: column; gap: 1rem; }
  .row     { display: flex; gap: 0.75rem; flex-wrap: wrap; }
  .divider { height: 1px; background: var(--border); }

  /* ── Inputs ─────────────────────────────────────────── */
  label {
    display: block; font-size: 0.82rem; font-weight: 500;
    color: var(--muted); margin-bottom: 0.3rem;
  }
  input[type='text'], input[type='password'], input[type='search'] {
    width: 100%; background: var(--bg);
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    color: var(--text); font-family: var(--font); font-size: 0.84rem;
    padding: 0.6rem 0.85rem; outline: none;
    transition: border-color 0.18s;
  }
  input:focus { border-color: var(--accent); }

  /* ── Buttons ────────────────────────────────────────── */
  button {
    font-family: var(--font); font-weight: 600;
    border: none; border-radius: var(--radius-sm); cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
    gap: 0.4rem; transition: background 0.18s, opacity 0.18s, transform 0.1s;
  }
  button:active { transform: scale(0.97); }

  .btn-primary {
    background: var(--accent); color: #fff;
    padding: 0.65rem 1.5rem; font-size: 0.9rem;
  }
  .btn-primary:hover    { background: var(--accent-h); }
  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

  .btn-ghost {
    background: transparent; color: var(--muted);
    border: 1px solid var(--border);
    padding: 0.55rem 1.1rem; font-size: 0.85rem;
  }
  .btn-ghost:hover { color: var(--text); border-color: var(--border-2); }

  .btn-chip {
    background: var(--accent-bg); color: var(--accent-h);
    padding: 0.35rem 0.85rem; font-size: 0.78rem;
  }
  .btn-chip:hover { background: rgba(108, 140, 255, 0.25); }

  /* ── Feedback ───────────────────────────────────────── */
  .error-msg {
    color: var(--error); font-size: 0.85rem;
    padding: 0.6rem 0.9rem; background: var(--error-bg);
    border: 1px solid var(--error-bdr); border-radius: var(--radius-sm);
  }
  .banner {
    padding: 0.65rem 1rem; border-radius: var(--radius-sm);
    font-size: 0.85rem; border: 1px solid;
  }
  .banner-ok  { background: rgba(86,211,100,0.08); border-color: rgba(86,211,100,0.3); color: var(--success); }
  .banner-info { background: var(--accent-bg); border-color: rgba(108,140,255,0.25); color: var(--text); }

  /* ── Spinner ────────────────────────────────────────── */
  .spinner {
    display: inline-block; width: 15px; height: 15px;
    border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff;
    border-radius: 50%; animation: spin 0.55s linear infinite; flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
`;
