/** Composition root: builds every service once and wires them to the store. */
import type { DesktopBridge } from '@openicq/desktop-bridge';
import { WS_PATH } from '@openicq/protocol';
import { statusMenu } from '../features/contact-list/menus';
import { ApiClient } from '../net/ApiClient';
import { IcqConnection, sameOriginSocketUrl } from '../net/IcqConnection';
import { findDesktopBridge } from '../platform/bridge';
import { NativeWindowManager } from '../platform/NativeWindowManager';
import { rasterize } from '../platform/rasterize';
import { SystemActivityTarget } from '../platform/SystemActivityTarget';
import { TrayController } from '../platform/TrayController';
import type { SurfaceView } from '../platform/WindowSurface';
import type { AppStoreState } from '../state/store';
import type { MenuItem } from '../ui/PopupMenu';
import { MESSAGE_ICON_PATHS } from '../ui/icons/MessageIcon';
import { statusIconPaths } from '../ui/icons/StatusIcon';
import { createAppStore, type AppStore } from '../state/store';
import { RESIZABLE_KINDS } from '../state/placement';
import { SoundPlayer } from '../ui/SoundPlayer';
import { IcqCommands } from './IcqCommands';
import { IdleMonitor } from './IdleMonitor';
import { LocalPrefs } from './LocalPrefs';
import { STRINGS } from '../features/strings';
import { SessionController } from './SessionController';
import { openFromTray, type TrayIcon } from './trayActions';

/** Present only inside the openICQ desktop app. */
export interface DesktopServices {
  bridge: DesktopBridge;
  windows: NativeWindowManager;
  tray: TrayController;
}

export interface Services {
  store: AppStore;
  session: SessionController;
  commands: IcqCommands;
  prefs: LocalPrefs;
  sounds: SoundPlayer;
  idle: IdleMonitor;
  desktop: DesktopServices | null;
  /** Stops listeners and timers (tests, hot reload). */
  dispose(): void;
}

function renderTrayIcon(icon: TrayIcon) {
  const paths = icon.kind === 'message' ? MESSAGE_ICON_PATHS : statusIconPaths(icon.variant, icon.frame);
  return { x1: rasterize(document, paths, 16), x2: rasterize(document, paths, 32) };
}

/** The tray menu: the status choices, then the program itself, as the ICQ tray menu offered. */
function trayMenu(services: Services, bridge: DesktopBridge, state: AppStoreState): MenuItem[] {
  const { store } = services;
  const statuses: MenuItem[] = state.session
    ? statusMenu(services, state.status).map((item) =>
        item.type === 'item' ? { ...item, checked: item.isDefault === true, isDefault: false } : item,
      )
    : [];
  return [
    ...statuses,
    { type: 'separator' },
    { type: 'item', label: STRINGS.appName, onSelect: () => openFromTray(store) },
    { type: 'item', label: 'Connection Settings...', onSelect: () => bridge.openConnectionSettings() },
    { type: 'item', label: `About ${STRINGS.appName}`, onSelect: () => store.getState().openWindow({ kind: 'about' }) },
    { type: 'separator' },
    { type: 'item', label: STRINGS.shutDown, onSelect: () => store.getState().openWindow({ kind: 'confirmShutDown' }) },
  ];
}

export function createServices(): Services {
  const bridge = findDesktopBridge();
  let storageFailureReported = false;
  let storeRef: AppStore | null = null;
  const prefs = new LocalPrefs(
    () => window.localStorage,
    (error) => {
      // Reported once: the app keeps working, it only forgets positions and recent ICQ numbers.
      if (storageFailureReported || !storeRef) return;
      storageFailureReported = true;
      storeRef.getState().reportError(error, STRINGS.appName);
    },
  );
  const store = createAppStore({
    // Native windows are placed on the screen; in a browser, inside the page.
    viewport: () =>
      bridge ? { width: window.screen.availWidth, height: window.screen.availHeight } : { width: window.innerWidth, height: window.innerHeight },
    saved: (kind) => {
      const rect = prefs.windowRect(kind);
      if (!rect) return null;
      return RESIZABLE_KINDS.has(kind) ? rect : { ...rect, width: null, height: null };
    },
  });
  storeRef = store;
  const report = (error: Error) => store.getState().reportError(error, STRINGS.appName);
  const sounds = new SoundPlayer(report);
  const api = new ApiClient();
  const connection = new IcqConnection({ url: sameOriginSocketUrl(WS_PATH) });
  const session = new SessionController({ api, connection, store, sounds, prefs });
  const commands = new IcqCommands(connection, store);
  const idle = new IdleMonitor({
    target: bridge ? new SystemActivityTarget(() => bridge.systemIdleSeconds(), report) : window,
    onChange: (level) => session.handleIdle(level),
  });

  // Auto-away follows the server-side preferences.
  const applyIdleSettings = () => {
    const preferences = store.getState().settings?.preferences;
    if (!preferences) {
      idle.stop();
      return;
    }
    idle.configure(preferences.autoAwayMinutes, preferences.autoNaMinutes);
    idle.start();
  };
  const unsubscribe = store.subscribe((state, previous) => {
    if (state.settings !== previous.settings) applyIdleSettings();
  });

  const services: Services = {
    store,
    session,
    commands,
    prefs,
    sounds,
    idle,
    desktop: null,
    dispose: () => {
      unsubscribe();
      idle.stop();
      services.desktop?.windows.stop();
      services.desktop?.tray.stop();
      session.dispose();
    },
  };
  if (bridge) {
    const windows = new NativeWindowManager({
      store,
      bridge,
      prefs,
      hostDocument: document,
      // Safe: a same-origin window opened by this page is a full global object of its own.
      open: (frameName, features) => window.open('', frameName, features) as SurfaceView | null,
      report,
    });
    const tray = new TrayController({
      store,
      bridge,
      renderIcon: renderTrayIcon,
      menu: (state) => trayMenu(services, bridge, state),
      onActivate: () => openFromTray(store),
      report,
    });
    services.desktop = { bridge, windows, tray };
    windows.start();
    tray.start();
  }
  return services;
}
