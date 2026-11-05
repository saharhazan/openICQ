/**
 * Signs in, keeps the WebSocket session alive, applies server events to the
 * store and runs their side effects (sounds, auto popup, auto-away).
 */
import {
  CLOSE_CODES,
  hasStatusMessage,
  type LoginBody,
  type RegisterBody,
  type ServerEvent,
  type SettableStatus,
  type Status,
  type Uin,
} from '@openicq/protocol';
import type { ApiClient } from '../net/ApiClient';
import type { CloseInfo, ConnectionState, IcqConnection } from '../net/IcqConnection';
import { IcqError } from '../net/errors';
import { conversationOf, markMessagesRead } from '../state/chat';
import { deriveEventEffects, type EventEffect, type SoundName } from '../state/effects';
import type { AppStore } from '../state/store';
import { activeWindowId, findWindow } from '../state/windows';
import type { IdleLevel } from './IdleMonitor';
import type { LocalPrefs } from './LocalPrefs';

export interface SoundOutput {
  play(name: SoundName): void;
  unlock(): void;
}

export interface SessionDeps {
  api: ApiClient;
  connection: IcqConnection;
  store: AppStore;
  sounds: SoundOutput;
  prefs: LocalPrefs;
}

const CONNECT_TITLE = 'ICQ Connection';

/** connected: online; offline: signed in but the socket failed; rejected: wrong ICQ# or password. */
export type LoginOutcome = 'connected' | 'offline' | 'rejected' | 'failed';

export class SessionController {
  readonly #api: ApiClient;
  readonly #connection: IcqConnection;
  readonly #store: AppStore;
  readonly #sounds: SoundOutput;
  readonly #prefs: LocalPrefs;
  /** The status the user asked for; reconnects come back with it. */
  #desired: SettableStatus = 'online';
  /** Set while the current status was chosen by auto-away, with the status to restore. */
  #autoAway: { previous: SettableStatus } | null = null;
  readonly #unsubscribe: Array<() => void> = [];
  #booted = false;
  /** The shared connect + session.start while one is running. */
  #starting: Promise<boolean> | null = null;
  /** Number of automatic status changes still waiting for the server. */
  #autoPending = 0;
  /** True after the user chose Offline or signed out, until the next goOnline. */
  #offlineByUser = false;

  constructor(deps: SessionDeps) {
    this.#api = deps.api;
    this.#connection = deps.connection;
    this.#store = deps.store;
    this.#sounds = deps.sounds;
    this.#prefs = deps.prefs;
    this.#unsubscribe.push(
      this.#connection.onEvent((event) => this.#handleEvent(event)),
      this.#connection.onStateChange((state, info) => this.#handleState(state, info)),
      this.#connection.onProblem((error) => this.#store.getState().reportError(error, CONNECT_TITLE)),
      this.#connection.onReconnected(() => {
        this.#startSession(this.#desired).catch((error: unknown) => {
          this.#abandonSession();
          this.#report(error, CONNECT_TITLE);
        });
      }),
    );
  }

  dispose(): void {
    this.#unsubscribe.forEach((stop) => stop());
    this.#connection.disconnect();
  }

  /** Start-up: resume a saved session ("Save password") or show the login window. Runs once. */
  async boot(): Promise<void> {
    if (this.#booted) return;
    this.#booted = true;
    const state = this.#store.getState();
    try {
      const session = await this.#api.session();
      if (session) {
        state.setSession(session);
        state.openWindow({ kind: 'contactList' });
        await this.goOnline('online');
      } else {
        state.openWindow({ kind: 'login' });
      }
    } catch (error) {
      state.openWindow({ kind: 'login' });
      this.#report(error, CONNECT_TITLE);
    } finally {
      this.#store.getState().setBooting(false);
    }
  }

  /** Signs in over REST, then connects. Failures are reported in an error dialog. */
  async login(body: LoginBody): Promise<LoginOutcome> {
    this.#sounds.unlock();
    let session;
    try {
      session = await this.#api.login(body);
    } catch (error) {
      this.#report(error, 'ICQ Login');
      return error instanceof IcqError && error.code === 'unauthorized' ? 'rejected' : 'failed';
    }
    this.#prefs.rememberUin(session.uin);
    const state = this.#store.getState();
    state.setSession(session);
    state.closeWindowsWhere((w) => w.spec.kind === 'login' || w.spec.kind === 'register');
    state.openWindow({ kind: 'contactList' });
    return (await this.goOnline('online')) ? 'connected' : 'offline';
  }

  /** Creates an account and returns its new ICQ#, or null after reporting the failure. */
  async register(body: RegisterBody): Promise<Uin | null> {
    try {
      const result = await this.#api.register(body);
      this.#prefs.rememberUin(result.uin);
      return result.uin;
    } catch (error) {
      this.#report(error, 'ICQ Registration');
      return null;
    }
  }

  async signOut(): Promise<void> {
    this.#autoAway = null;
    this.#offlineByUser = true;
    this.#connection.disconnect();
    try {
      await this.#api.logout();
    } catch (error) {
      this.#report(error, 'openICQ');
    }
    const state = this.#store.getState();
    state.signedOut();
    state.openWindow({ kind: 'login' });
  }

  /** Any status from the status menu. Offline disconnects; anything else (re)connects. */
  async setStatus(status: Status, awayMessage?: string): Promise<boolean> {
    this.#autoAway = null;
    return this.#applyStatus(status, awayMessage, false);
  }

  /**
   * Connects (if needed) and starts the session. Overlapping calls share one
   * connect + session.start; a later caller's status follows with status.set.
   */
  async goOnline(status: SettableStatus): Promise<boolean> {
    this.#desired = status;
    this.#offlineByUser = false;
    if (this.#starting) {
      const ok = await this.#starting;
      if (!ok || this.#store.getState().status === status) return ok;
      return this.#sendStatus(status, undefined);
    }
    const starting = this.#connectAndStart(status);
    this.#starting = starting;
    try {
      return await starting;
    } finally {
      if (this.#starting === starting) this.#starting = null;
    }
  }

  goOffline(): void {
    this.#autoAway = null;
    this.#offlineByUser = true;
    this.#connection.disconnect();
    this.#store.getState().goneOffline();
  }

  /** Auto-away: called by IdleMonitor. Only an automatic change is undone on activity. */
  handleIdle(level: IdleLevel): void {
    const status = this.#store.getState().status;
    if (level === 'active') {
      const restore = this.#autoAway;
      this.#autoAway = null;
      if (!restore) return;
      if (status === 'offline') {
        // Disconnected meanwhile: the reconnect must come back with the status from before auto-away.
        this.#desired = restore.previous;
        return;
      }
      if (status === 'away' || status === 'na' || this.#autoPending > 0) this.#applyAuto(restore.previous);
      return;
    }
    if (!this.#connection.isOpen) return;
    const manualActive = status === 'online' || status === 'ffc';
    if (level === 'away' && manualActive) {
      this.#autoAway = { previous: status };
      this.#applyAuto('away');
    } else if (level === 'na' && (manualActive || (this.#autoAway && status === 'away'))) {
      this.#autoAway = { previous: this.#autoAway?.previous ?? (status === 'ffc' ? 'ffc' : 'online') };
      this.#applyAuto('na');
    }
  }

  /** Marks the conversation read on the server; locally only the messages that were unread when asked. */
  async markRead(uin: Uin): Promise<void> {
    const state = this.#store.getState();
    const ids = conversationOf(state.chat, uin)
      .messages.filter((m) => m.from === uin && !m.read)
      .map((m) => m.id);
    if (ids.length === 0 || !this.#connection.isOpen) return;
    try {
      await this.#connection.request('message.markRead', { from: uin });
      this.#store.getState().updateChat((chat) => markMessagesRead(chat, uin, ids));
    } catch (error) {
      this.#report(error, 'ICQ Message');
    }
  }

  #applyAuto(status: SettableStatus): void {
    this.#autoPending += 1;
    this.#applyStatus(status, undefined, true)
      .catch((error: unknown) => this.#report(error, CONNECT_TITLE))
      .finally(() => {
        this.#autoPending -= 1;
      });
  }

  async #applyStatus(status: Status, awayMessage: string | undefined, automatic: boolean): Promise<boolean> {
    if (status === 'offline') {
      this.goOffline();
      return true;
    }
    if (!this.#connection.isOpen) {
      const ok = await this.goOnline(status);
      if (!ok || awayMessage === undefined) return ok;
    }
    // An automatic Away is not what the user asked for, so a reconnect keeps the manual status.
    if (!automatic) this.#desired = status;
    return this.#sendStatus(status, awayMessage);
  }

  async #sendStatus(status: SettableStatus, awayMessage: string | undefined): Promise<boolean> {
    const state = this.#store.getState();
    state.setStatusPending(true);
    try {
      const input = awayMessage === undefined ? { status } : { status, awayMessage };
      const result = await this.#connection.request('status.set', input);
      const current = this.#store.getState();
      current.setStatus(result.status);
      if (awayMessage !== undefined && current.settings && hasStatusMessage(status)) {
        current.setSettings({ ...current.settings, awayMessages: { ...current.settings.awayMessages, [status]: awayMessage } });
      }
      return true;
    } catch (error) {
      this.#report(error, CONNECT_TITLE);
      return false;
    } finally {
      this.#store.getState().setStatusPending(false);
    }
  }

  async #connectAndStart(status: SettableStatus): Promise<boolean> {
    const state = this.#store.getState();
    state.setStatusPending(true);
    try {
      const wasOffline = state.status === 'offline';
      if (!this.#connection.isOpen) await this.#connection.connect();
      await this.#startSession(status);
      // Signing on plays "ICQ Startup"; contacts already online at connect stay silent.
      if (wasOffline) this.#playSound('startup');
      return true;
    } catch (error) {
      this.#abandonSession();
      // Choosing Offline (or signing out) while connecting is not a failure worth a dialog.
      const cancelled = this.#offlineByUser && error instanceof IcqError && error.code === 'connection_closed';
      if (!cancelled) this.#report(error, CONNECT_TITLE);
      return false;
    } finally {
      this.#store.getState().setStatusPending(false);
    }
  }

  /** A socket without a started session is useless: close it so the UI and the server agree. */
  #abandonSession(): void {
    if (this.#connection.state !== 'closed' && this.#connection.state !== 'idle') this.#connection.disconnect();
    this.#store.getState().goneOffline();
  }

  async #startSession(status: SettableStatus): Promise<void> {
    const snapshot = await this.#connection.request('session.start', { status });
    this.#store.getState().applySnapshot(snapshot);
  }

  #handleEvent(event: ServerEvent): void {
    const state = this.#store.getState();
    const active = activeWindowId(state.windows);
    const activeSpec = active ? findWindow(state.windows, active)?.spec : undefined;
    const effects = deriveEventEffects(state.chat, event, {
      preferences: state.settings?.preferences ?? null,
      focusedMessageUin: activeSpec?.kind === 'message' ? activeSpec.uin : null,
      ownStatus: state.status,
    });
    state.applyEvent(event);
    effects.forEach((effect) => this.#runEffect(effect));
  }

  #runEffect(effect: EventEffect): void {
    const state = this.#store.getState();
    switch (effect.type) {
      case 'sound':
        this.#playSound(effect.sound);
        return;
      case 'openMessage':
        state.openWindow({ kind: 'message', uin: effect.uin });
        return;
      case 'markRead':
        this.markRead(effect.uin).catch((error: unknown) => this.#report(error, 'ICQ Message'));
        return;
      case 'resolveNickname':
        this.#resolveNickname(effect.uin).catch((error: unknown) => this.#report(error, 'openICQ'));
        return;
      case 'kicked':
        state.openWindow({ kind: 'kicked' });
        return;
    }
  }

  async #resolveNickname(uin: Uin): Promise<void> {
    const { profile } = await this.#connection.request('profile.get', { uin });
    this.#store.getState().updateChat((chat) => ({
      ...chat,
      notInList: chat.notInList.map((e) => (e.uin === uin ? { ...e, nickname: profile.nickname || String(uin) } : e)),
    }));
  }

  #handleState(state: ConnectionState, info: CloseInfo | null): void {
    const store = this.#store.getState();
    store.setConnection(state);
    if (state !== 'closed' || info === null) return;
    if (info.code === CLOSE_CODES.otherLocation) {
      this.#autoAway = null;
      store.goneOffline();
      if (!findWindow(store.windows, 'kicked')) store.openWindow({ kind: 'kicked' });
      return;
    }
    if (info.code === CLOSE_CODES.unauthorized || info.code === CLOSE_CODES.signedOut) {
      this.#autoAway = null;
      store.signedOut();
      store.openWindow({ kind: 'login' });
      const message = info.code === CLOSE_CODES.unauthorized ? 'Your ICQ session has expired. Please connect again.' : 'You were signed out.';
      store.reportError(new IcqError('unauthorized', message, info.code), CONNECT_TITLE);
      return;
    }
    // Lost connection: show everyone offline until the reconnect brings a fresh snapshot.
    store.goneOffline();
  }

  #playSound(name: SoundName): void {
    if (this.#store.getState().settings?.preferences.soundsEnabled ?? true) this.#sounds.play(name);
  }

  #report(error: unknown, title: string): void {
    this.#store.getState().reportError(error, title);
  }
}
