import { css } from 'https://esm.sh/lit@3';

/**
 * Shared Lit CSS — uses CSS custom properties from global.css.
 */
export const shared = css`
  :host {
    display: block;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.25rem 1.5rem;
  }

  /* ── Typography ──────────────────────────── */
  h2 {
    font-size: 1.05rem; font-weight: 600;
    display: flex; align-items: center; gap: 0.55rem;
    margin-bottom: 0.15rem;
  }
  .badge {
    display: inline-flex; align-items: center; justify-content: center;
    width: 1.5rem; height: 1.5rem; border-radius: 50%;
    background: var(--accent); color: #fff;
    font-size: 0.72rem; font-weight: 700; flex-shrink: 0;
  }
  .hint { font-size: 0.82rem; color: var(--muted); line-height: 1.55; }
  code {
    background: var(--accent-bg); color: var(--accent-h);
    padding: 0.1em 0.35em; border-radius: 4px;
    font-family: var(--mono); font-size: 0.82em;
  }

  /* ── Layout ──────────────────────────────── */
  .stack   { display: flex; flex-direction: column; gap: 1rem; }
  .row     { display: flex; gap: 0.6rem; flex-wrap: wrap; }
  .divider { height: 1px; background: var(--border); }

  /* ── Inputs ──────────────────────────────── */
  label {
    display: block; font-size: 0.82rem; font-weight: 500;
    color: var(--muted); margin-bottom: 0.25rem;
  }
  input[type='text'], input[type='password'], input[type='search'] {
    width: 100%; background: var(--bg);
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    color: var(--text); font-family: var(--font); font-size: 0.85rem;
    padding: 0.5rem 0.75rem; outline: none;
    transition: border-color 0.15s;
  }
  input:focus { border-color: var(--accent); }
  input::placeholder { color: var(--muted); opacity: 0.6; }

  /* ── Buttons ─────────────────────────────── */
  button {
    font-family: var(--font); font-weight: 600;
    border: none; border-radius: var(--radius-sm); cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
    gap: 0.35rem; transition: background 0.15s, opacity 0.15s;
  }
  .btn-primary {
    background: var(--accent); color: #fff;
    padding: 0.55rem 1.25rem; font-size: 0.88rem;
  }
  .btn-primary:hover    { background: var(--accent-h); }
  .btn-primary:disabled { opacity: 0.35; cursor: not-allowed; }

  .btn-ghost {
    background: transparent; color: var(--muted);
    border: 1px solid var(--border);
    padding: 0.45rem 0.95rem; font-size: 0.84rem;
  }
  .btn-ghost:hover { color: var(--text); border-color: var(--border-2); }

  .btn-chip {
    background: var(--accent-bg); color: var(--accent-h);
    padding: 0.25rem 0.65rem; font-size: 0.75rem;
  }
  .btn-chip:hover { background: rgba(108, 140, 255, 0.22); }

  /* ── Feedback ────────────────────────────── */
  .error-msg {
    color: var(--error); font-size: 0.84rem;
    padding: 0.5rem 0.8rem; background: var(--error-bg);
    border: 1px solid var(--error-bdr); border-radius: var(--radius-sm);
  }
  .banner {
    padding: 0.55rem 0.85rem; border-radius: var(--radius-sm);
    font-size: 0.84rem; border: 1px solid;
  }
  .banner-ok   { background: rgba(86,211,100,0.08); border-color: rgba(86,211,100,0.3); color: var(--success); }
  .banner-info { background: var(--accent-bg); border-color: rgba(108,140,255,0.25); color: var(--text); }

  /* ── Spinner ─────────────────────────────── */
  .spinner {
    display: inline-block; width: 14px; height: 14px;
    border: 2px solid rgba(255,255,255,0.25); border-top-color: #fff;
    border-radius: 50%; animation: spin 0.5s linear infinite; flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
`;
