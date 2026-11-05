import { describe, expect, it, vi } from 'vitest';
import { ME, chat, message, snapshot } from '../../tests/fixtures';
import { fakeApi, fakeConnection } from '../../tests/fakes';
import { IcqError } from '../net/errors';
import { applyHistory, applySnapshot } from '../state/data';
import { createAppStore } from '../state/store';
import type { Api } from './ports';
import { ChatCommands, TYPING_INTERVAL_MS, SERVER_TYPING_INTERVAL_MS } from './ChatCommands';

function setup() {
  const store = createAppStore({ phase: 'main' });
  const last = message(1, 2, 'hey', { id: 40 });
  store.getState().updateData((d) => applySnapshot(d, snapshot({ chats: [chat(1, { peer: 2, unread: 2, lastMessage: last })] })));
  store.getState().updateData((d) => applyHistory(d, 1, { messages: [last], users: [], readMarks: [], hasMore: false }, 'latest'));
  const connection = fakeConnection();
  const api = fakeApi();
  const sound = { outgoing: vi.fn() };
  let now = 1_000;
  const commands = new ChatCommands({ api: api as unknown as Api, connection: connection.port, store, sound, now: () => now });
  return { store, connection, api, sound, commands, advance: (ms: number) => (now += ms) };
}

describe('ChatCommands.send', () => {
  it('draws the message at once and replaces it with the server copy', async () => {
    const { store, connection, sound, commands } = setup();
    let resolve: (value: unknown) => void = () => undefined;
    connection.request.mockImplementation(() => new Promise((r) => (resolve = r)));
    const sending = commands.send(1, 'hello');
    await vi.waitFor(() => expect(store.getState().data.outbox[1]).toHaveLength(1));
    const pending = store.getState().data.outbox[1]?.[0];
    expect(pending).toMatchObject({ text: 'hello', state: 'pending' });
    const [type, payload] = connection.request.mock.calls[0] ?? [];
    expect(type).toBe('message.send');
    expect(payload).toMatchObject({ chatId: 1, text: 'hello', clientId: pending?.clientId, attachmentFileIds: [] });
    resolve({ message: message(1, ME, 'hello', { id: 41, clientId: pending?.clientId ?? null }) });
    await sending;
    expect(store.getState().data.outbox[1]).toEqual([]);
    expect(store.getState().data.histories[1]?.messages.map((m) => m.id)).toEqual([40, 41]);
    expect(sound.outgoing).toHaveBeenCalledTimes(1);
  });

  it('marks the bubble failed and reports the error', async () => {
    const { store, connection, commands } = setup();
    connection.request.mockRejectedValue(new IcqError('rate_limited', 'Too many messages'));
    await commands.send(1, 'hello');
    expect(store.getState().data.outbox[1]?.[0]?.state).toBe('failed');
    expect(store.getState().toasts.at(-1)).toMatchObject({ text: 'Too many messages', tone: 'error' });
  });

  it('uploads files before sending and passes their ids', async () => {
    const { connection, api, commands } = setup();
    api.upload.mockResolvedValue({ fileId: 77, name: 'a.txt', mime: 'text/plain', size: 1, kind: 'file', width: null, height: null });
    connection.request.mockResolvedValue({ message: message(1, ME, '', { id: 42 }) });
    await commands.send(1, '', [new File(['x'], 'a.txt', { type: 'text/plain' })]);
    expect(api.upload).toHaveBeenCalledWith(expect.any(File), 'a.txt', 'attachment');
    expect(connection.request.mock.calls[0]?.[1]).toMatchObject({ attachmentFileIds: [77] });
  });

  it('sends the reply target', async () => {
    const { connection, commands } = setup();
    connection.request.mockResolvedValue({ message: message(1, ME, 'ok', { id: 43 }) });
    await commands.send(1, 'ok', [], { messageId: 40, sender: 2, text: 'hey', hasAttachments: false, deleted: false });
    expect(connection.request.mock.calls[0]?.[1]).toMatchObject({ replyToId: 40 });
  });
});

describe('ChatCommands reading and typing', () => {
  it('marks read up to the newest message once', async () => {
    const { store, connection, commands } = setup();
    connection.request.mockResolvedValue({});
    await commands.markRead(1);
    await commands.markRead(1);
    expect(connection.request).toHaveBeenCalledTimes(1);
    expect(connection.request).toHaveBeenCalledWith('chat.read', { chatId: 1, messageId: 40 });
    expect(store.getState().data.chats[1]).toMatchObject({ unread: 0, lastReadId: 40 });
  });

  it('sends one typing notice per interval', () => {
    const { connection, commands, advance } = setup();
    connection.request.mockResolvedValue({});
    commands.typing(1);
    commands.typing(1);
    advance(TYPING_INTERVAL_MS);
    commands.typing(1);
    expect(connection.request.mock.calls.filter(([type]) => type === 'typing')).toHaveLength(2);
  });

  it('after a send, announces typing again once the server allows it (one notice per 2 s), not sooner', async () => {
    const { connection, commands, advance } = setup();
    connection.request.mockResolvedValue({ message: message(1, ME, 'ok', { id: 43 }) });
    commands.typing(1);
    await commands.send(1, 'ok', []);
    advance(1_000);
    commands.typing(1);
    expect(connection.request.mock.calls.filter(([type]) => type === 'typing')).toHaveLength(1);
    advance(SERVER_TYPING_INTERVAL_MS - 1_000);
    commands.typing(1);
    expect(connection.request.mock.calls.filter(([type]) => type === 'typing')).toHaveLength(2);
  });

  it('removes messages for me and leaves a tombstone for all', async () => {
    const { store, connection, commands } = setup();
    connection.request.mockResolvedValue({});
    await commands.deleteMessages(1, [40], true);
    expect(store.getState().data.histories[1]?.messages[0]).toMatchObject({ id: 40, deleted: true, text: '' });
    await commands.deleteMessages(1, [40], false);
    expect(store.getState().data.histories[1]?.messages).toEqual([]);
  });

  it('opens an existing direct chat without asking the server', async () => {
    const { store, connection, commands } = setup();
    await commands.openDirect(2);
    expect(connection.request).not.toHaveBeenCalled();
    expect(store.getState().selectedChatId).toBe(1);
  });
});
