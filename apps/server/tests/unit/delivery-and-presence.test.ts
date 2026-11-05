import type { Chat, Message, ServerEvent, User } from '@openicq/protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatEvents } from '../../src/application/chat-events.ts';
import { PresenceService } from '../../src/application/presence-service.ts';
import type { ViewBuilder } from '../../src/application/views.ts';
import { ClientConnection } from '../../src/transport/ws/connection.ts';
import { ConnectionRegistry } from '../../src/transport/ws/connection-registry.ts';
import {
  chat,
  fixedClock,
  member,
  message,
  mockBlocks,
  mockChats,
  mockContacts,
  mockMessages,
  mockNotifier,
  mockUsers,
  strictMock,
  user,
} from './mocks.ts';

const ALICE = 100000;
const BOB = 100001;

describe('ChatEvents', () => {
  let chats: ReturnType<typeof mockChats>;
  let messages: ReturnType<typeof mockMessages>;
  let blocks: ReturnType<typeof mockBlocks>;
  let notifier: ReturnType<typeof mockNotifier>;
  let views: ReturnType<typeof strictMock<ViewBuilder>>;
  let events: ChatEvents;

  beforeEach(() => {
    chats = mockChats();
    messages = mockMessages();
    blocks = mockBlocks();
    notifier = mockNotifier();
    views = strictMock<ViewBuilder>('views', ['message', 'chat', 'users', 'chatPayloadById']);
    // The strict mock carries every method ChatEvents calls; the class's private fields are irrelevant here.
    events = new ChatEvents({ chats, messages, blocks, notifier, views: views as unknown as ViewBuilder });
    blocks.isBlocking.mockReturnValue(false);
    views.message.mockImplementation(
      (_viewer, record) =>
        ({ id: record.id, sender: record.senderUin, forwardedFrom: null, replyTo: null, event: null }) as unknown as Message,
    );
    views.chat.mockImplementation((viewer, record) => ({ id: record.id, peer: viewer === ALICE ? BOB : ALICE, lastMessage: null }) as unknown as Chat);
    views.users.mockReturnValue([] as User[]);
    chats.findById.mockReturnValue(chat(1, { pair: [ALICE, BOB] }));
    chats.listMembers.mockReturnValue([member(1, ALICE), member(1, BOB)]);
  });

  it('builds the message per recipient, skips the origin connection and reports delivered to the sender', () => {
    notifier.notify.mockImplementation((uin) => (uin === BOB ? 2 : 1));
    chats.advanceDelivered.mockReturnValue(true);
    events.newMessage(message(9, 1, ALICE), 'c1');

    const sent = notifier.notify.mock.calls.map(([uin, event, except]) => ({ uin, type: event.type, except }));
    expect(sent).toEqual([
      { uin: ALICE, type: 'message', except: 'c1' },
      { uin: BOB, type: 'message', except: 'c1' },
      { uin: ALICE, type: 'delivered', except: undefined },
    ]);
    expect(chats.advanceDelivered).toHaveBeenCalledWith(1, BOB, 9);
    const delivered = notifier.notify.mock.calls[2]?.[1];
    expect(delivered).toEqual({ type: 'delivered', chatId: 1, uin: BOB, messageId: 9 });
  });

  it('does not move the delivery mark of a recipient with no connection', () => {
    notifier.notify.mockImplementation((uin) => (uin === BOB ? 0 : 1));
    events.newMessage(message(9, 1, ALICE), null);
    expect(chats.advanceDelivered).not.toHaveBeenCalled();
  });

  it('skips members who do not have the chat in their list', () => {
    chats.listMembers.mockReturnValue([member(1, ALICE), member(1, BOB, { hidden: true })]);
    notifier.notify.mockReturnValue(1);
    events.newMessage(message(9, 1, ALICE), null);
    expect(notifier.notify.mock.calls.map(([uin]) => uin)).toEqual([ALICE]);
  });

  it('sends message.updated only to members who still see the message', () => {
    chats.listMembers.mockReturnValue([member(1, ALICE), member(1, BOB, { clearedBeforeId: 9 }), member(1, 100002)]);
    messages.hiddenFor.mockImplementation((viewer) => new Set(viewer === 100002 ? [9] : []));
    notifier.notify.mockReturnValue(1);
    events.messageUpdated(message(9, 1, ALICE), null);
    expect(notifier.notify.mock.calls.map(([uin, event]) => [uin, event.type])).toEqual([[ALICE, 'message.updated']]);
  });

  it('reports delivered only in direct chats and only when the mark moved', () => {
    chats.advanceDelivered.mockReturnValue(false);
    events.markDelivered(chat(1, { pair: [ALICE, BOB] }), BOB, 9);
    chats.advanceDelivered.mockReturnValue(true);
    events.markDelivered(chat(2, { type: 'group', pair: null }), BOB, 9);
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it('never reports delivered across a block, in either direction, but still moves the mark', () => {
    chats.advanceDelivered.mockReturnValue(true);
    for (const [owner, blocked] of [
      [BOB, ALICE],
      [ALICE, BOB],
    ]) {
      blocks.isBlocking.mockImplementation((a, b) => a === owner && b === blocked);
      events.markDelivered(chat(1, { pair: [ALICE, BOB] }), BOB, 9);
    }
    expect(chats.advanceDelivered).toHaveBeenCalledTimes(2);
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it('sends read to every member, but across a block only to the reader', () => {
    notifier.notify.mockReturnValue(1);
    const read = { type: 'read', chatId: 1, uin: BOB, messageId: 9 };
    events.readMoved(chat(1, { pair: [ALICE, BOB] }), BOB, 9, 'c2');
    expect(notifier.notify.mock.calls).toEqual([
      [ALICE, read, 'c2'],
      [BOB, read, 'c2'],
    ]);

    for (const [owner, blocked] of [
      [BOB, ALICE],
      [ALICE, BOB],
    ]) {
      notifier.notify.mockClear();
      blocks.isBlocking.mockImplementation((a, b) => a === owner && b === blocked);
      events.readMoved(chat(1, { pair: [ALICE, BOB] }), BOB, 9, 'c2');
      expect(notifier.notify.mock.calls).toEqual([[BOB, read, 'c2']]);
    }

    // Blocks are about direct chats: a group read mark still reaches everyone.
    notifier.notify.mockClear();
    blocks.isBlocking.mockReturnValue(true);
    events.readMoved(chat(1, { type: 'group', pair: null }), BOB, 9, null);
    expect(notifier.notify.mock.calls.map(([uin]) => uin)).toEqual([ALICE, BOB]);
  });
});

describe('PresenceService', () => {
  it('tells co-members and the people who saved the user, never the users they blocked', () => {
    const users = mockUsers();
    const chats = mockChats();
    const contacts = mockContacts();
    const blocks = mockBlocks();
    const notifier = mockNotifier();
    const clock = fixedClock('2026-11-05T10:00:00.000Z');
    const service = new PresenceService({ users, chats, contacts, blocks, notifier, clock });
    chats.listCoMembers.mockReturnValue([BOB, 100002]);
    contacts.ownersOf.mockReturnValue([100002, 100003]);
    blocks.list.mockReturnValue([100003]);
    users.touchLastSeen.mockReturnValue(undefined);
    notifier.notify.mockReturnValue(1);

    service.wentOffline(ALICE);
    expect(users.touchLastSeen).toHaveBeenCalledWith(ALICE, '2026-11-05T10:00:00.000Z');
    expect(notifier.notify.mock.calls.map(([uin]) => uin)).toEqual([BOB, 100002]);
    expect(notifier.notify.mock.calls[0]?.[1]).toEqual({
      type: 'presence',
      uin: ALICE,
      presence: { online: false, lastSeen: '2026-11-05T10:00:00.000Z' },
    });

    users.findByUin.mockReturnValue(user(ALICE, { lastSeenAt: '2026-11-05T10:00:00.000Z' }));
    notifier.notify.mockClear();
    service.cameOnline(ALICE);
    expect(notifier.notify.mock.calls[0]?.[1]).toMatchObject({ presence: { online: true } });
  });
});

describe('ConnectionRegistry', () => {
  function fakeConnection(registry: ConnectionRegistry, uin: number): { connection: ClientConnection; received: ServerEvent[] } {
    const received: ServerEvent[] = [];
    const socket = { OPEN: 1, CONNECTING: 0, readyState: 1, send: vi.fn(), close: vi.fn(), ping: vi.fn(), terminate: vi.fn() };
    const log = { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() };
    const connection = new ClientConnection({
      id: registry.newConnectionId(),
      // A minimal stand-in for ws.WebSocket and the Fastify logger: only the members the connection touches.
      socket: socket as unknown as ConstructorParameters<typeof ClientConnection>[0]['socket'],
      uin,
      sessionId: 1,
      log: log as unknown as ConstructorParameters<typeof ClientConnection>[0]['log'],
    });
    socket.send.mockImplementation((data: string) => {
      const frame = JSON.parse(data) as { kind: string; event: ServerEvent };
      if (frame.kind === 'event') received.push(frame.event);
    });
    registry.track(connection);
    return { connection, received };
  }

  it('delivers to every started connection of a user except the origin, and counts them', () => {
    const registry = new ConnectionRegistry();
    const laptop = fakeConnection(registry, ALICE);
    const phone = fakeConnection(registry, ALICE);
    const idle = fakeConnection(registry, ALICE);
    expect(registry.activate(laptop.connection)).toBe(true);
    expect(registry.activate(phone.connection)).toBe(false);
    const event: ServerEvent = { type: 'contacts.changed', contacts: [] };
    expect(registry.notify(ALICE, event, laptop.connection.id)).toBe(1);
    expect(phone.received).toEqual([event]);
    expect(laptop.received).toEqual([]);
    expect(idle.received).toEqual([]);
    expect(registry.notify(BOB, event)).toBe(0);
  });

  it('is online until the last started connection is released', () => {
    const registry = new ConnectionRegistry();
    const laptop = fakeConnection(registry, ALICE);
    const phone = fakeConnection(registry, ALICE);
    registry.activate(laptop.connection);
    registry.activate(phone.connection);
    expect(registry.release(laptop.connection)).toBe(false);
    expect(registry.isOnline(ALICE)).toBe(true);
    expect(registry.release(phone.connection)).toBe(true);
    expect(registry.isOnline(ALICE)).toBe(false);
    expect(registry.release(phone.connection)).toBe(false);
  });

  it('holds events while a request runs and flushes them in order afterwards', () => {
    const registry = new ConnectionRegistry();
    const laptop = fakeConnection(registry, ALICE);
    registry.activate(laptop.connection);
    laptop.connection.holdEvents();
    registry.notify(ALICE, { type: 'contacts.changed', contacts: [1] });
    registry.notify(ALICE, { type: 'contacts.changed', contacts: [2] });
    expect(laptop.received).toEqual([]);
    laptop.connection.releaseEvents();
    expect(laptop.received).toEqual([
      { type: 'contacts.changed', contacts: [1] },
      { type: 'contacts.changed', contacts: [2] },
    ]);
  });
});
