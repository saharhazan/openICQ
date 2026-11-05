import type { Chat, Me, Message, User } from '@openicq/protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ChatEvents } from '../../src/application/chat-events.ts';
import { ChatService, READ_MARKS_LIMIT } from '../../src/application/chat-service.ts';
import type { GroupService } from '../../src/application/group-service.ts';
import { SESSION_CHAT_LIMIT, SessionService } from '../../src/application/session-service.ts';
import type { ViewBuilder } from '../../src/application/views.ts';
import {
  chat,
  fixedClock,
  immediateTransactions,
  member,
  mockBlocks,
  mockChats,
  mockContacts,
  mockMessages,
  mockUsers,
  strictMock,
  user,
} from './mocks.ts';

const ALICE = 100000;
const BOB = 100001;
const ACTOR = { uin: ALICE, connectionId: 'c1' };

describe('bounded answers', () => {
  let users: ReturnType<typeof mockUsers>;
  let chats: ReturnType<typeof mockChats>;
  let messages: ReturnType<typeof mockMessages>;
  let views: ReturnType<typeof strictMock<ViewBuilder>>;
  let events: ReturnType<typeof strictMock<ChatEvents>>;

  beforeEach(() => {
    users = mockUsers();
    chats = mockChats();
    messages = mockMessages();
    views = strictMock<ViewBuilder>('views', ['messages', 'users', 'chat', 'me']);
    events = strictMock<ChatEvents>('events', ['markDelivered']);
    views.users.mockReturnValue([] as User[]);
  });

  it('chat.history asks for at most 200 read marks, the viewer and the direct peer first', () => {
    const service = new ChatService({
      users,
      chats,
      messages,
      blocks: mockBlocks(),
      // The strict mocks carry every method the service calls; the classes' private fields are irrelevant here.
      views: views as unknown as ViewBuilder,
      events: events as unknown as ChatEvents,
      groups: strictMock<GroupService>('groups', []) as unknown as GroupService,
      transactions: immediateTransactions,
      clock: fixedClock(),
    });
    chats.findById.mockReturnValue(chat(1, { pair: [ALICE, BOB] }));
    chats.findMember.mockReturnValue(member(1, ALICE));
    messages.history.mockReturnValue([]);
    views.messages.mockReturnValue([] as Message[]);
    chats.listReadMarks.mockReturnValue([member(1, ALICE, { lastReadId: 4 }), member(1, BOB, { lastReadId: 3, lastDeliveredId: 5 })]);

    const result = service.history(ACTOR, { chatId: 1, limit: 50 });
    expect(READ_MARKS_LIMIT).toBe(200);
    expect(chats.listReadMarks).toHaveBeenCalledWith(1, ALICE, BOB, READ_MARKS_LIMIT);
    expect(result.readMarks).toEqual([
      { uin: ALICE, lastReadId: 4, lastDeliveredId: 0 },
      { uin: BOB, lastReadId: 3, lastDeliveredId: 5 },
    ]);

    chats.findById.mockReturnValue(chat(2, { type: 'group', pair: null }));
    service.history(ACTOR, { chatId: 2, limit: 50 });
    expect(chats.listReadMarks).toHaveBeenLastCalledWith(2, ALICE, null, READ_MARKS_LIMIT);
  });

  it('session.start builds at most 1,000 chats, in the order the repository gives them', () => {
    const contacts = mockContacts();
    const service = new SessionService({
      users,
      chats,
      messages,
      contacts,
      views: views as unknown as ViewBuilder,
      events: events as unknown as ChatEvents,
      clock: fixedClock(),
    });
    users.findByUin.mockReturnValue(user(ALICE));
    contacts.list.mockReturnValue([]);
    chats.listChatList.mockReturnValue([member(7, ALICE, { pinOrder: 1 }), member(3, ALICE)]);
    chats.findById.mockImplementation((id) => chat(id, { type: 'group', pair: null }));
    messages.maxId.mockReturnValue(0);
    // Only the fields session.start reads (ordering and refs); the rest of the row is irrelevant here.
    views.chat.mockImplementation((_viewer, record) => ({ id: record.id, updatedAt: record.updatedAt, peer: null, lastMessage: null }) as Chat);
    views.me.mockReturnValue({ uin: ALICE } as Me);

    expect(SESSION_CHAT_LIMIT).toBe(1000);
    expect(service.start(ALICE).chats.map((entry) => entry.id)).toEqual([7, 3]);
    expect(chats.listChatList).toHaveBeenCalledWith(ALICE, SESSION_CHAT_LIMIT);
    expect(chats.listMemberships).not.toHaveBeenCalled();
  });
});
