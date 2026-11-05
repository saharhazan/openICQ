import {
  CLOSE_CODES,
  requestPayloadSchemas,
  requestResultSchemas,
  serverFrameSchema,
  type RequestInput,
  type RequestResult,
  type RequestType,
  type ServerEvent,
} from '@openicq/protocol';
import type { z } from 'zod';
import { IcqError } from './errors';

/** The part of the browser WebSocket this class uses, so tests can pass a fake. */
export interface SocketLike {
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type SocketFactory = (url: string) => SocketLike;

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface CloseInfo {
  code: number;
  reason: string;
  willReconnect: boolean;
}

export interface IcqConnectionOptions {
  url: string;
  socketFactory?: SocketFactory;
  requestTimeoutMs?: number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
}

interface OpeningSocket {
  isReconnect: boolean;
  promise: Promise<void>;
  /** Drops the socket that is still opening and rejects its promise. */
  abort: (error: IcqError) => void;
}

interface PendingRequest {
  type: RequestType;
  resolve: (value: unknown) => void;
  reject: (error: IcqError) => void;
  timer: ReturnType<typeof setTimeout>;
}

const SOCKET_OPEN = 1;
const NORMAL_CLOSE = 1000;
/** After these close codes the server does not want us back without a new sign-in. */
const NO_RECONNECT_CODES: ReadonlySet<number> = new Set([
  CLOSE_CODES.unauthorized,
  CLOSE_CODES.otherLocation,
  CLOSE_CODES.signedOut,
]);

/** Builds the same-origin WebSocket URL for a path such as WS_PATH. */
export function sameOriginSocketUrl(path: string, location: Pick<Location, 'protocol' | 'host'> = window.location): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}${path}`;
}

/**
 * One WebSocket to the ICQ server with typed request/response correlation,
 * validation of every incoming frame, push events and automatic reconnect.
 */
export class IcqConnection {
  readonly #url: string;
  readonly #factory: SocketFactory;
  readonly #requestTimeoutMs: number;
  readonly #reconnectBaseMs: number;
  readonly #reconnectMaxMs: number;

  #socket: SocketLike | null = null;
  #opening: OpeningSocket | null = null;
  #state: ConnectionState = 'idle';
  #nextId = 1;
  #intentionalClose = false;
  #reconnectAttempt = 0;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  readonly #pending = new Map<string, PendingRequest>();
  readonly #eventListeners = new Set<(event: ServerEvent) => void>();
  readonly #stateListeners = new Set<(state: ConnectionState, info: CloseInfo | null) => void>();
  readonly #problemListeners = new Set<(error: IcqError) => void>();
  readonly #reconnectListeners = new Set<() => void>();

  constructor(options: IcqConnectionOptions) {
    this.#url = options.url;
    this.#factory = options.socketFactory ?? ((url) => new WebSocket(url));
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
    this.#reconnectBaseMs = options.reconnectBaseMs ?? 1_000;
    this.#reconnectMaxMs = options.reconnectMaxMs ?? 30_000;
  }

  get state(): ConnectionState {
    return this.#state;
  }

  get isOpen(): boolean {
    return this.#state === 'open';
  }

  /** Opens the socket. Rejects when it closes before opening; the first connect never retries on its own. */
  connect(): Promise<void> {
    if (this.#state === 'open') return Promise.resolve();
    if (this.#opening && !this.#opening.isReconnect) return this.#opening.promise;
    // A manual connect replaces an automatic attempt that is still in flight.
    this.#opening?.abort(new IcqError('network', 'Reconnect attempt replaced by a new connection.'));
    this.#intentionalClose = false;
    this.#clearReconnectTimer();
    this.#reconnectAttempt = 0;
    return this.#open(false);
  }

  /** Closes on purpose: pending requests fail and no reconnect is scheduled. */
  disconnect(): void {
    this.#intentionalClose = true;
    this.#clearReconnectTimer();
    this.#opening?.abort(new IcqError('connection_closed', 'Disconnected from the ICQ server.'));
    const socket = this.#socket;
    this.#socket = null;
    if (socket) socket.close(NORMAL_CLOSE, 'Client disconnect');
    this.#failPending(new IcqError('connection_closed', 'Disconnected from the ICQ server.'));
    this.#setState('closed', { code: NORMAL_CLOSE, reason: 'Client disconnect', willReconnect: false });
  }

  request<T extends RequestType>(type: T, input: RequestInput<T>): Promise<RequestResult<T>> {
    const socket = this.#socket;
    if (!socket || this.#state !== 'open' || socket.readyState !== SOCKET_OPEN) {
      return Promise.reject(new IcqError('not_connected', 'You are not connected to the ICQ network.'));
    }
    const payloadSchema: z.ZodType = requestPayloadSchemas[type];
    const payload = payloadSchema.safeParse(input);
    if (!payload.success) {
      const issue = payload.error.issues[0];
      return Promise.reject(new IcqError('bad_request', issue ? issue.message : 'Invalid request', null, { cause: payload.error }));
    }
    const id = `c${this.#nextId++}`;
    return new Promise<RequestResult<T>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new IcqError('timeout', 'The ICQ server did not answer in time.'));
      }, this.#requestTimeoutMs);
      this.#pending.set(id, {
        type,
        // Safe: #handleResult only resolves after parsing with requestResultSchemas[type].
        resolve: (value) => resolve(value as RequestResult<T>),
        reject,
        timer,
      });
      try {
        socket.send(JSON.stringify({ id, type, payload: payload.data }));
      } catch (error) {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(new IcqError('network', 'Could not send to the ICQ server.', null, { cause: error }));
      }
    });
  }

  onEvent(listener: (event: ServerEvent) => void): () => void {
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }

  onStateChange(listener: (state: ConnectionState, info: CloseInfo | null) => void): () => void {
    this.#stateListeners.add(listener);
    return () => this.#stateListeners.delete(listener);
  }

  /** Invalid frames and server errors that answer no request. */
  onProblem(listener: (error: IcqError) => void): () => void {
    this.#problemListeners.add(listener);
    return () => this.#problemListeners.delete(listener);
  }

  /** Fires after an automatic reconnect opened a new socket (the server expects session.start again). */
  onReconnected(listener: () => void): () => void {
    this.#reconnectListeners.add(listener);
    return () => this.#reconnectListeners.delete(listener);
  }

  #open(isReconnect: boolean): Promise<void> {
    this.#setState(isReconnect ? 'reconnecting' : 'connecting', null);
    let socket: SocketLike;
    try {
      socket = this.#factory(this.#url);
    } catch (error) {
      const failure = new IcqError('network', 'Could not open a connection to the ICQ server.', null, { cause: error });
      this.#setState('closed', { code: 0, reason: failure.message, willReconnect: false });
      return Promise.reject(failure);
    }
    this.#socket = socket;
    let opened = false;
    let settle: { resolve: () => void; reject: (error: IcqError) => void } | null = null;
    const promise = new Promise<void>((resolve, reject) => {
      settle = { resolve, reject };
    });
    const opening: OpeningSocket = {
      isReconnect,
      promise,
      abort: (error) => {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.close(NORMAL_CLOSE, 'Superseded');
        if (this.#socket === socket) this.#socket = null;
        if (this.#opening === opening) this.#opening = null;
        settle?.reject(error);
      },
    };
    this.#opening = opening;
    socket.onopen = () => {
      if (socket !== this.#socket) return;
      opened = true;
      this.#opening = null;
      this.#reconnectAttempt = 0;
      this.#setState('open', null);
      settle?.resolve();
      if (isReconnect) this.#reconnectListeners.forEach((listener) => listener());
    };
    socket.onmessage = (event) => {
      if (socket === this.#socket) this.#handleMessage(event.data);
    };
    // The close event that follows carries the details; an error alone changes nothing.
    socket.onerror = () => undefined;
    socket.onclose = (event) => {
      if (socket !== this.#socket) return;
      this.#socket = null;
      if (this.#opening === opening) this.#opening = null;
      this.#failPending(new IcqError('connection_closed', 'The connection to the ICQ server was lost.', event.code));
      const retry = !this.#intentionalClose && !NO_RECONNECT_CODES.has(event.code) && (opened || isReconnect);
      this.#setState('closed', { code: event.code, reason: event.reason, willReconnect: retry });
      if (!opened) settle?.reject(new IcqError('network', 'Could not connect to the ICQ server.', event.code));
      if (retry) this.#scheduleReconnect();
    };
    return promise;
  }

  #scheduleReconnect(): void {
    const delay = Math.min(this.#reconnectMaxMs, this.#reconnectBaseMs * 2 ** this.#reconnectAttempt);
    this.#reconnectAttempt += 1;
    this.#setState('reconnecting', null);
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      // A failed attempt closes the socket, and the close handler schedules the next one.
      this.#open(true).catch((error: unknown) => this.#reportReconnectFailure(error));
    }, delay);
  }

  #reportReconnectFailure(error: unknown): void {
    // Expected while the server is unreachable, or when the user disconnected on purpose meanwhile.
    if (error instanceof IcqError && (error.code === 'network' || error.code === 'connection_closed')) return;
    this.#emitProblem(error instanceof IcqError ? error : new IcqError('network', String(error)));
  }

  #clearReconnectTimer(): void {
    if (this.#reconnectTimer !== null) clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
  }

  #handleMessage(data: unknown): void {
    if (typeof data !== 'string') {
      this.#emitProblem(new IcqError('invalid_response', 'The server sent a frame that is not text.'));
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch (error) {
      this.#emitProblem(new IcqError('invalid_response', 'The server sent an unreadable frame.', null, { cause: error }));
      return;
    }
    const frame = serverFrameSchema.safeParse(json);
    if (!frame.success) {
      this.#emitProblem(new IcqError('invalid_response', 'The server sent an invalid frame.', null, { cause: frame.error }));
      return;
    }
    const value = frame.data;
    if (value.kind === 'event') {
      this.#eventListeners.forEach((listener) => listener(value.event));
      return;
    }
    const pending = value.replyTo === null ? undefined : this.#pending.get(value.replyTo);
    if (value.kind === 'error') {
      const error = new IcqError(value.error.code, value.error.message);
      if (pending && value.replyTo !== null) this.#settle(value.replyTo, pending, () => pending.reject(error));
      else this.#emitProblem(error);
      return;
    }
    // A reply after its timeout: the caller already received the timeout error.
    if (!pending) return;
    const resultSchema: z.ZodType = requestResultSchemas[pending.type];
    const result = resultSchema.safeParse(value.result);
    this.#settle(value.replyTo, pending, () => {
      if (result.success) pending.resolve(result.data);
      else pending.reject(new IcqError('invalid_response', `The server sent an invalid answer to ${pending.type}.`, null, { cause: result.error }));
    });
  }

  #settle(id: string, pending: PendingRequest, finish: () => void): void {
    clearTimeout(pending.timer);
    this.#pending.delete(id);
    finish();
  }

  #failPending(error: IcqError): void {
    const entries = [...this.#pending.entries()];
    this.#pending.clear();
    for (const [, pending] of entries) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }

  #emitProblem(error: IcqError): void {
    this.#problemListeners.forEach((listener) => listener(error));
  }

  #setState(state: ConnectionState, info: CloseInfo | null): void {
    this.#state = state;
    this.#stateListeners.forEach((listener) => listener(state, info));
  }
}
