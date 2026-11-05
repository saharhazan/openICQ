/**
 * Signs in and up, keeps the WebSocket session alive, applies server events
 * to the store through the pure reducer and runs their side effects
 * (alerts, typing expiry, sign-out when the session is closed elsewhere).
 */
import { CLOSE_CODES, type LoginBody, type RegisterBody, type ServerEvent } from '@openicq/protocol';
import type { CloseInfo, ConnectionState } from '../net/IcqConnection';
import { IcqError, type ClientErrorCode } from '../net/errors';
import { applyEvent, applySnapshot, setTyping } from '../state/data';
import { chatTitle, messageSummary, userName } from '../state/selectors';
import { isChatOnScreen, type AppStore } from '../state/store';
import { S } from '../strings';
import type { IncomingAlert, SoundOutput } from './Notifier';
import type { Api, Connection } from './ports';

/** How long "is typing" stays without a new typing event (the server allows one every 2 s). */
export const TYPING_TTL_MS = 6_000;

export interface DraftStore {
  loadDrafts(uin: number): Record<number, string>;
}

export interface AlertSink {
  incoming(alert: IncomingAlert): void;
}

export interface SessionDeps {
  api: Api;
  connection: Connection;
  store: AppStore;
  drafts: DraftStore;
  alerts: AlertSink;
  sounds: SoundOutput;
  /** After every session.start (first one and reconnects). */
  onStarted?: () => void;
}

export type SignInResult = { ok: true } | { ok: false; error: string };
export type SignUpResult = { ok: true; uin: number } | { ok: false; error: string; code: ClientErrorCode | null };

export class SessionController {
  readonly #api: Api;
  readonly #connection: Connection;
  readonly #store: AppStore;
  readonly #drafts: DraftStore;
  readonly #alerts: AlertSink;
  readonly #sounds: SoundOutput;
  readonly #onStarted: () => void;
  readonly #unsubscribe: Array<() => void> = [];
  readonly #typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  #booted = false;

  constructor(deps: SessionDeps) {
    this.#api = deps.api;
    this.#connection = deps.connection;
    this.#store = deps.store;
    this.#drafts = deps.drafts;
    this.#alerts = deps.alerts;
    this.#sounds = deps.sounds;
    this.#onStarted = deps.onStarted ?? (() => undefined);
    this.#unsubscribe.push(
      this.#connection.onEvent((event) => this.#handleEvent(event)),
      this.#connection.onStateChange((state, info) => this.#handleState(state, info)),
      this.#connection.onProblem((error) => this.#store.getState().reportError(error)),
      this.#connection.onReconnected(() => {
        this.#startSession().catch((error: unknown) => this.#store.getState().reportError(error));
      }),
    );
  }

  dispose(): void {
    this.#unsubscribe.forEach((stop) => stop());
    this.#typingTimers.forEach((timer) => clearTimeout(timer));
    this.#typingTimers.clear();
    this.#connection.disconnect();
  }

  /** Start-up: resume a kept session, or show the sign-in screen. Runs once. */
  async boot(): Promise<void> {
    if (this.#booted) return;
    this.#booted = true;
    const store = this.#store.getState();
    try {
      const session = await this.#api.session();
      if (!session) {
        store.patch({ phase: 'auth' });
        return;
      }
      await this.#enter();
    } catch (error) {
      this.#store.getState().patch({ phase: 'auth' });
      this.#store.getState().reportError(error);
    }
  }

  /** "Sign in by password". Errors come back for the form to show. */
  async signIn(body: LoginBody): Promise<SignInResult> {
    this.#sounds.unlock();
    try {
      await this.#api.login(body);
    } catch (error) {
      const unauthorized = error instanceof IcqError && (error.code === 'unauthorized' || error.status === 401);
      return { ok: false, error: unauthorized ? S.login.invalid : errorText(error) };
    }
    try {
      await this.#enter();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorText(error) };
    }
  }

  /** Creates the account and signs it in (register sets no cookie); the caller shows the new ICQ number. */
  async signUp(body: RegisterBody): Promise<SignUpResult> {
    this.#sounds.unlock();
    try {
      const { uin } = await this.#api.register(body);
      await this.#api.login({ login: String(uin), password: body.password, keepSignedIn: true });
      return { ok: true, uin };
    } catch (error) {
      // `conflict` means the nickname (or email) is taken; the form shows it on the field.
      return { ok: false, error: errorText(error), code: error instanceof IcqError ? error.code : null };
    }
  }

  /** Connects and starts the session after sign-up; always shows "Introduce yourself". */
  async enterAfterSignUp(): Promise<SignInResult> {
    try {
      await this.#enter(true);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorText(error) };
    }
  }

  finishIntroduce(): void {
    this.#store.getState().patch({ phase: 'main' });
  }

  async signOut(): Promise<void> {
    this.#connection.disconnect();
    try {
      await this.#api.logout();
    } catch (error) {
      this.#store.getState().reportError(error);
    }
    this.#store.getState().signedOut();
  }

  async #enter(introduce = false): Promise<void> {
    if (!this.#connection.isOpen) await this.#connection.connect();
    await this.#startSession();
    const state = this.#store.getState();
    const me = state.data.me;
    const needsName = me !== null && me.firstName.trim() === '';
    state.patch({ phase: introduce || needsName ? 'introduce' : 'main' });
  }

  async #startSession(): Promise<void> {
    const snapshot = await this.#connection.request('session.start', {});
    const state = this.#store.getState();
    const firstStart = state.data.me?.uin !== snapshot.me.uin;
    state.updateData((data) => applySnapshot(data, snapshot));
    if (firstStart) state.patch({ drafts: this.#drafts.loadDrafts(snapshot.me.uin) });
    const selected = this.#store.getState().selectedChatId;
    if (selected !== null && !snapshot.chats.some((c) => c.id === selected)) this.#store.getState().openChat(null);
    this.#onStarted();
  }

  #handleEvent(event: ServerEvent): void {
    const before = this.#store.getState();
    if (event.type === 'message') this.#alertFor(event);
    before.updateData((data) => applyEvent(data, event));
    switch (event.type) {
      case 'typing':
        this.#armTyping(event.chatId, event.uin);
        return;
      case 'message':
        this.#clearTypingTimer(event.message.chatId, event.message.sender);
        return;
      case 'chat.removed': {
        const state = this.#store.getState();
        if (state.selectedChatId === event.chatId) state.openChat(null);
        if (state.sidebar?.kind === 'group' && state.sidebar.chatId === event.chatId) state.patch({ sidebar: null });
        return;
      }
      case 'session.closed':
        if (event.reason === 'closed_remotely') this.#closedElsewhere(S.sessionClosed);
        return;
      default:
        return;
    }
  }

  #alertFor(event: Extract<ServerEvent, { type: 'message' }>): void {
    const state = this.#store.getState();
    const me = state.data.me;
    const { message, chat } = event;
    if (!me || message.sender === me.uin || message.event || chat.muted) return;
    const known = state.data.histories[chat.id]?.messages.some((m) => m.id === message.id) ?? false;
    if (known) return;
    const names = { users: { ...state.data.users, ...Object.fromEntries(event.users.map((u) => [u.uin, u])) }, me };
    this.#alerts.incoming({
      chatId: chat.id,
      title: chatTitle(names, chat),
      sender: chat.type === 'group' ? userName(names, message.sender) : null,
      text: messageSummary(names, message),
      chatOpen: isChatOnScreen(state, chat.id),
    });
  }

  #armTyping(chatId: number, uin: number): void {
    this.#clearTypingTimer(chatId, uin);
    const key = `${chatId}:${uin}`;
    this.#typingTimers.set(
      key,
      setTimeout(() => {
        this.#typingTimers.delete(key);
        this.#store.getState().updateData((data) => setTyping(data, chatId, uin, false));
      }, TYPING_TTL_MS),
    );
  }

  #clearTypingTimer(chatId: number, uin: number): void {
    const key = `${chatId}:${uin}`;
    const timer = this.#typingTimers.get(key);
    if (timer !== undefined) clearTimeout(timer);
    this.#typingTimers.delete(key);
  }

  #handleState(state: ConnectionState, info: CloseInfo | null): void {
    const store = this.#store.getState();
    store.patch({ connection: state });
    if (state !== 'closed' || info === null) return;
    if (info.code === CLOSE_CODES.sessionClosed) this.#closedElsewhere(S.sessionClosed);
    else if (info.code === CLOSE_CODES.unauthorized) this.#closedElsewhere(S.sessionExpired);
    else if (info.code === CLOSE_CODES.signedOut) this.#closedElsewhere(null);
    else if (info.code === CLOSE_CODES.protocolViolation) {
      // No automatic reconnect after this code: say so instead of sitting silently offline.
      store.reportError(new IcqError('connection_closed', S.protocolViolation, info.code));
    }
  }

  /** The server ended this session: back to sign-in, once. */
  #closedElsewhere(message: string | null): void {
    const store = this.#store.getState();
    if (store.phase === 'auth') return;
    this.#connection.disconnect();
    store.signedOut();
    if (message) this.#store.getState().toast(message, 'error');
  }
}

function errorText(error: unknown): string {
  if (error instanceof IcqError && (error.code === 'internal' || error.code === 'invalid_response')) return S.login.error;
  return error instanceof Error && error.message ? error.message : S.login.error;
}
