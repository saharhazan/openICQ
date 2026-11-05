/** Composition root: builds every service once and wires them to the store. */
import type { DesktopBridge } from '@openicq/desktop-bridge';
import { WS_PATH } from '@openicq/protocol';
import { ApiClient } from '../net/ApiClient';
import { IcqConnection, sameOriginSocketUrl } from '../net/IcqConnection';
import { totalUnread } from '../state/selectors';
import { createAppStore, type AppStore } from '../state/store';
import { SoundPlayer } from '../ui/SoundPlayer';
import { AccountCommands } from './AccountCommands';
import { findDesktopBridge } from './bridge';
import { desktopFocusEvents, desktopFocusProbe } from './desktopFocus';
import { ChatCommands } from './ChatCommands';
import { GroupCommands } from './GroupCommands';
import { LocalPrefs } from './LocalPrefs';
import { browserNotifications, Notifier, type FocusProbe } from './Notifier';
import type { Api } from './ports';
import { ReadTracker } from './ReadTracker';
import { SessionController } from './SessionController';

export interface Services {
  store: AppStore;
  api: Api;
  session: SessionController;
  chats: ChatCommands;
  account: AccountCommands;
  groups: GroupCommands;
  notifier: Notifier;
  bridge: DesktopBridge | null;
  /** Stops listeners and timers (tests, hot reload). */
  dispose(): void;
}

const DRAFT_SAVE_DELAY_MS = 1_000;

const windowFocus: FocusProbe = {
  focused: () => document.visibilityState === 'visible' && document.hasFocus(),
};

export function createServices(): Services {
  const bridge = findDesktopBridge();
  const focus = bridge ? desktopFocusProbe(bridge) : windowFocus;
  const focusTargets = bridge ? [desktopFocusEvents(bridge)] : [window, document];
  let storeRef: AppStore | null = null;
  let storageReported = false;
  const local = new LocalPrefs(
    () => window.localStorage,
    (error) => {
      // Reported once: the app keeps working, it only forgets settings and drafts.
      if (storageReported || !storeRef) return;
      storageReported = true;
      storeRef.getState().reportError(error);
    },
  );
  const store = createAppStore({ prefs: local.loadPrefs() });
  storeRef = store;
  const report = (error: Error) => store.getState().reportError(error);
  const sounds = new SoundPlayer(report);
  const api = new ApiClient();
  const connection = new IcqConnection({ url: sameOriginSocketUrl(WS_PATH) });
  const notifier = new Notifier({
    bridge,
    web: bridge ? null : browserNotifications(),
    sounds,
    focus,
    prefs: () => store.getState().prefs,
    setTitle: (title) => {
      document.title = title;
    },
    onOpenChat: (chatId) => store.getState().openChat(chatId),
    onError: report,
  });
  const chats = new ChatCommands({ api, connection, store, sound: notifier });
  const account = new AccountCommands({ api, connection, store });
  const groups = new GroupCommands({ connection, store });
  const session = new SessionController({
    api,
    connection,
    store,
    drafts: local,
    alerts: notifier,
    sounds,
    onStarted: () => chats.reloadOpenChat(),
  });
  const reads = new ReadTracker({ store, focus, markRead: (chatId) => chats.markRead(chatId), targets: focusTargets });
  reads.start();

  let draftTimer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = store.subscribe((state, previous) => {
    if (state.data.chats !== previous.data.chats) notifier.setUnread(totalUnread(state.data.chats));
    if (state.prefs !== previous.prefs) {
      local.savePrefs(state.prefs);
      const p = state.prefs;
      const q = previous.prefs;
      if (bridge && (p.launchAtLogin !== q.launchAtLogin || p.launchMinimized !== q.launchMinimized || p.animateTaskbar !== q.animateTaskbar)) {
        bridge.setPreferences({ launchAtLogin: p.launchAtLogin, launchMinimized: p.launchMinimized, animateTaskbar: p.animateTaskbar });
      }
    }
    if (state.phase === 'auth' && previous.phase !== 'auth' && draftTimer !== null) {
      // Signed out with a save pending: write the account's drafts now instead of the emptied ones.
      clearTimeout(draftTimer);
      draftTimer = null;
      const previousUin = previous.data.me?.uin;
      if (previousUin !== undefined) local.saveDrafts(previousUin, previous.drafts);
    }
    const uin = state.data.me?.uin;
    if (state.drafts !== previous.drafts && uin !== undefined && state.phase !== 'auth') {
      if (draftTimer !== null) clearTimeout(draftTimer);
      draftTimer = setTimeout(() => {
        draftTimer = null;
        local.saveDrafts(uin, store.getState().drafts);
      }, DRAFT_SAVE_DELAY_MS);
    }
  });

  const stops: Array<() => void> = [unsubscribe, () => reads.stop()];
  if (bridge) {
    const p = store.getState().prefs;
    bridge.setPreferences({ launchAtLogin: p.launchAtLogin, launchMinimized: p.launchMinimized, animateTaskbar: p.animateTaskbar });
    stops.push(
      bridge.onNotificationClick((chatId) => store.getState().openChat(chatId)),
      bridge.onTrayCommand((command) => {
        if (command === 'settings') store.getState().patch({ tab: 'settings', settingsPage: 'general' });
      }),
    );
  }

  return {
    store,
    api,
    session,
    chats,
    account,
    groups,
    notifier,
    bridge,
    dispose: () => {
      stops.forEach((stop) => stop());
      if (draftTimer !== null) clearTimeout(draftTimer);
      session.dispose();
    },
  };
}
