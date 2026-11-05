import type { WindowState } from '@openicq/desktop-bridge';
import { describe, expect, it, vi } from 'vitest';
import { desktopFocusEvents, desktopFocusProbe } from './desktopFocus';

function fakeBridge(initial: WindowState) {
  let state = initial;
  const listeners = new Set<(s: WindowState) => void>();
  return {
    windowState: () => state,
    onWindowState: (listener: (s: WindowState) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(next: WindowState) {
      state = next;
      for (const listener of listeners) listener(next);
    },
  };
}

describe('desktop focus', () => {
  it('is focused only while the window is visible and has the focus (hidden in the tray is not)', () => {
    const bridge = fakeBridge({ visible: true, focused: true });
    const probe = desktopFocusProbe(bridge);
    expect(probe.focused()).toBe(true);
    bridge.emit({ visible: false, focused: false });
    expect(probe.focused()).toBe(false);
    bridge.emit({ visible: true, focused: false });
    expect(probe.focused()).toBe(false);
  });

  it('announces state changes as focus events until the listener is removed', () => {
    const bridge = fakeBridge({ visible: false, focused: false });
    const events = desktopFocusEvents(bridge);
    const listener = vi.fn<() => void>();
    events.addEventListener('focus', listener);
    events.addEventListener('visibilitychange', listener);
    bridge.emit({ visible: true, focused: true });
    expect(listener).toHaveBeenCalledTimes(1);
    events.removeEventListener('focus', listener);
    bridge.emit({ visible: false, focused: false });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
