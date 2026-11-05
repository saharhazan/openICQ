import { useEffect, useId, type ReactNode } from 'react';
import { useApp } from '../app/AppContext';
import './ui.css';

export interface SwitchRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
}

/** A settings row with the switch on the right (controls/SwitcherCheckbox). */
export function SwitchRow({ label, checked, onChange, disabled, hint }: SwitchRowProps) {
  const id = useId();
  return (
    <div className="switch-row">
      <label htmlFor={id} className="switch-label">
        <span>{label}</span>
        {hint && <span className="switch-hint">{hint}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className={`switch${checked ? ' switch-on' : ''}`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-knob" />
      </button>
    </div>
  );
}

export interface RadioListProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

/** Radio buttons in rows, as in Privacy and Shortcuts. */
export function RadioList<T extends string>({ label, value, options, onChange }: RadioListProps<T>) {
  const name = useId();
  return (
    <fieldset className="radio-list">
      <legend className="section-caption">{label}</legend>
      {options.map((option) => (
        <label key={option.value} className="radio-row">
          <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
          <span className="radio-mark" aria-hidden="true" />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

export interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'password' | 'email';
  error?: string | null;
  hint?: ReactNode;
  maxLength?: number;
  autoFocus?: boolean;
  autoComplete?: string;
  name?: string;
  multiline?: boolean;
  /** Shows "12/120" under the field. */
  counter?: boolean;
}

/** A line field with the label above, primary line on focus, error line in red. */
export function TextField({ label, value, onChange, type = 'text', error, hint, maxLength, autoFocus, autoComplete, name, multiline, counter }: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const described = error || hint ? hintId : undefined;
  return (
    <div className={`text-field${error ? ' text-field-error' : ''}`}>
      <label htmlFor={id} className="text-field-label">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          maxLength={maxLength}
          rows={3}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          autoFocus={autoFocus}
          name={name}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          name={name}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {(error || hint || counter) && (
        <div className="text-field-foot">
          <span id={hintId} className={error ? 'text-field-message error-text' : 'text-field-message'} role={error ? 'alert' : undefined}>
            {error ?? hint}
          </span>
          {counter && maxLength !== undefined && (
            <span className="text-field-counter">
              {value.length}/{maxLength}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const TOAST_VISIBLE_MS = 4_000;

/** Toasts (previewer/toast.cpp): bottom centre, 4 s, then gone. Errors are announced as alerts. */
export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((toast) => setTimeout(() => dismiss(toast.id), TOAST_VISIBLE_MS));
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, [toasts, dismiss]);
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'} onClick={() => dismiss(toast.id)}>
          {toast.text}
        </div>
      ))}
    </div>
  );
}
