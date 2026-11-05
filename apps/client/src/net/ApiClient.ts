import {
  API_PATHS,
  httpErrorBodySchema,
  loginBodySchema,
  registerBodySchema,
  registerResultSchema,
  sessionInfoSchema,
  uploadResultSchema,
  type Attachment,
  type FilePurpose,
  type LoginBody,
  type RegisterBody,
  type RegisterResult,
  type SessionInfo,
} from '@openicq/protocol';
import type { z } from 'zod';
import { IcqError } from './errors';

export type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  /** Prefix for every path. Empty means same origin. */
  baseUrl?: string;
  timeoutMs?: number;
  fetchFn?: FetchFn;
}

const DEFAULT_TIMEOUT_MS = 10_000;
/** Uploads may be up to 100 MB. */
const UPLOAD_TIMEOUT_MS = 10 * 60_000;

/** REST calls that exist before the WebSocket: registration, sign-in, session resume, sign-out. */
export class ApiClient {
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #fetch: FetchFn;

  constructor(options: ApiClientOptions = {}) {
    this.#baseUrl = options.baseUrl ?? '';
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#fetch = options.fetchFn ?? ((input, init) => fetch(input, init));
  }

  async register(body: RegisterBody): Promise<RegisterResult> {
    const response = await this.#send('POST', API_PATHS.register, this.#validate(registerBodySchema, body));
    return this.#parse(registerResultSchema, response);
  }

  async login(body: LoginBody): Promise<SessionInfo> {
    const response = await this.#send('POST', API_PATHS.login, this.#validate(loginBodySchema, body));
    return this.#parse(sessionInfoSchema, response);
  }

  async logout(): Promise<void> {
    await this.#send('POST', API_PATHS.logout, {});
  }

  /** The saved session, or null when there is none (401). */
  async session(): Promise<SessionInfo | null> {
    try {
      const response = await this.#send('GET', API_PATHS.session);
      return await this.#parse(sessionInfoSchema, response);
    } catch (error) {
      if (error instanceof IcqError && error.status === 401) return null;
      throw error;
    }
  }

  /** POST /api/files?purpose=..., multipart field `file`. */
  async upload(file: Blob, name: string, purpose: FilePurpose): Promise<Attachment> {
    const form = new FormData();
    form.append('file', file, name);
    const response = await this.#request(`${API_PATHS.files}?purpose=${purpose}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      body: form,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    const result = await this.#parse(uploadResultSchema, response);
    return result.file;
  }

  /** Where a file or avatar is downloaded from (same origin, the session cookie authorises it). */
  fileUrl(fileId: number): string {
    return `${this.#baseUrl}${API_PATHS.files}/${fileId}`;
  }

  #validate<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new IcqError('bad_request', issue ? issue.message : 'Invalid input');
    }
    return parsed.data;
  }

  async #send(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Response> {
    const init: RequestInit = {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(this.#timeoutMs),
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    return this.#request(path, init);
  }

  async #request(path: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await this.#fetch(this.#baseUrl + path, init);
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new IcqError('timeout', 'The server did not answer in time. Please try again.', null, { cause: error });
      }
      throw new IcqError('network', 'Could not reach the ICQ server. Check your connection.', null, { cause: error });
    }
    if (!response.ok) throw await this.#errorFrom(response);
    return response;
  }

  async #errorFrom(response: Response): Promise<IcqError> {
    let body: unknown;
    try {
      body = await this.#readJson(response);
    } catch (error) {
      return new IcqError('invalid_response', `Server error ${response.status}`, response.status, { cause: error });
    }
    const parsed = httpErrorBodySchema.safeParse(body);
    if (parsed.success) return new IcqError(parsed.data.error.code, parsed.data.error.message, response.status);
    return new IcqError(response.status === 401 ? 'unauthorized' : 'internal', `Server error ${response.status}`, response.status);
  }

  async #parse<S extends z.ZodType>(schema: S, response: Response): Promise<z.output<S>> {
    const body = await this.#readJson(response);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new IcqError('invalid_response', 'The server sent an unexpected answer.', response.status, { cause: parsed.error });
    }
    return parsed.data;
  }

  async #readJson(response: Response): Promise<unknown> {
    const text = await response.text();
    if (text === '') return null;
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw new IcqError('invalid_response', 'The server sent an unreadable answer.', response.status, { cause: error });
    }
  }
}
