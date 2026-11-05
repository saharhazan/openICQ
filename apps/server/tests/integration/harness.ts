/**
 * Integration harness: a real server on a random port with an in-memory
 * database, HTTP through `inject`, and real `ws` clients that validate every
 * server frame against the protocol.
 */
import type { AddressInfo } from 'node:net';
import {
  API_PATHS,
  SESSION_COOKIE,
  WS_PATH,
  registerResultSchema,
  requestResultSchemas,
  serverFrameSchema,
  type ErrorCode,
  type ProtocolError,
  type RegisterBody,
  type RequestInput,
  type RequestResult,
  type RequestType,
  type ServerEvent,
  type ServerEventOf,
  type ServerEventType,
  type ServerFrame,
  type SessionSnapshot,
  type SettableStatus,
  type Uin,
} from '@openicq/protocol';
import type { FastifyInstance } from 'fastify';
import WebSocket, { type RawData } from 'ws';
import { composeApp, type ComposeOptions } from '../../src/composition.ts';
import { loadConfig, type Config } from '../../src/config.ts';

export const ORIGIN = 'http://127.0.0.1:5173';
export const PASSWORD = 'secret123';
const WAIT_MS = 2000;

type ReplyFrame = Exclude<ServerFrame, { kind: 'event' }>;

export interface CloseInfo {
  readonly code: number;
  readonly reason: string;
}

export class RequestFailed extends Error {
  readonly code: ErrorCode;

  constructor(error: ProtocolError) {
    super(`${error.code}: ${error.message}`);
    this.code = error.code;
  }
}

function rawToString(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}

export interface OpenOptions {
  readonly cookie?: string;
  /** null sends no Origin header. */
  readonly origin?: string | null;
  /** false simulates a dead peer that never answers pings. */
  readonly autoPong?: boolean;
}

export class WsClient {
  readonly closed: Promise<CloseInfo>;
  private readonly socket: WebSocket;
  private readonly pending = new Map<string, (frame: ReplyFrame) => void>();
  private readonly events: ServerEvent[] = [];
  private readonly orphanErrors: ReplyFrame[] = [];
  private readonly waiters = new Set<() => void>();
  private nextId = 1;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    this.closed = new Promise((resolve) => {
      socket.once('close', (code, reason) => resolve({ code, reason: reason.toString() }));
    });
    socket.on('message', (data) => this.receive(rawToString(data)));
  }

  static open(url: string, options: OpenOptions = {}): Promise<WsClient> {
    const headers: Record<string, string> = {};
    if (options.cookie !== undefined) headers.cookie = options.cookie;
    const origin = options.origin === undefined ? ORIGIN : options.origin;
    const autoPong = options.autoPong ?? true;
    const socket = new WebSocket(url, origin === null ? { headers, autoPong } : { headers, origin, autoPong });
    const client = new WsClient(socket);
    return new Promise((resolve, reject) => {
      socket.once('open', () => resolve(client));
      socket.once('error', reject);
    });
  }

  sendRaw(data: string): void {
    this.socket.send(data);
  }

  /** Sends a frame and resolves with the `result` or `error` that answers it. */
  requestFrame(type: string, payload: unknown): Promise<ReplyFrame> {
    const id = `r${this.nextId++}`;
    const reply = new Promise<ReplyFrame>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No reply to ${type} within ${WAIT_MS}ms`)), WAIT_MS);
      this.pending.set(id, (frame) => {
        clearTimeout(timer);
        resolve(frame);
      });
    });
    this.socket.send(JSON.stringify({ id, type, payload }));
    return reply;
  }

  async request<T extends RequestType>(type: T, payload: RequestInput<T>): Promise<RequestResult<T>> {
    const frame = await this.requestFrame(type, payload);
    if (frame.kind === 'error') throw new RequestFailed(frame.error);
    // The result schema for `type` describes RequestResult<T>; TypeScript cannot correlate the generic index.
    return requestResultSchemas[type].parse(frame.result) as RequestResult<T>;
  }

  /** Sends a request that must fail and returns its error. */
  async requestError(type: string, payload: unknown): Promise<ProtocolError> {
    const frame = await this.requestFrame(type, payload);
    if (frame.kind !== 'error') throw new Error(`Expected ${type} to fail, got ${JSON.stringify(frame)}`);
    return frame.error;
  }

  /** The next error frame that answers no request (`replyTo: null`). */
  nextOrphanError(): Promise<ReplyFrame> {
    return this.waitFor('an error frame without replyTo', () => this.orphanErrors.shift());
  }

  /** Takes the oldest queued event of this type, waiting for it if needed. */
  nextEvent<K extends ServerEventType>(type: K): Promise<ServerEventOf<K>> {
    return this.waitFor(`a ${type} event`, () => {
      const index = this.events.findIndex((event) => event.type === type);
      if (index < 0) return undefined;
      const [event] = this.events.splice(index, 1);
      // findIndex matched on `type`, so the event is the K variant.
      return event as ServerEventOf<K>;
    });
  }

  /** Waits a moment and asserts that no event of this type arrived. */
  async expectNoEvent(type: ServerEventType, ms = 250): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
    const found = this.events.filter((event) => event.type === type);
    if (found.length > 0) throw new Error(`Unexpected ${type} events: ${JSON.stringify(found)}`);
  }

  close(): void {
    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
      this.socket.close(1000);
    }
  }

  private receive(text: string): void {
    const frame = serverFrameSchema.parse(JSON.parse(text));
    if (frame.kind === 'event') {
      this.events.push(frame.event);
    } else if (frame.replyTo === null) {
      this.orphanErrors.push(frame);
    } else {
      const resolve = this.pending.get(frame.replyTo);
      if (resolve === undefined) throw new Error(`Reply to unknown request ${frame.replyTo}`);
      this.pending.delete(frame.replyTo);
      resolve(frame);
    }
    for (const wake of [...this.waiters]) wake();
  }

  private waitFor<T>(what: string, take: () => T | undefined): Promise<T> {
    const immediate = take();
    if (immediate !== undefined) return Promise.resolve(immediate);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(check);
        reject(new Error(`Timed out waiting for ${what}`));
      }, WAIT_MS);
      const check = (): void => {
        const value = take();
        if (value === undefined) return;
        clearTimeout(timer);
        this.waiters.delete(check);
        resolve(value);
      };
      this.waiters.add(check);
    });
  }
}

export interface TestUser {
  readonly uin: Uin;
  readonly nickname: string;
  readonly cookie: string;
}

export class TestServer {
  readonly app: FastifyInstance;
  readonly wsUrl: string;
  private readonly clients: WsClient[] = [];

  private constructor(app: FastifyInstance, wsUrl: string) {
    this.app = app;
    this.wsUrl = wsUrl;
  }

  static async start(overrides: Partial<Config> = {}, options: ComposeOptions = {}): Promise<TestServer> {
    const base = loadConfig({
      DATABASE_PATH: ':memory:',
      // TEST_LOG_LEVEL=warn shows server-side warnings and errors while the tests run.
      LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? 'silent',
      CLIENT_DIST_DIR: '/nonexistent/icq-client-dist',
    });
    const app = await composeApp({ ...base, ...overrides }, options);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;
    return new TestServer(app, `ws://127.0.0.1:${port}${WS_PATH}`);
  }

  async stop(): Promise<void> {
    for (const client of this.clients) client.close();
    await this.app.close();
  }

  async register(body: RegisterBody): Promise<Uin> {
    const response = await this.app.inject({
      method: 'POST',
      url: API_PATHS.register,
      headers: { origin: ORIGIN },
      payload: body,
    });
    if (response.statusCode !== 201) throw new Error(`register failed: ${response.statusCode} ${response.body}`);
    return registerResultSchema.parse(response.json()).uin;
  }

  /** Signs in and returns the Cookie header value for later requests. */
  async login(uin: Uin, password = PASSWORD, remember = false): Promise<string> {
    const response = await this.app.inject({
      method: 'POST',
      url: API_PATHS.login,
      headers: { origin: ORIGIN },
      payload: { uin, password, remember },
    });
    if (response.statusCode !== 200) throw new Error(`login failed: ${response.statusCode} ${response.body}`);
    const cookie = response.cookies.find((entry) => entry.name === SESSION_COOKIE);
    if (cookie === undefined) throw new Error('login did not set the session cookie');
    return `${SESSION_COOKIE}=${cookie.value}`;
  }

  async createUser(nickname: string, extra: Partial<RegisterBody> = {}): Promise<TestUser> {
    const uin = await this.register({ nickname, password: PASSWORD, authRequired: false, ...extra });
    return { uin, nickname, cookie: await this.login(uin) };
  }

  async open(options: OpenOptions = {}): Promise<WsClient> {
    const client = await WsClient.open(this.wsUrl, options);
    this.clients.push(client);
    return client;
  }

  /** Opens a socket for the user and sends `session.start`. */
  async connect(user: TestUser, status: SettableStatus = 'online'): Promise<{ client: WsClient; snapshot: SessionSnapshot }> {
    const client = await this.open({ cookie: user.cookie });
    const snapshot = await client.request('session.start', { status });
    return { client, snapshot };
  }
}
