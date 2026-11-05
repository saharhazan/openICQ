import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './ui.css';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}

export type MenuEntry = MenuItem | 'separator';

export interface MenuProps {
  entries: readonly MenuEntry[];
  /** Viewport point where the menu opens (it stays inside the window). */
  x: number;
  y: number;
  label: string;
  onClose: () => void;
}

/**
 * The context menu of the original (controls/ContextMenu.cpp): rows of 36 px,
 * 15 px text, no radius, a 1 px border. Arrow keys move, Enter picks, Escape closes.
 */
export function Menu({ entries, x, y, label, onClose }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.max(4, Math.min(x, window.innerWidth - rect.width - 4));
    const top = Math.max(4, y + rect.height > window.innerHeight ? y - rect.height : y);
    setPosition({ left, top });
    el.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
  }, [x, y]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) return;
      closeRef.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    const onResize = () => closeRef.current();
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    window.addEventListener('blur', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('blur', onResize);
    };
  }, []);

  const move = (delta: number) => {
    const nodes = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])];
    if (nodes.length === 0) return;
    const index = nodes.findIndex((n) => n === document.activeElement);
    const next = nodes[(index + delta + nodes.length) % nodes.length];
    next?.focus();
  };

  const pick = (item: MenuItem) => {
    if (item.disabled) return;
    onClose();
    item.onSelect();
  };

  return createPortal(
    <div
      ref={ref}
      className="menu"
      role="menu"
      aria-label={label}
      style={{ left: position.left, top: position.top }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          move(1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          move(-1);
        } else if (event.key === 'Tab') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      {entries.map((entry, index) =>
        entry === 'separator' ? (
          <div key={`sep-${index}`} className="menu-separator" role="separator" />
        ) : (
          <div
            key={entry.label}
            role="menuitem"
            tabIndex={-1}
            aria-disabled={entry.disabled ? true : undefined}
            className={`menu-item${entry.danger ? ' menu-item-danger' : ''}${entry.disabled ? ' menu-item-disabled' : ''}`}
            onClick={() => pick(entry)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                pick(entry);
              }
            }}
          >
            {entry.icon && <span className="menu-icon">{entry.icon}</span>}
            <span>{entry.label}</span>
          </div>
        ),
      )}
    </div>,
    document.body,
  );
}

export interface MenuState {
  entries: readonly MenuEntry[];
  x: number;
  y: number;
  label: string;
}

/** Holds one open menu: `open` from a mouse event or an element, render `menu`. */
export function useMenu() {
  const [state, setState] = useState<MenuState | null>(null);
  const close = useCallback(() => setState(null), []);
  const openAt = useCallback((x: number, y: number, label: string, entries: readonly MenuEntry[]) => {
    setState({ x, y, label, entries });
  }, []);
  const openBelow = useCallback((element: HTMLElement, label: string, entries: readonly MenuEntry[]) => {
    const rect = element.getBoundingClientRect();
    setState({ x: rect.left, y: rect.bottom + 4, label, entries });
  }, []);
  const menu = state ? <Menu entries={state.entries} x={state.x} y={state.y} label={state.label} onClose={close} /> : null;
  return { menu, openAt, openBelow, close, isOpen: state !== null };
}
