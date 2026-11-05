/**
 * Marks the open chat read while it is on screen and the window has focus:
 * when the chat opens, when its history arrives, when a newer message
 * arrives and when the window gets the focus back. "Mark as unread" on the
 * open chat stays until one of those happens.
 */
import { newestMessageId } from '../state/selectors';
import { isChatOnScreen, type AppStore, type AppStoreState } from '../state/store';
import type { FocusProbe } from './Notifier';

export interface FocusEvents {
  addEventListener(type: 'focus' | 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'focus' | 'visibilitychange', listener: () => void): void;
}

export interface ReadTrackerDeps {
  store: AppStore;
  focus: FocusProbe;
  markRead: (chatId: number) => Promise<void>;
  /** window and document, where focus and visibility changes are announced. */
  targets: readonly FocusEvents[];
}

function trigger(state: AppStoreState): string | null {
  const chatId = state.selectedChatId;
  if (chatId === null || !isChatOnScreen(state, chatId)) return null;
  const chat = state.data.chats[chatId];
  const history = state.data.histories[chatId];
  if (!chat || !history?.loaded) return null;
  return `${chatId}:${newestMessageId(state.data, chat)}`;
}

export class ReadTracker {
  readonly #deps: ReadTrackerDeps;
  #last: string | null = null;
  #stop: (() => void) | null = null;

  constructor(deps: ReadTrackerDeps) {
    this.#deps = deps;
  }

  start(): void {
    if (this.#stop) return;
    const onFocus = () => this.#check(true);
    const unsubscribe = this.#deps.store.subscribe((state) => {
      const key = trigger(state);
      if (key === this.#last) return;
      this.#last = key;
      if (key !== null) this.#check(false);
    });
    this.#deps.targets.forEach((target) => {
      target.addEventListener('focus', onFocus);
      target.addEventListener('visibilitychange', onFocus);
    });
    this.#stop = () => {
      unsubscribe();
      this.#deps.targets.forEach((target) => {
        target.removeEventListener('focus', onFocus);
        target.removeEventListener('visibilitychange', onFocus);
      });
    };
  }

  stop(): void {
    this.#stop?.();
    this.#stop = null;
  }

  #check(fromFocus: boolean): void {
    const state = this.#deps.store.getState();
    const key = trigger(state);
    if (key === null || state.selectedChatId === null) return;
    if (fromFocus) this.#last = key;
    if (!this.#deps.focus.focused()) return;
    void this.#deps.markRead(state.selectedChatId);
  }
}
