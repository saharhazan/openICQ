import { describe, expect, it } from 'vitest';
import { ME, chat, message, snapshot, user } from '../../tests/fixtures';
import {
  addOutgoing,
  applyEvent,
  applyHistory,
  applySnapshot,
  clearChat,
  insertMessage,
  markChatRead,
  setOutgoingState,
  upsertMessage,
} from './data';
import { initialDataState, type DataState, type OutgoingMessage } from './types';

function started(extra: Parameters<typeof snapshot>[0] = {}): DataState {
  return applySnapshot(initialDataState, snapshot(extra));
}

function outgoing(chatId: number, clientId: string, text = 'hi'): OutgoingMessage {
  return { clientId, chatId, text, replyTo: null, attachments: [], createdAt: 0, state: 'pending' };
}

describe('data reducer', () => {
  it('keeps messages ordered by id and replaces duplicates', () => {
    const a = message(1, ME, 'a', { id: 5 });
    const b = message(1, ME, 'b', { id: 3 });
    const edited = { ...a, text: 'a2' };
    expect(insertMessage(insertMessage([a], b), edited).map((m) => [m.id, m.text])).toEqual([
      [3, 'b'],
      [5, 'a2'],
    ]);
  });

  it('applies a snapshot and marks kept histories stale', () => {
    let state = started({ chats: [chat(1)] });
    state = applyHistory(state, 1, { messages: [message(1, 2, 'x')], users: [], readMarks: [], hasMore: false }, 'latest');
    const again = applySnapshot(state, snapshot({ chats: [chat(1)], users: [user(2, 'Anna')] }));
    expect(again.histories[1]?.loaded).toBe(false);
    expect(again.histories[1]?.messages).toHaveLength(1);
    expect(again.users[2]?.firstName).toBe('Anna');
  });

  it('replaces the newest page and extends with older pages', () => {
    let state = started({ chats: [chat(1)] });
    const m1 = message(1, 2, 'one', { id: 10 });
    const m2 = message(1, 2, 'two', { id: 11 });
    const m0 = message(1, 2, 'zero', { id: 9 });
    state = applyHistory(state, 1, { messages: [m1, m2], users: [], readMarks: [], hasMore: true }, 'latest');
    state = applyHistory(state, 1, { messages: [m0], users: [], readMarks: [], hasMore: false }, 'older');
    expect(state.histories[1]?.messages.map((m) => m.id)).toEqual([9, 10, 11]);
    expect(state.histories[1]?.hasMore).toBe(false);
  });

  it('matches the server echo to the pending bubble by clientId', () => {
    let state = started({ chats: [chat(1)] });
    state = applyHistory(state, 1, { messages: [], users: [], readMarks: [], hasMore: false }, 'latest');
    state = addOutgoing(state, outgoing(1, 'c-1'));
    expect(state.outbox[1]).toHaveLength(1);
    const echo = message(1, ME, 'hi', { id: 50, clientId: 'c-1' });
    state = applyEvent(state, { type: 'message', message: echo, chat: chat(1, { lastMessage: echo }), users: [] });
    expect(state.outbox[1]).toEqual([]);
    expect(state.histories[1]?.messages.map((m) => m.id)).toEqual([50]);
    // The request result arriving later changes nothing.
    expect(upsertMessage(state, echo).histories[1]?.messages).toHaveLength(1);
  });

  it('marks a pending message failed', () => {
    const state = setOutgoingState(addOutgoing(started(), outgoing(1, 'c-2')), 1, 'c-2', 'failed');
    expect(state.outbox[1]?.[0]?.state).toBe('failed');
  });

  it('moves the peer read and delivery marks forward only', () => {
    let state = started({ chats: [chat(1, { peer: 2, peerDeliveredId: 5, peerReadId: 4 })] });
    state = applyEvent(state, { type: 'delivered', chatId: 1, uin: 2, messageId: 3 });
    expect(state.chats[1]?.peerDeliveredId).toBe(5);
    state = applyEvent(state, { type: 'read', chatId: 1, uin: 2, messageId: 8 });
    expect(state.chats[1]).toMatchObject({ peerReadId: 8, peerDeliveredId: 8 });
  });

  it('tracks group read marks per member', () => {
    let state = started({ chats: [chat(7, { type: 'group', title: 'G' })] });
    state = applyEvent(state, { type: 'delivered', chatId: 7, uin: 3, messageId: 20 });
    state = applyEvent(state, { type: 'read', chatId: 7, uin: 4, messageId: 18 });
    expect(state.readMarks[7]?.[3]).toEqual({ uin: 3, lastReadId: 0, lastDeliveredId: 20 });
    expect(state.readMarks[7]?.[4]).toEqual({ uin: 4, lastReadId: 18, lastDeliveredId: 18 });
  });

  it('clears unread when my other device reads the newest message', () => {
    const last = message(1, 2, 'x', { id: 30 });
    let state = started({ chats: [chat(1, { peer: 2, unread: 3, lastMessage: last, markedUnread: true })] });
    state = applyEvent(state, { type: 'read', chatId: 1, uin: ME, messageId: 30 });
    expect(state.chats[1]).toMatchObject({ unread: 0, markedUnread: false, lastReadId: 30 });
  });

  it('keeps the unread count when reading stops before the newest message', () => {
    const last = message(1, 2, 'x', { id: 30 });
    const state = markChatRead(started({ chats: [chat(1, { unread: 3, lastMessage: last })] }), 1, 20);
    expect(state.chats[1]).toMatchObject({ unread: 3, lastReadId: 20 });
  });

  it('stops typing when the typist sends a message', () => {
    let state = started({ chats: [chat(1)] });
    state = applyEvent(state, { type: 'typing', chatId: 1, uin: 2 });
    expect(state.typing[1]).toEqual([2]);
    const m = message(1, 2, 'done');
    state = applyEvent(state, { type: 'message', message: m, chat: chat(1, { lastMessage: m }), users: [] });
    expect(state.typing[1]).toBeUndefined();
  });

  it('ignores my own typing echo', () => {
    const state = applyEvent(started({ chats: [chat(1)] }), { type: 'typing', chatId: 1, uin: ME });
    expect(state.typing[1]).toBeUndefined();
  });

  it('removes messages and falls back to the previous last message', () => {
    const a = message(1, 2, 'a', { id: 1 });
    const b = message(1, 2, 'b', { id: 2 });
    let state = started({ chats: [chat(1, { lastMessage: b })] });
    state = applyHistory(state, 1, { messages: [a, b], users: [], readMarks: [], hasMore: false }, 'latest');
    state = applyEvent(state, { type: 'messages.removed', chatId: 1, messageIds: [2] });
    expect(state.histories[1]?.messages.map((m) => m.id)).toEqual([1]);
    expect(state.chats[1]?.lastMessage?.id).toBe(1);
  });

  it('keeps the row preview when the removed last message has no loaded history behind it', () => {
    const last = message(1, 2, 'b', { id: 2 });
    const state = applyEvent(started({ chats: [chat(1, { lastMessage: last })] }), { type: 'messages.removed', chatId: 1, messageIds: [2] });
    expect(state.chats[1]?.lastMessage?.id).toBe(2);
  });

  it('drops a removed chat with its history', () => {
    let state = started({ chats: [chat(1), chat(2)] });
    state = applyHistory(state, 1, { messages: [], users: [], readMarks: [], hasMore: false }, 'latest');
    state = applyEvent(state, { type: 'chat.removed', chatId: 1 });
    expect(Object.keys(state.chats)).toEqual(['2']);
    expect(state.histories[1]).toBeUndefined();
  });

  it('updates presence and the contact flags', () => {
    let state = started({ users: [user(2, 'Anna'), user(3, 'Ben', { isContact: false })], contacts: [2] });
    state = applyEvent(state, { type: 'presence', uin: 2, presence: { online: true, lastSeen: null } });
    state = applyEvent(state, { type: 'contacts.changed', contacts: [3] });
    expect(state.users[2]?.presence.online).toBe(true);
    expect(state.users[2]?.isContact).toBe(false);
    expect(state.users[3]?.isContact).toBe(true);
    expect(state.contacts).toEqual([3]);
  });

  it('clears a chat locally', () => {
    const last = message(1, 2, 'x');
    let state = started({ chats: [chat(1, { lastMessage: last, unread: 2 })] });
    state = applyHistory(state, 1, { messages: [last], users: [], readMarks: [], hasMore: true }, 'latest');
    state = clearChat(state, 1);
    expect(state.histories[1]?.messages).toEqual([]);
    expect(state.chats[1]).toMatchObject({ lastMessage: null, unread: 0 });
  });
});
