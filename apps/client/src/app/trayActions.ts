/**
 * What the ICQ tray flower shows and does. Shared by the in-page taskbar and
 * the native tray icon of the desktop app, so both behave the same.
 */
import type { Status } from '@openicq/protocol';
import { STRINGS } from '../features/strings';
import { totalUnread } from '../state/contactList';
import type { AppState, AppStore } from '../state/store';
import type { FlowerVariant } from '../ui/icons/StatusIcon';

export type TrayIcon = { kind: 'message' } | { kind: 'flower'; variant: FlowerVariant; frame: number };

export interface TrayIndicator {
  signedIn: boolean;
  /** Own status as the server confirmed it. */
  status: Status;
  /** Unread messages or waiting System Notices make the flower blink. */
  blinking: boolean;
  /** The flower spins while a connection or status change is on its way. */
  connecting: boolean;
  unread: number;
  notices: number;
}

export function trayIndicator(state: AppState): TrayIndicator {
  const unread = totalUnread(state.chat);
  const notices = state.chat.notices.length;
  const signedIn = state.session !== null;
  return {
    signedIn,
    status: state.status,
    blinking: signedIn && (unread > 0 || notices > 0),
    connecting: state.statusPending || state.connection === 'connecting' || state.connection === 'reconnecting',
    unread,
    notices,
  };
}

/** `blinkOn` is the visible phase of the blink; `frame` the spinning flower frame. */
export function trayIcon(indicator: TrayIndicator, blinkOn: boolean, frame: number): TrayIcon {
  if (indicator.blinking && !blinkOn) {
    return indicator.unread > 0 ? { kind: 'message' } : { kind: 'flower', variant: 'logo', frame: 0 };
  }
  if (indicator.connecting) return { kind: 'flower', variant: 'connecting', frame };
  return { kind: 'flower', variant: indicator.signedIn ? indicator.status : 'offline', frame: 0 };
}

export function trayLabel(unread: number): string {
  return unread > 0 ? `${STRINGS.appName} - ${unread} unread message${unread === 1 ? '' : 's'}` : STRINGS.appName;
}

/** A click on the tray flower: the next unread message, then a waiting notice, else the Contact List. */
export function openFromTray(store: AppStore): void {
  const state = store.getState();
  if (!state.session) {
    state.openWindow({ kind: 'login' });
    return;
  }
  const firstUnread = Object.entries(state.chat.conversations).find(([uin, c]) =>
    c?.messages.some((m) => m.from === Number(uin) && !m.read),
  );
  if (firstUnread) {
    state.openWindow({ kind: 'message', uin: Number(firstUnread[0]) });
    return;
  }
  const notice = state.chat.notices[0];
  if (notice) {
    state.openWindow({ kind: 'notice', noticeId: notice.id });
    return;
  }
  state.openWindow({ kind: 'contactList' });
}
