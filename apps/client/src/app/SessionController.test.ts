import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOSE_CODES } from '@openicq/protocol';
import { ME, chat, me, message, snapshot, user } from '../../tests/fixtures';
import { fakeApi, fakeConnection } from '../../tests/fakes';
import { IcqError } from '../net/errors';
import { createAppStore } from '../state/store';
import type { Api } from './ports';
import { SessionController, TYPING_TTL_MS } from './SessionController';

function setup() {
  const store = createAppStore();
  const connection = fakeConnection();
  connection.setOpen(false);
  const api = fakeApi();
  const alerts = { incoming: vi.fn() };
  const drafts = { loadDrafts: vi.fn().mockReturnValue({ 5: 'later' }) };
  const onStarted = vi.fn();
  const session = new SessionController({
    api: api as unknown as Api,
    connection: connection.port,
    store,
    drafts,
    alerts,
    sounds: { play: vi.fn(), unlock: vi.fn() },
    onStarted,
  });
  const start = (extra: Parameters<typeof snapshot>[0] = {}) => connection.request.mockResolvedValue(snapshot(extra));
  return { store, connection, api, alerts, drafts, onStarted, session, start };
}

describe('SessionController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows sign-in when there is no kept session', async () => {
    const { store, session } = setup();
    await session.boot();
    expect(store.getState().phase).toBe('auth');
  });

  it('resumes a kept session into the main window with my drafts', async () => {
    const { store, api, connection, session, start, onStarted } = setup();
    api.session.mockResolvedValue({ uin: ME });
    start({ chats: [chat(1)] });
    await session.boot();
    expect(connection.connect).toHaveBeenCalled();
    expect(connection.request).toHaveBeenCalledWith('session.start', {});
    expect(store.getState().phase).toBe('main');
    expect(store.getState().drafts).toEqual({ 5: 'later' });
    expect(onStarted).toHaveBeenCalledTimes(1);
  });

  it('asks a nameless account to introduce itself', async () => {
    const { store, api, session, start } = setup();
    api.session.mockResolvedValue({ uin: ME });
    start({ me: me({ firstName: '' }) });
    await session.boot();
    expect(store.getState().phase).toBe('introduce');
  });

  it('returns the original error text for a wrong password', async () => {
    const { api, session } = setup();
    api.login.mockRejectedValue(new IcqError('unauthorized', 'nope', 401));
    await expect(session.signIn({ login: '100001', password: 'x' })).resolves.toEqual({ ok: false, error: 'Invalid login or password' });
  });

  it('signs up, signs in right away (register sets no cookie), and reports the new number', async () => {
    const { api, session } = setup();
    const result = await session.signUp({ firstName: 'Anna', password: 'secret1' });
    expect(result).toEqual({ ok: true, uin: 100500 });
    expect(api.login).toHaveBeenCalledWith({ login: '100500', password: 'secret1', keepSignedIn: true });
  });

  it('passes the conflict code of a taken nickname', async () => {
    const { api, session } = setup();
    api.register.mockRejectedValue(new IcqError('conflict', 'Nickname taken', 409));
    await expect(session.signUp({ firstName: 'A', password: 'secret1', nickname: 'taken.one' })).resolves.toMatchObject({ ok: false, code: 'conflict' });
  });

  it('alerts an incoming message once and not my own', async () => {
    const { connection, alerts, api, session, start } = setup();
    api.session.mockResolvedValue({ uin: ME });
    start({ chats: [chat(1, { peer: 2 })], users: [user(2, 'Anna')] });
    await session.boot();
    const incoming = message(1, 2, 'hi');
    connection.emit({ type: 'message', message: incoming, chat: chat(1, { peer: 2, lastMessage: incoming }), users: [] });
    const own = message(1, ME, 'mine');
    connection.emit({ type: 'message', message: own, chat: chat(1, { peer: 2, lastMessage: own }), users: [] });
    expect(alerts.incoming).toHaveBeenCalledTimes(1);
    expect(alerts.incoming).toHaveBeenCalledWith({ chatId: 1, title: 'Anna', sender: null, text: 'hi', chatOpen: false });
  });

  it('does not alert muted chats', async () => {
    const { connection, alerts, api, session, start } = setup();
    api.session.mockResolvedValue({ uin: ME });
    start({ chats: [chat(1, { peer: 2, muted: true })] });
    await session.boot();
    const incoming = message(1, 2, 'hi');
    connection.emit({ type: 'message', message: incoming, chat: chat(1, { peer: 2, muted: true, lastMessage: incoming }), users: [] });
    expect(alerts.incoming).not.toHaveBeenCalled();
  });

  it('lets "is typing" expire', async () => {
    const { store, connection, api, session, start } = setup();
    api.session.mockResolvedValue({ uin: ME });
    start({ chats: [chat(1, { peer: 2 })] });
    await session.boot();
    connection.emit({ type: 'typing', chatId: 1, uin: 2 });
    expect(store.getState().data.typing[1]).toEqual([2]);
    vi.advanceTimersByTime(TYPING_TTL_MS);
    expect(store.getState().data.typing[1]).toBeUndefined();
  });

  it('starts the session again after a reconnect', async () => {
    const { connection, api, session, start, onStarted } = setup();
    api.session.mockResolvedValue({ uin: ME });
    start();
    await session.boot();
    connection.reconnect();
    await vi.waitFor(() => expect(onStarted).toHaveBeenCalledTimes(2));
  });

  it('goes back to sign-in when the session is closed from another device', async () => {
    const { store, connection, api, session, start } = setup();
    api.session.mockResolvedValue({ uin: ME });
    start();
    await session.boot();
    connection.close('closed', { code: CLOSE_CODES.sessionClosed, reason: '', willReconnect: false });
    expect(store.getState().phase).toBe('auth');
    expect(store.getState().data.me).toBeNull();
    expect(store.getState().toasts.at(-1)?.text).toBe('Session is closed');
  });

  it('reports a protocol violation close instead of going silent', async () => {
    const { store, connection, api, session, start } = setup();
    api.session.mockResolvedValue({ uin: ME });
    start();
    await session.boot();
    connection.close('closed', { code: CLOSE_CODES.protocolViolation, reason: '', willReconnect: false });
    expect(store.getState().phase).toBe('main');
    expect(store.getState().toasts.at(-1)?.tone).toBe('error');
  });

  it('closes the open chat when it is removed', async () => {
    const { store, connection, api, session, start } = setup();
    api.session.mockResolvedValue({ uin: ME });
    start({ chats: [chat(1, { peer: 2 })] });
    await session.boot();
    store.getState().openChat(1);
    connection.emit({ type: 'chat.removed', chatId: 1 });
    expect(store.getState().selectedChatId).toBeNull();
  });
});
