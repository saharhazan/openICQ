import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useWindowSurface } from '../platform/WindowSurface';
import './PopupMenu.css';

export type MenuItem =
  | {
      type: 'item';
      label: string;
      icon?: ReactNode;
      onSelect: () => void;
      disabled?: boolean;
      checked?: boolean;
      /** The default action, shown in bold like Win32 default menu items. */
      isDefault?: boolean;
    }
  | { type: 'separator' }
  /** A centred caption between two lines, as the owner-drawn ICQ menus use ("Online Status"). */
  | { type: 'title'; label: string }
  | { type: 'submenu'; label: string; icon?: ReactNode; items: MenuItem[]; disabled?: boolean };

export interface MenuAnchor {
  x: number;
  y: number;
  /** Open upwards from y (menus that sit on a bottom button). */
  above?: boolean;
}

export interface PopupMenuProps {
  items: MenuItem[];
  anchor: MenuAnchor;
  onClose: () => void;
  /** The vertical ICQ banner on the left edge of the Main and status menus. */
  banner?: ReactNode;
  label: string;
}

/** Win98 popup menu with submenus, rendered on top of every window. */
export function PopupMenu({ items, anchor, onClose, banner, label }: PopupMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  // The window this menu belongs to: a native window in the desktop app, the page in a browser.
  const { view } = useWindowSurface();

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && event.target instanceof view.Node && rootRef.current.contains(event.target)) return;
      onClose();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    view.addEventListener('pointerdown', onPointerDown, true);
    view.addEventListener('keydown', onKey);
    view.addEventListener('blur', onClose);
    return () => {
      view.removeEventListener('pointerdown', onPointerDown, true);
      view.removeEventListener('keydown', onKey);
      view.removeEventListener('blur', onClose);
    };
  }, [onClose, view]);

  return createPortal(
    <div ref={rootRef} className="icq-menu-layer">
      <MenuPanel items={items} anchor={anchor} onClose={onClose} banner={banner} label={label} level={0} />
    </div>,
    view.document.body,
  );
}

interface PanelProps {
  items: MenuItem[];
  anchor: MenuAnchor;
  onClose: () => void;
  banner?: ReactNode;
  label: string;
  level: number;
}

function MenuPanel({ items, anchor, onClose, banner, label, level }: PanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { view } = useWindowSurface();
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [openSub, setOpenSub] = useState<number | null>(null);
  const [subAnchor, setSubAnchor] = useState<MenuAnchor | null>(null);

  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    let left = anchor.x;
    let top = anchor.above ? anchor.y - height : anchor.y;
    if (left + width > view.innerWidth) left = Math.max(0, level > 0 ? anchor.x - width - 160 : view.innerWidth - width);
    if (top + height > view.innerHeight) top = Math.max(0, view.innerHeight - height);
    if (top < 0) top = 0;
    setPosition({ left, top });
  }, [anchor, level, view]);

  useEffect(() => {
    if (level === 0) panelRef.current?.focus();
  }, [level]);

  const activate = (index: number, item: MenuItem, element: HTMLElement) => {
    if (item.type === 'separator' || item.type === 'title' || item.disabled) return;
    if (item.type === 'submenu') {
      const rect = element.getBoundingClientRect();
      setOpenSub(index);
      setSubAnchor({ x: rect.right - 3, y: rect.top - 3 });
      return;
    }
    onClose();
    item.onSelect();
  };

  return (
    <>
      <div
        ref={panelRef}
        role="menu"
        aria-label={label}
        tabIndex={-1}
        className="icq-menu"
        style={position ? { left: position.left, top: position.top } : { left: anchor.x, top: anchor.y, visibility: 'hidden' }}
      >
        {banner ? <div className="icq-menu__banner">{banner}</div> : null}
        <div className="icq-menu__items">
          {items.map((item, index) =>
            item.type === 'separator' ? (
              <div key={`sep-${index}`} role="separator" className="icq-menu__separator" />
            ) : item.type === 'title' ? (
              <div key={`title-${index}`} role="presentation" className="icq-menu__title">
                <span>{item.label}</span>
              </div>
            ) : (
              <div
                key={`${item.label}-${index}`}
                role="menuitem"
                tabIndex={-1}
                aria-disabled={item.disabled ? 'true' : undefined}
                aria-haspopup={item.type === 'submenu' ? 'menu' : undefined}
                aria-checked={item.type === 'item' && item.checked !== undefined ? item.checked : undefined}
                className={[
                  'icq-menu__item',
                  item.disabled ? 'is-disabled' : '',
                  openSub === index ? 'is-open' : '',
                  item.type === 'item' && item.isDefault ? 'is-default' : '',
                ].join(' ')}
                onPointerEnter={(e) => {
                  if (item.type === 'submenu') activate(index, item, e.currentTarget);
                  else setOpenSub(null);
                }}
                onClick={(e) => activate(index, item, e.currentTarget)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') activate(index, item, e.currentTarget);
                }}
              >
                <span className="icq-menu__icon">
                  {item.type === 'item' && item.checked ? <span className="icq-menu__check" aria-hidden="true" /> : item.icon}
                </span>
                <span className="icq-menu__label">{item.label}</span>
                {item.type === 'submenu' ? <span className="icq-menu__arrow" aria-hidden="true" /> : null}
              </div>
            ),
          )}
        </div>
      </div>
      {openSub !== null && subAnchor ? (
        <SubPanel item={items[openSub]} anchor={subAnchor} onClose={onClose} level={level + 1} />
      ) : null}
    </>
  );
}

function SubPanel({ item, anchor, onClose, level }: { item: MenuItem | undefined; anchor: MenuAnchor; onClose: () => void; level: number }) {
  if (!item || item.type !== 'submenu') return null;
  return <MenuPanel items={item.items} anchor={anchor} onClose={onClose} label={item.label} level={level} />;
}
