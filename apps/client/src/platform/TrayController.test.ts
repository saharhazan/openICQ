import type { DesktopBridge, TrayState } from '@openicq/desktop-bridge';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { contact, message, SELF, snapshot } from '../../tests/fixtures';
import type { TrayIcon } from '../app/trayActions';
import { createAppStore, type AppStore } from '../state/store';
import { TrayController } from './TrayController';

const iconKey = (icon: TrayIcon) => (icon.kind === 'message' ? 'message' : `${icon.variant}:${icon.frame}`);

let store: AppStore;
let sent: TrayState[];
let command: (id: string) => void;
let bridge: Pick<DesktopBridge, 'updateTray' | 'requestAttention' | 'onTrayCommand'>;
let onActivate: Mock<() => void>;
let selected: Mock<() => void>;
let tray: TrayController;

beforeEach(() => {
  vi.useFakeTimers();
  store = createAppStore();
  sent = [];
  command = () => undefined;
  onActivate = vi.fn<() => void>();
  selected = vi.fn<() => void>();
  bridge = {
    updateTray: vi.fn((state: TrayState) => sent.push(state)),
    requestAttention: vi.fn(),
    onTrayCommand: vi.fn((listener: (id: string) => void) => {
      command = listener;
      return () => undefined;
    }),
  };
  tray = new TrayController({
    store,
    // The controller only uses these three bridge calls.
    bridge: bridge as DesktopBridge,
    renderIcon: (icon) => ({ x1: `data:image/png;base64,${iconKey(icon)}`, x2: `data:image/png;base64,${iconKey(icon)}@2x` }),
    menu: () => [
      { type: 'title', label: 'Online Status' },
      { type: 'item', label: 'Away', onSelect: selected, checked: true },
      { type: 'separator' },
    ],
    onActivate,
    report: vi.fn(),
  });
});

afterEach(() => {
  tray.stop();
  vi.useRealTimers();
});

function signIn() {
  const state = store.getState();
  state.setSession({ uin: SELF, nickname: 'Me' });
  state.setConnection('open');
  state.applySnapshot(snapshot({ contacts: [contact(100002, 'Bob', { status: 'online' })] }));
}

describe('TrayController', () => {
  it('shows the offline flower, the program name and the menu at start', () => {
    tray.start();
    expect(sent.at(-1)).toEqual({
      icon: { x1: 'data:image/png;base64,offline:0', x2: 'data:image/png;base64,offline:0@2x' },
      tooltip: 'openICQ',
      badge: 0,
      menu: [{ type: 'item', id: 'item:1', label: 'Away', enabled: true, checked: true }],
    });
  });

  it('follows the own status and sends nothing when nothing changed', () => {
    tray.start();
    signIn();
    expect(sent.at(-1)?.icon.x1).toBe('data:image/png;base64,online:0');
    const count = sent.length;
    store.getState().setBooting(false);
    expect(sent).toHaveLength(count);
  });

  it('blinks the message balloon, counts the badge and asks for attention on a new message', () => {
    tray.start();
    signIn();
    store.getState().applySnapshot(snapshot({ unread: [message(100002, SELF, 'Hi')] }));
    expect(bridge.requestAttention).toHaveBeenCalledOnce();
    expect(sent.at(-1)).toMatchObject({ tooltip: 'openICQ - 1 unread message', badge: 1 });
    expect(sent.at(-1)?.icon.x1).toBe('data:image/png;base64,online:0');
    vi.advanceTimersByTime(500);
    expect(sent.at(-1)?.icon.x1).toBe('data:image/png;base64,message');
    vi.advanceTimersByTime(500);
    expect(sent.at(-1)?.icon.x1).toBe('data:image/png;base64,online:0');
  });

  it('spins the flower while connecting', () => {
    tray.start();
    store.getState().setConnection('connecting');
    vi.advanceTimersByTime(120);
    expect(sent.at(-1)?.icon.x1).toBe('data:image/png;base64,connecting:1');
    vi.advanceTimersByTime(120);
    expect(sent.at(-1)?.icon.x1).toBe('data:image/png;base64,connecting:2');
  });

  it('runs the clicked menu item and opens ICQ on a click of the icon', () => {
    tray.start();
    command('item:1');
    expect(selected).toHaveBeenCalledOnce();
    command('activate');
    expect(onActivate).toHaveBeenCalledOnce();
    command('item:99');
    expect(selected).toHaveBeenCalledOnce();
  });
});
