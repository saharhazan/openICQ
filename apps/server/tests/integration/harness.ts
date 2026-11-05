/**
 * Integration harness: a real server on a random port with an in-memory
 * database and a temporary files directory, HTTP through `inject`, and real
 * `ws` clients that validate every server frame against the protocol.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  API_PATHS,
  SESSION_COOKIE,
  WS_PATH,
  registerResultSchema,
  requestResultSchemas,
  serverFrameSchema,
  uploadResultSchema,
  type Attachment,
  type ErrorCode,
  type FilePurpose,
  type ProtocolError,
  type RegisterBody,
  type RequestInput,
  type RequestResult,
  type RequestType,
  type ServerEvent,
  type ServerEventType,
  type ServerFrame,
  type SessionSnapshot,
  type Uin,
} from '@openicq/protocol';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import WebSocket, { type RawData } from 'ws';
import { z } from 'zod';
import { composeApp, type ComposeOptions } from '../../src/composition.ts';
import { loadConfig, type Config } from '../../src/config.ts';
import type { LogStream } from '../../src/transport/app.ts';

export const ORIGIN = 'http://127.0.0.1:5173';
export const PASSWORD = 'secret123';
export const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const WAIT_MS = 2000;
/** How long `expectNoEvent` listens before concluding nothing came. */
export const QUIET_MS = 150;

export type EventOf<K extends ServerEventType> = Extract<ServerEvent, { type: K }>;
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
  /** Every frame in arrival order, for ordering assertions. */
  readonly log: ServerFrame[] = [];
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

  sendRaw(data: string | Buffer): void {
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

  /** Takes the oldest queued event of this type (matching `where`), waiting for it if needed. */
  nextEvent<K extends ServerEventType>(type: K, where: (event: EventOf<K>) => boolean = () => true): Promise<EventOf<K>> {
    return this.waitFor(`a ${type} event`, () => {
      const index = this.events.findIndex((event) => event.type === type && where(event as EventOf<K>));
      if (index < 0) return undefined;
      const [event] = this.events.splice(index, 1);
      // findIndex matched `type`, so the removed event is the EventOf<K> member of the union.
      return event as EventOf<K>;
    });
  }

  /** Fails if an event of this type arrives (or is already queued) within QUIET_MS. */
  async expectNoEvent(type: ServerEventType): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, QUIET_MS));
    const found = this.events.find((event) => event.type === type);
    if (found !== undefined) throw new Error(`Unexpected ${type} event: ${JSON.stringify(found)}`);
  }

  /** Drops queued events, so later assertions only see new ones. */
  clearEvents(): void {
    this.events.length = 0;
  }

  close(): void {
    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
      this.socket.close(1000);
    }
  }

  private receive(text: string): void {
    const frame = serverFrameSchema.parse(JSON.parse(text));
    this.log.push(frame);
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
  readonly firstName: string;
  readonly cookie: string;
}

export interface Connected {
  readonly client: WsClient;
  readonly snapshot: SessionSnapshot;
}

const logLineSchema = z.record(z.string(), z.unknown());

/** Collects the server's JSON log lines; start the server with `logLevel: 'warn'` (or lower) to see them. */
export class LogCapture implements LogStream {
  readonly raw: string[] = [];
  readonly entries: Record<string, unknown>[] = [];

  write(line: string): void {
    this.raw.push(line);
    this.entries.push(logLineSchema.parse(JSON.parse(line)));
  }

  withMessage(msg: string): Record<string, unknown>[] {
    return this.entries.filter((entry) => entry.msg === msg);
  }
}

/** Polls until `check` holds; for effects that land after the reply (background jobs). */
export async function eventually(check: () => boolean, what: string, timeoutMs = WAIT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting until ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

export interface UploadOptions {
  readonly name?: string;
  readonly mime?: string;
  readonly purpose?: FilePurpose | string;
  readonly field?: string;
  readonly origin?: string | null;
}

/** A multipart/form-data body with one file part. */
export function multipartBody(field: string, name: string, mime: string, content: Buffer): { body: Buffer; type: string } {
  const boundary = `----openicq${Math.random().toString(16).slice(2)}`;
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`;
  return {
    body: Buffer.concat([Buffer.from(head, 'utf8'), content, Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')]),
    type: `multipart/form-data; boundary=${boundary}`,
  };
}

export class TestServer {
  readonly app: FastifyInstance;
  readonly wsUrl: string;
  readonly filesDir: string;
  private readonly clients: WsClient[] = [];
  private registrations = 0;

  private constructor(app: FastifyInstance, wsUrl: string, filesDir: string) {
    this.app = app;
    this.wsUrl = wsUrl;
    this.filesDir = filesDir;
  }

  static async start(overrides: Partial<Config> = {}, options: ComposeOptions = {}): Promise<TestServer> {
    const filesDir = mkdtempSync(join(tmpdir(), 'openicq-test-files-'));
    const base = loadConfig({
      DATABASE_PATH: ':memory:',
      FILES_DIR: filesDir,
      // TEST_LOG_LEVEL=warn shows server-side warnings and errors while the tests run.
      LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? 'silent',
      CLIENT_DIST_DIR: '/nonexistent/openicq-client-dist',
    });
    try {
      const app = await composeApp({ ...base, ...overrides }, options);
      await app.listen({ port: 0, host: '127.0.0.1' });
      const { port } = app.server.address() as AddressInfo;
      return new TestServer(app, `ws://127.0.0.1:${port}${WS_PATH}`, filesDir);
    } catch (error) {
      rmSync(filesDir, { recursive: true, force: true });
      throw error;
    }
  }

  async stop(): Promise<void> {
    for (const client of this.clients) client.close();
    await this.app.close();
    rmSync(this.filesDir, { recursive: true, force: true });
  }

  /** Registers from a fresh address each time, so the per-IP registration limit only bites where a test wants it. */
  async register(body: RegisterBody): Promise<Uin> {
    this.registrations += 1;
    const response = await this.app.inject({
      method: 'POST',
      url: API_PATHS.register,
      headers: { origin: ORIGIN },
      remoteAddress: `10.0.${Math.floor(this.registrations / 250)}.${(this.registrations % 250) + 1}`,
      payload: body,
    });
    if (response.statusCode !== 201) throw new Error(`register failed: ${response.statusCode} ${response.body}`);
    return registerResultSchema.parse(response.json()).uin;
  }

  loginResponse(login: string, password = PASSWORD, keepSignedIn = true, userAgent = CHROME_MAC): Promise<LightMyRequestResponse> {
    return this.app.inject({
      method: 'POST',
      url: API_PATHS.login,
      headers: { origin: ORIGIN, 'user-agent': userAgent },
      payload: { login, password, keepSignedIn },
    });
  }

  /** Signs in and returns the Cookie header value for later requests. */
  async login(login: string | Uin, password = PASSWORD, keepSignedIn = true, userAgent = CHROME_MAC): Promise<string> {
    const response = await this.loginResponse(String(login), password, keepSignedIn, userAgent);
    if (response.statusCode !== 200) throw new Error(`login failed: ${response.statusCode} ${response.body}`);
    const cookie = response.cookies.find((entry) => entry.name === SESSION_COOKIE);
    if (cookie === undefined) throw new Error('login did not set the session cookie');
    return `${SESSION_COOKIE}=${cookie.value}`;
  }

  async createUser(firstName: string, extra: Partial<RegisterBody> = {}): Promise<TestUser> {
    const uin = await this.register({ firstName, password: PASSWORD, ...extra });
    return { uin, firstName, cookie: await this.login(uin) };
  }

  async open(options: OpenOptions = {}): Promise<WsClient> {
    const client = await WsClient.open(this.wsUrl, options);
    this.clients.push(client);
    return client;
  }

  /** Opens a socket for the user (or a cookie of theirs) and sends `session.start`. */
  async connect(user: TestUser | string): Promise<Connected> {
    const cookie = typeof user === 'string' ? user : user.cookie;
    const client = await this.open({ cookie });
    const snapshot = await client.request('session.start', {});
    return { client, snapshot };
  }

  uploadResponse(cookie: string | null, content: Buffer, options: UploadOptions = {}): Promise<LightMyRequestResponse> {
    const { body, type } = multipartBody(options.field ?? 'file', options.name ?? 'file.bin', options.mime ?? 'application/octet-stream', content);
    const headers: Record<string, string> = { 'content-type': type };
    const origin = options.origin === undefined ? ORIGIN : options.origin;
    if (origin !== null) headers.origin = origin;
    if (cookie !== null) headers.cookie = cookie;
    return this.app.inject({
      method: 'POST',
      url: `${API_PATHS.files}?purpose=${options.purpose ?? 'attachment'}`,
      headers,
      payload: body,
    });
  }

  async upload(cookie: string, content: Buffer, options: UploadOptions = {}): Promise<Attachment> {
    const response = await this.uploadResponse(cookie, content, options);
    if (response.statusCode !== 201) throw new Error(`upload failed: ${response.statusCode} ${response.body}`);
    return uploadResultSchema.parse(response.json()).file;
  }

  download(cookie: string | null, fileId: number): Promise<LightMyRequestResponse> {
    return this.app.inject({
      method: 'GET',
      url: `${API_PATHS.files}/${fileId}`,
      headers: cookie === null ? {} : { cookie },
    });
  }
}

/** A 1x1 PNG. */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
/** A 3x2 GIF. */
export const GIF_3X2 = Buffer.from('R0lGODlhAwACAIAAAP///wAAACH5BAAAAAAALAAAAAADAAIAAAIDhI8FADs=', 'base64');
