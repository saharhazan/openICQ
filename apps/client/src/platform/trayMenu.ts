/**
 * Converts ICQ popup menu items into the serializable tray menu of the desktop
 * shell, and keeps the click handlers on this side (only ids cross the bridge).
 */
import type { TrayMenuItem } from '@openicq/desktop-bridge';
import type { MenuItem } from '../ui/PopupMenu';

export interface TrayMenu {
  items: TrayMenuItem[];
  commands: ReadonlyMap<string, () => void>;
}

/** Titles have no native counterpart and submenus are not used in the tray, so both are left out. */
export function toTrayMenu(items: readonly MenuItem[]): TrayMenu {
  const out: TrayMenuItem[] = [];
  const commands = new Map<string, () => void>();
  items.forEach((item, index) => {
    if (item.type === 'separator') {
      if (out.length > 0 && out[out.length - 1]?.type !== 'separator') out.push({ type: 'separator' });
      return;
    }
    if (item.type !== 'item') return;
    const id = `item:${index}`;
    out.push({ type: 'item', id, label: item.label, enabled: !item.disabled, checked: item.checked === true });
    commands.set(id, item.onSelect);
  });
  while (out[out.length - 1]?.type === 'separator') out.pop();
  return { items: out, commands };
}
