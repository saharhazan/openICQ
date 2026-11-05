import { describe, expect, it, vi } from 'vitest';
import { toTrayMenu } from './trayMenu';

describe('toTrayMenu', () => {
  it('keeps items and single separators, and maps clicks by id', () => {
    const online = vi.fn();
    const menu = toTrayMenu([
      { type: 'separator' },
      { type: 'title', label: 'Online Status' },
      { type: 'item', label: 'Online', onSelect: online, checked: true },
      { type: 'separator' },
      { type: 'separator' },
      { type: 'item', label: 'Shut Down', onSelect: vi.fn(), disabled: true },
      { type: 'submenu', label: 'More', items: [] },
      { type: 'separator' },
    ]);
    expect(menu.items).toEqual([
      { type: 'item', id: 'item:2', label: 'Online', enabled: true, checked: true },
      { type: 'separator' },
      { type: 'item', id: 'item:5', label: 'Shut Down', enabled: false, checked: false },
    ]);
    menu.commands.get('item:2')?.();
    expect(online).toHaveBeenCalledOnce();
  });
});
