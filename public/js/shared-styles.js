import { css } from 'https://esm.sh/lit@3';

/**
 * Shared Lit CSS — uses CSS custom properties from global.css.
 */
export const shared = css`
  :host { display: block; }
  *, *::before, *::after { box-sizing: border-box; }

  /* ── Typography ──────────────────────────── */
  h2 {
    font-size: 1.05rem; font-weight: 600;
    display: flex; align-items: center; gap: 0.55rem;
  }
  .hint { font-size: 0.82rem; color: var(--muted); line-height: 1.55; }
  .mono { font-family: var(--mono); letter-spacing: 0.03em; }

  /* ── Layout ──────────────────────────────── */
  .stack   { display: flex; flex-direction: column; gap: 1rem; }
  .row     { display: flex; gap: 0.6rem; flex-wrap: wrap; }

  /* ── Inputs ──────────────────────────────── */
  input[type='search'], input[type='text'] {
    width: 100%; background: var(--bg);
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    color: var(--text); font-family: var(--font); font-size: 0.85rem;
    padding: 0.5rem 0.75rem; outline: none;
    transition: border-color 0.15s;
  }
  input:focus { border-color: var(--primary); }
  input::placeholder { color: var(--muted); opacity: 0.6; }

  /* ── Buttons ─────────────────────────────── */
  button {
    font-family: var(--font); font-weight: 600;
    border: none; border-radius: var(--radius-sm); cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
    gap: 0.35rem; transition: background 0.15s, opacity 0.15s;
  }
  .btn-primary {
    background: var(--primary); color: var(--primary-fg);
    padding: 0.55rem 1.25rem; font-size: 0.88rem;
    border-radius: var(--radius-sm);
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
  .btn-chip:hover { background: rgba(255, 132, 0, 0.22); }

  /* ── Feedback ────────────────────────────── */
  .error-msg {
    color: var(--error); font-size: 0.84rem;
    padding: 0.5rem 0.8rem; background: var(--error-bg);
    border: 1px solid var(--error-bdr); border-radius: var(--radius-sm);
  }

  /* ── Spinner ─────────────────────────────── */
  .spinner {
    display: inline-block; width: 14px; height: 14px;
    border: 2px solid rgba(255,255,255,0.25); border-top-color: #fff;
    border-radius: 50%; animation: spin 0.5s linear infinite; flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Tabs ────────────────────────────────── */
  .tabs {
    display: flex; border: 1px solid var(--border);
    border-radius: var(--radius-sm); overflow: hidden;
  }
  .tab {
    flex: 1; text-align: center;
    padding: 0.5rem 1rem; font-size: 0.82rem; font-weight: 600;
    font-family: var(--mono); letter-spacing: 0.03em;
    background: transparent; color: var(--muted);
    border: none; cursor: pointer; transition: all 0.15s;
    border-radius: 0;
  }
  .tab:hover { color: var(--text); }
  .tab.active {
    background: var(--surface-2); color: var(--text);
  }
`;
