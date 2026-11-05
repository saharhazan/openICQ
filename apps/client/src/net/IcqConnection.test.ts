import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IcqError } from './errors';
import { IcqConnection, sameOriginSocketUrl, type SocketLike } from './IcqConnection';

class FakeSocket implements SocketLike {
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readonly sent: Array<{ id: string; type: string; payload: unknown }> = [];
  closedWith: number | null = null;

  readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as { id: string; type: string; payload: unknown });
  }

  close(code = 1000): void {
    this.closedWith = code;
    this.readyState = 3;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  receive(frame: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data: typeof frame === 'string' ? frame : JSON.stringify(frame) }));
  }

  drop(code: number): void {
    this.readyState = 3;
    this.onclose?.(new CloseEvent('close', { code, reason: '' }));
  }

  lastId(): string {
    const last = this.sent.at(-1);
    if (!last) throw new Error('nothing sent');
    return last.id;
  }
}

function setup() {
  const sockets: FakeSocket[] = [];
  const connection = new IcqConnection({
    url: 'ws://test/ws',
    socketFactory: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    requestTimeoutMs: 1_000,
    reconnectBaseMs: 100,
    reconnectMaxMs: 400,
  });
  const latest = () => {
    const socket = sockets.at(-1);
    if (!socket) throw new Error('no socket');
    return socket;
  };
  return { connection, sockets, latest };
}

async function connected() {
  const ctx = setup();
  const opened = ctx.connection.connect();
  ctx.latest().open();
  await opened;
  return ctx;
}

describe('IcqConnection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds a same-origin ws or wss URL', () => {
    expect(sameOriginSocketUrl('/ws', { protocol: 'http:', host: '127.0.0.1:5173' })).toBe('ws://127.0.0.1:5173/ws');
    expect(sameOriginSocketUrl('/ws', { protocol: 'https:', host: 'icq.example' })).toBe('wss://icq.example/ws');
  });

  it('correlates a result with its request and validates it', async () => {
    const { connection, latest } = await connected();
    const pending = connection.request('ping', {});
    const socket = latest();
    expect(socket.sent[0]).toMatchObject({ type: 'ping', payload: {} });
    socket.receive({ kind: 'result', replyTo: 'unrelated', result: {} });
    socket.receive({ kind: 'result', replyTo: socket.lastId(), result: { serverTime: 'now' } });
    await expect(pending).resolves.toEqual({ serverTime: 'now' });
  });

  it('keeps concurrent requests apart', async () => {
    const { connection, latest } = await connected();
    const first = connection.request('nickname.check', { nickname: 'first.one' });
    const second = connection.request('nickname.check', { nickname: 'second.one' });
    const [a, b] = latest().sent;
    latest().receive({ kind: 'result', replyTo: b?.id, result: { available: false, reason: 'taken' } });
    latest().receive({ kind: 'result', replyTo: a?.id, result: { available: true, reason: null } });
    await expect(first).resolves.toEqual({ available: true, reason: null });
    await expect(second).resolves.toEqual({ available: false, reason: 'taken' });
  });

  it('rejects with the server error code', async () => {
    const { connection, latest } = await connected();
    const pending = connection.request('contact.remove', { uin: 123456 });
    latest().receive({ kind: 'error', replyTo: latest().lastId(), error: { code: 'not_found', message: 'No such user' } });
    await expect(pending).rejects.toMatchObject({ code: 'not_found', message: 'No such user' });
  });

  it('rejects a result that does not match the result schema', async () => {
    const { connection, latest } = await connected();
    const pending = connection.request('ping', {});
    latest().receive({ kind: 'result', replyTo: latest().lastId(), result: { wrong: true } });
    await expect(pending).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('reports invalid frames instead of acting on them', async () => {
    const { connection, latest } = await connected();
    const problems: IcqError[] = [];
    const events: unknown[] = [];
    connection.onProblem((e) => problems.push(e));
    connection.onEvent((e) => events.push(e));
    latest().receive('not json');
    latest().receive({ kind: 'event', event: { type: 'presence', uin: 'abc', presence: { online: true, lastSeen: null } } });
    latest().receive({ kind: 'mystery' });
    expect(problems.map((p) => p.code)).toEqual(['invalid_response', 'invalid_response', 'invalid_response']);
    expect(events).toEqual([]);
  });

  it('delivers valid events to subscribers', async () => {
    const { connection, latest } = await connected();
    const events: unknown[] = [];
    connection.onEvent((e) => events.push(e));
    const event = { type: 'presence', uin: 123456, presence: { online: false, lastSeen: '2026-11-05T10:00:00.000Z' } };
    latest().receive({ kind: 'event', event });
    expect(events).toEqual([event]);
  });

  it('times out a request that gets no answer', async () => {
    const { connection } = await connected();
    const pending = connection.request('ping', {});
    const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
  });

  it('validates the payload before sending', async () => {
    const { connection, latest } = await connected();
    await expect(connection.request('message.send', { chatId: 5, clientId: '', text: 'hi' })).rejects.toMatchObject({ code: 'bad_request' });
    expect(latest().sent).toHaveLength(0);
  });

  it('refuses requests while not connected', async () => {
    const { connection } = setup();
    await expect(connection.request('ping', {})).rejects.toMatchObject({ code: 'not_connected' });
  });

  it('fails pending requests and reconnects with exponential backoff after an unexpected close', async () => {
    const { connection, sockets, latest } = await connected();
    const reconnected = vi.fn();
    connection.onReconnected(reconnected);
    const pending = connection.request('ping', {});
    latest().drop(1006);
    await expect(pending).rejects.toMatchObject({ code: 'connection_closed' });
    expect(connection.state).toBe('reconnecting');

    await vi.advanceTimersByTimeAsync(99);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);
    latest().drop(1006);
    await vi.advanceTimersByTimeAsync(199);
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(3);

    latest().open();
    expect(connection.state).toBe('open');
    expect(reconnected).toHaveBeenCalledTimes(1);
  });

  it.each([4001, 4002, 4003, 4004])('does not reconnect after close code %i', async (code) => {
    const { connection, sockets, latest } = await connected();
    const states: string[] = [];
    connection.onStateChange((s, info) => states.push(`${s}:${info?.willReconnect ?? ''}`));
    latest().drop(code);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sockets).toHaveLength(1);
    expect(states).toEqual(['closed:false']);
  });

  it('does not reconnect after an intentional disconnect', async () => {
    const { connection, sockets, latest } = await connected();
    connection.disconnect();
    expect(latest().closedWith).toBe(1000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sockets).toHaveLength(1);
    expect(connection.state).toBe('closed');
  });

  it('rejects the first connect when the socket closes before opening', async () => {
    const { connection, sockets, latest } = setup();
    const opening = connection.connect();
    latest().drop(1006);
    await expect(opening).rejects.toBeInstanceOf(IcqError);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sockets).toHaveLength(1);
  });

  it('shares one socket between overlapping connect calls', async () => {
    const { connection, sockets, latest } = setup();
    const a = connection.connect();
    const b = connection.connect();
    latest().open();
    await Promise.all([a, b]);
    expect(sockets).toHaveLength(1);
  });
});
