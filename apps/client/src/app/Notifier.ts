/**
 * Incoming message alerts and the unread counter. Desktop: bridge.notify and
 * bridge.setUnread. Browser: the Notification API (after permission) and the
 * document title. Sounds follow "Play sounds", at most one every 3 s
 * (SoundsManager.cpp IncomingMessageInterval).
 */
import type { DesktopBridge } from '@openicq/desktop-bridge';
import { S } from '../strings';
import type { SoundName } from '../ui/SoundPlayer';
import type { DevicePrefs } from './devicePrefs';

export const SOUND_INTERVAL_MS = 3_000;

export interface SoundOutput {
  play(name: SoundName): void;
  unlock(): void;
}

/** The part of the web Notification API used here, so tests can pass a fake. */
export interface WebNotifications {
  permission(): NotificationPermission | 'unsupported';
  request(): Promise<NotificationPermission>;
  show(title: string, options: { body: string; tag: string; silent: boolean }, onClick: () => void): void;
}

export interface FocusProbe {
  /** The window is focused and visible. */
  focused(): boolean;
}

export interface IncomingAlert {
  chatId: number;
  /** Chat title (the contact, or the group name). */
  title: string;
  /** Group chats: the sender's name, shown before the text. */
  sender: string | null;
  text: string;
  /** The chat is open on screen right now. */
  chatOpen: boolean;
}

export interface NotifierDeps {
  bridge: DesktopBridge | null;
  web: WebNotifications | null;
  sounds: SoundOutput;
  focus: FocusProbe;
  prefs: () => DevicePrefs;
  setTitle: (title: string) => void;
  onOpenChat: (chatId: number) => void;
  onError: (error: Error) => void;
  now?: () => number;
}

export class Notifier {
  readonly #deps: NotifierDeps;
  readonly #now: () => number;
  #lastSound = Number.NEGATIVE_INFINITY;
  #lastUnread = -1;

  constructor(deps: NotifierDeps) {
    this.#deps = deps;
    this.#now = deps.now ?? Date.now;
  }

  incoming(alert: IncomingAlert): void {
    const prefs = this.#deps.prefs();
    const focused = this.#deps.focus.focused();
    if (focused && alert.chatOpen) return;
    if (prefs.playSounds) this.#playThrottled('incoming');
    if (!prefs.showNotifications || (focused && !prefs.showInFocus)) return;
    const title = prefs.hideSender ? S.appName : alert.title;
    const body = prefs.hideText
      ? S.notifications.newMessage
      : alert.sender && !prefs.hideSender
        ? `${alert.sender}: ${alert.text}`
        : alert.text;
    const tag = `chat-${alert.chatId}`;
    const { bridge, web } = this.#deps;
    if (bridge) {
      bridge.notify({ tag, title: title.slice(0, 200), body: body.slice(0, 500), chatId: alert.chatId, silent: true });
      return;
    }
    if (web && web.permission() === 'granted') {
      try {
        web.show(title, { body, tag, silent: true }, () => this.#deps.onOpenChat(alert.chatId));
      } catch (error) {
        this.#deps.onError(new Error('openICQ could not show a notification.', { cause: error }));
      }
    }
  }

  /** A new message of mine went out (not an edit): the optional outgoing sound. */
  outgoing(): void {
    if (this.#deps.prefs().outgoingSound) this.#deps.sounds.play('outgoing');
  }

  /** Window title "(3) openICQ" and the dock or taskbar badge. */
  setUnread(count: number): void {
    if (count === this.#lastUnread) return;
    this.#lastUnread = count;
    this.#deps.setTitle(count > 0 ? `(${count}) ${S.appName}` : S.appName);
    this.#deps.bridge?.setUnread(Math.min(count, 99_999));
  }

  /** Asks for web notification permission; must run inside a user gesture. */
  async requestPermission(): Promise<NotificationPermission | 'unsupported'> {
    const { web, bridge } = this.#deps;
    if (bridge) return 'granted';
    if (!web) return 'unsupported';
    const current = web.permission();
    if (current !== 'default') return current;
    return web.request();
  }

  permission(): NotificationPermission | 'unsupported' {
    if (this.#deps.bridge) return 'granted';
    return this.#deps.web?.permission() ?? 'unsupported';
  }

  #playThrottled(name: SoundName): void {
    const now = this.#now();
    if (now - this.#lastSound < SOUND_INTERVAL_MS) return;
    this.#lastSound = now;
    this.#deps.sounds.play(name);
  }
}

/** The browser implementation of WebNotifications, or null when the API is missing. */
export function browserNotifications(): WebNotifications | null {
  const Api: typeof Notification | undefined = globalThis.Notification;
  if (!Api) return null;
  return {
    permission: () => Api.permission,
    request: () => Api.requestPermission(),
    show: (title, options, onClick) => {
      const notification = new Api(title, options);
      notification.onclick = () => {
        window.focus();
        onClick();
        notification.close();
      };
    },
  };
}
