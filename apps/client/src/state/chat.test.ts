import { describe, expect, it } from 'vitest';
import { contact, message, notice, SELF, snapshot } from '../../tests/fixtures';
import {
  allContactsOffline,
  applyServerEvent,
  applySnapshot,
  type ChatState,
  conversationOf,
  initialChatState,
  markConversationRead,
  unreadCount,
} from './chat';

const ALICE = 200002;
const BOB = 200003;
const STRANGER = 300004;

function signedIn(extra: Partial<ChatState> = {}): ChatState {
  return {
    ...applySnapshot(initialChatState, snapshot({ contacts: [contact(ALICE, 'Alice'), contact(BOB, 'Bob', { status: 'online' })] })),
    ...extra,
  };
}

describe('applySnapshot', () => {
  it('loads contacts, notices and groups unread messages by sender', () => {
    const unread = [message(ALICE, SELF, 'hi'), message(ALICE, SELF, 'there'), message(STRANGER, SELF, 'yo')];
    const state = applySnapshot(
      initialChatState,
      snapshot({
        contacts: [contact(ALICE, 'Alice')],
        notices: [notice(1, BOB)],
        unread,
        notInList: [{ uin: STRANGER, nickname: 'Stranger' }],
        ignored: [400005],
      }),
    );
    expect(state.selfUin).toBe(SELF);
    expect(unreadCount(state, ALICE)).toBe(2);
    expect(unreadCount(state, STRANGER)).toBe(1);
    expect(state.notices).toHaveLength(1);
    expect(state.ignored).toEqual([400005]);
  });

  it('keeps loaded history across a reconnect of the same user', () => {
    const first = applySnapshot(initialChatState, snapshot({ unread: [message(ALICE, SELF, 'old')] }));
    const again = applySnapshot(first, snapshot({ unread: [] }));
    expect(conversationOf(again, ALICE).messages).toHaveLength(1);
  });
});

describe('applyServerEvent', () => {
  it('presence changes the status of a known contact only', () => {
    const state = applyServerEvent(signedIn(), { type: 'presence', uin: ALICE, status: 'away' });
    expect(state.contacts.find((c) => c.uin === ALICE)?.status).toBe('away');
    const unknown = applyServerEvent(state, { type: 'presence', uin: STRANGER, status: 'online' });
    expect(unknown).toBe(state);
  });

  it('presence with the same status returns the same state object', () => {
    const state = signedIn();
    expect(applyServerEvent(state, { type: 'presence', uin: BOB, status: 'online' })).toBe(state);
  });

  it('message from a contact lands in their conversation as unread', () => {
    const state = applyServerEvent(signedIn(), { type: 'message', message: message(ALICE, SELF, 'hello') });
    expect(unreadCount(state, ALICE)).toBe(1);
    expect(state.notInList).toHaveLength(0);
  });

  it('message from a stranger adds a "Not In List" entry', () => {
    const state = applyServerEvent(signedIn(), { type: 'message', message: message(STRANGER, SELF, 'hey') });
    expect(state.notInList).toEqual([{ uin: STRANGER, nickname: String(STRANGER) }]);
  });

  it('a copy of an own message goes to the recipient conversation and is not unread', () => {
    const own = message(SELF, ALICE, 'sent elsewhere', { read: true });
    const state = applyServerEvent(signedIn(), { type: 'message', message: own });
    expect(conversationOf(state, ALICE).messages).toEqual([own]);
    expect(unreadCount(state, ALICE)).toBe(0);
  });

  it('the same message twice is stored once', () => {
    const m = message(ALICE, SELF, 'dup');
    const once = applyServerEvent(signedIn(), { type: 'message', message: m });
    const twice = applyServerEvent(once, { type: 'message', message: m });
    expect(conversationOf(twice, ALICE).messages).toHaveLength(1);
  });

  it('notice is added once', () => {
    const n = notice(7, STRANGER);
    const once = applyServerEvent(signedIn(), { type: 'notice', notice: n });
    expect(applyServerEvent(once, { type: 'notice', notice: n })).toBe(once);
    expect(once.notices).toEqual([n]);
  });

  it('contact.updated upserts the contact and clears a Not In List entry', () => {
    const withStranger = applyServerEvent(signedIn(), { type: 'message', message: message(STRANGER, SELF, 'hey') });
    const state = applyServerEvent(withStranger, {
      type: 'contact.updated',
      contact: contact(STRANGER, 'Now Known', { awaitingAuth: true }),
    });
    expect(state.contacts.find((c) => c.uin === STRANGER)).toMatchObject({ nickname: 'Now Known', awaitingAuth: true });
    expect(state.notInList).toHaveLength(0);
  });

  it('contact.removed drops the contact but keeps unread messages reachable', () => {
    const withUnread = applyServerEvent(signedIn(), { type: 'message', message: message(ALICE, SELF, 'bye') });
    const state = applyServerEvent(withUnread, { type: 'contact.removed', uin: ALICE });
    expect(state.contacts.some((c) => c.uin === ALICE)).toBe(false);
    expect(state.notInList).toEqual([{ uin: ALICE, nickname: 'Alice' }]);
  });

  it('session.kicked records the reason and shows everyone offline', () => {
    const state = applyServerEvent(signedIn(), { type: 'session.kicked', reason: 'other_location' });
    expect(state.kicked).toBe('other_location');
    expect(state.contacts.every((c) => c.status === 'offline')).toBe(true);
  });
});

describe('local transitions', () => {
  it('markConversationRead clears the unread count', () => {
    const state = applyServerEvent(signedIn(), { type: 'message', message: message(ALICE, SELF, 'hello') });
    expect(unreadCount(markConversationRead(state, ALICE), ALICE)).toBe(0);
  });

  it('allContactsOffline keeps the list but sets everyone offline', () => {
    const state = allContactsOffline(signedIn());
    expect(state.contacts).toHaveLength(2);
    expect(state.contacts.every((c) => c.status === 'offline')).toBe(true);
  });
});
