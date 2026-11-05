import { describe, expect, it, vi } from 'vitest';
import { message, SELF, snapshot } from '../../tests/fixtures';
import type { ApiClient } from '../net/ApiClient';
import { IcqConnection, type SocketLike } from '../net/IcqConnection';
import { conversationOf, unreadCount } from '../state/chat';
import { createAppStore } from '../state/store';
import { LocalPrefs } from './LocalPrefs';
import { SessionController } from './SessionController';

const BOB = 200003;

interface Sent {
  id: string;
  type: string;
  payload: { status?: string };
}

/** A socket that plays a tiny ICQ server: replies are queued until flush(). */
class FakeServerSocket implements SocketLike {
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readonly sent: Sent[] = [];
  readonly #queue: Sent[] = [];

  send(data: string): void {
    const frame = JSON.parse(data) as Sent;
    this.sent.push(frame);
    this.#queue.push(frame);
  }

  close(): void {
    this.readyState = 3;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  push(frame: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(frame) }));
  }

  /** Answers every queued request in order. */
  flush(): void {
    for (const frame of this.#queue.splice(0)) {
      let result: unknown = {};
      if (frame.type === 'session.start') result = snapshot({ status: frame.payload.status === 'away' ? 'away' : 'online' });
      if (frame.type === 'status.set') result = { status: frame.payload.status };
      if (frame.type === 'message.markRead') result = { count: 1 };
      this.push({ kind: 'result', replyTo: frame.id, result });
    }
  }

  types(): string[] {
    return this.sent.map((f) => `${f.type}${f.payload.status ? `:${f.payload.status}` : ''}`);
  }
}

function setup() {
  const sockets: FakeServerSocket[] = [];
  const connection = new IcqConnection({
    url: 'ws://test/ws',
    socketFactory: () => {
      const socket = new FakeServerSocket();
      sockets.push(socket);
      return socket;
    },
  });
  const store = createAppStore({ viewport: () => ({ width: 1024, height: 768 }), saved: () => null });
  const memory = new Map<string, string>();
  const prefs = new LocalPrefs(
    () => ({ getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v) }),
    (error) => {
      throw error;
    },
  );
  // Only the REST calls the tests reach are needed.
  const api = { session: vi.fn(), login: vi.fn(), logout: vi.fn(), register: vi.fn() } as unknown as ApiClient;
  const session = new SessionController({ api, connection, store, sounds: { play: vi.fn(), unlock: vi.fn() }, prefs });
  const socket = () => {
    const s = sockets.at(-1);
    if (!s) throw new Error('no socket');
    return s;
  };
  return { session, store, socket, sockets };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function online(ctx: ReturnType<typeof setup>) {
  const going = ctx.session.goOnline('online');
  ctx.socket().open();
  await tick();
  ctx.socket().flush();
  await going;
}

describe('SessionController', () => {
  it('shares one session.start between overlapping connects and then applies the later status', async () => {
    const ctx = setup();
    const first = ctx.session.goOnline('online');
    const second = ctx.session.goOnline('invisible');
    ctx.socket().open();
    await tick();
    ctx.socket().flush();
    await tick();
    ctx.socket().flush();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(ctx.sockets).toHaveLength(1);
    expect(ctx.socket().types()).toEqual(['session.start:online', 'status.set:invisible']);
    expect(ctx.store.getState().status).toBe('invisible');
  });

  it('restores the status after auto-away, even when activity returns before the server answered', async () => {
    const ctx = setup();
    await online(ctx);
    ctx.session.handleIdle('away');
    ctx.session.handleIdle('active');
    await tick();
    ctx.socket().flush();
    await tick();
    expect(ctx.socket().types().slice(1)).toEqual(['status.set:away', 'status.set:online']);
    expect(ctx.store.getState().status).toBe('online');
  });

  it('does not undo a status the user chose', async () => {
    const ctx = setup();
    await online(ctx);
    const manual = ctx.session.setStatus('dnd', 'busy');
    ctx.socket().flush();
    await manual;
    ctx.session.handleIdle('away');
    ctx.session.handleIdle('active');
    await tick();
    expect(ctx.socket().types().slice(1)).toEqual(['status.set:dnd']);
  });

  it('choosing Offline while connecting shows no error', async () => {
    const ctx = setup();
    const going = ctx.session.goOnline('online');
    ctx.session.goOffline();
    await expect(going).resolves.toBe(false);
    expect(ctx.store.getState().errors).toEqual([]);
    expect(ctx.store.getState().status).toBe('offline');
  });

  it('marks read only the messages that were unread when the request went out', async () => {
    const ctx = setup();
    await online(ctx);
    ctx.socket().push({ kind: 'event', event: { type: 'message', message: message(BOB, SELF, 'one') } });
    const marking = ctx.session.markRead(BOB);
    ctx.socket().push({ kind: 'event', event: { type: 'message', message: message(BOB, SELF, 'two') } });
    ctx.socket().flush();
    await marking;
    const chat = ctx.store.getState().chat;
    expect(unreadCount(chat, BOB)).toBe(1);
    expect(conversationOf(chat, BOB).messages.find((m) => m.text === 'two')?.read).toBe(false);
  });
});
