import { useEffect, useId, useRef, useState } from 'react';
import { useWindowSurface } from '../platform/WindowSurface';
import './ComboBox.css';

export interface ComboBoxProps {
  id?: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  inputMode?: 'numeric' | 'text';
  maxLength?: number;
  autoFocus?: boolean;
  disabled?: boolean;
}

/** An editable Win32 drop-down combo box: free text plus a list of earlier entries. */
export function ComboBox({ id, value, options, onChange, ariaLabel, inputMode = 'text', maxLength, autoFocus, disabled }: ComboBoxProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const { view } = useWindowSurface();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && event.target instanceof view.Node && !rootRef.current.contains(event.target)) setOpen(false);
    };
    view.addEventListener('pointerdown', onPointerDown, true);
    return () => view.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, view]);

  return (
    <div className="combo" ref={rootRef}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        inputMode={inputMode}
        maxLength={maxLength}
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && e.altKey) setOpen(true);
          if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      <button
        type="button"
        className="combo__button"
        aria-label="Show list"
        tabIndex={-1}
        disabled={disabled || options.length === 0}
        onClick={() => setOpen(!open)}
      />
      {open ? (
        <ul className="combo__list" id={listId} role="listbox">
          {options.map((option) => (
            <li
              key={option}
              role="option"
              aria-selected={option === value}
              className={option === value ? 'is-selected' : undefined}
              onPointerDown={(e) => {
                e.preventDefault();
                onChange(option);
                setOpen(false);
              }}
            >
              {option}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
