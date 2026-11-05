/**
 * Desktop app: whether the window is on screen and focused comes from the
 * shell (the OS truth). A window hidden in the tray must not mark messages
 * read, and the page cannot always tell that it is hidden.
 */
import type { DesktopBridge } from '@openicq/desktop-bridge';
import type { FocusProbe } from './Notifier';
import type { FocusEvents } from './ReadTracker';

export function desktopFocusProbe(bridge: Pick<DesktopBridge, 'windowState'>): FocusProbe {
  return {
    focused: () => {
      const state = bridge.windowState();
      return state.visible && state.focused;
    },
  };
}

/** Announces every window state change as a 'focus' event, so the read tracker checks again. */
export function desktopFocusEvents(bridge: Pick<DesktopBridge, 'onWindowState'>): FocusEvents {
  const subscriptions = new Map<() => void, () => void>();
  return {
    addEventListener: (_type, listener) => {
      if (!subscriptions.has(listener)) subscriptions.set(listener, bridge.onWindowState(() => listener()));
    },
    removeEventListener: (_type, listener) => {
      subscriptions.get(listener)?.();
      subscriptions.delete(listener);
    },
  };
}
