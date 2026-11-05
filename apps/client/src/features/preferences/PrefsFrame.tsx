import type { ReactNode } from 'react';
import './Preferences.css';

export interface PrefsFrameProps<K extends string> {
  pages: ReadonlyArray<{ id: K; label: string }>;
  current: K;
  onPage: (id: K) => void;
  children: ReactNode;
  busy: boolean;
  dirty: boolean;
  onOk: () => void;
  onCancel: () => void;
  onApply: () => void;
  problem: string | null;
}

/** The two-pane frame of "Owner Preferences For" and "Security and Privacy Permissions" (icqpref.dll 9055, 9037). */
export function PrefsFrame<K extends string>({ pages, current, onPage, children, busy, dirty, onOk, onCancel, onApply, problem }: PrefsFrameProps<K>) {
  return (
    <>
      <div className="prefs__main">
        <ul className="prefs__list" role="listbox" aria-label="Categories">
          {pages.map((p) => (
            <li key={p.id} role="option" aria-selected={p.id === current} className={p.id === current ? 'is-selected' : undefined} onClick={() => onPage(p.id)}>
              {p.label}
            </li>
          ))}
        </ul>
        <div className="prefs__page">
          <div className="prefs__heading">{pages.find((p) => p.id === current)?.label}</div>
          {children}
          {problem ? (
            <p className="dialog-error" role="alert" style={{ whiteSpace: 'pre-line' }}>
              {problem}
            </p>
          ) : null}
        </div>
      </div>
      <div className="dialog-buttons dialog-buttons--end">
        <button type="button" className="default" disabled={busy} onClick={onOk}>
          OK
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" disabled={busy || !dirty} onClick={onApply}>
          Apply
        </button>
      </div>
    </>
  );
}
