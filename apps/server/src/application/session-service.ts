/**
 * `session.start`: the snapshot the main window needs. Loading it counts as
 * receiving every message so far, so delivery marks move (plan rule 9).
 * The chat list is capped, so the work per snapshot stays bounded.
 */
import type { Chat, SessionSnapshot } from '@openicq/protocol';
import type { Clock } from '../domain/ports.ts';
import type { ChatRepository, ContactRepository, MessageRepository, UserRepository } from '../domain/repositories.ts';
import type { Uin } from '../domain/vocabulary.ts';
import type { ChatEvents } from './chat-events.ts';
import { requireUser } from './support.ts';
import { chatRefs, type ViewBuilder } from './views.ts';

/** Chats in one snapshot: every pinned chat, then the most recent ones. */
export const SESSION_CHAT_LIMIT = 1000;

export interface SessionServiceDeps {
  readonly users: UserRepository;
  readonly chats: ChatRepository;
  readonly messages: MessageRepository;
  readonly contacts: ContactRepository;
  readonly views: ViewBuilder;
  readonly events: ChatEvents;
  readonly clock: Clock;
}

/** A chat row with the member's pin position, which the row itself does not carry. */
export interface ListedChat {
  readonly chat: Chat;
  readonly pinOrder: number | null;
}

/** Chat list order: pinned chats in pin order, then the most recent activity first. */
export function compareChats(a: ListedChat, b: ListedChat): number {
  if (a.pinOrder !== null && b.pinOrder !== null) return a.pinOrder - b.pinOrder;
  if (a.pinOrder !== null) return -1;
  if (b.pinOrder !== null) return 1;
  if (a.chat.updatedAt !== b.chat.updatedAt) return a.chat.updatedAt < b.chat.updatedAt ? 1 : -1;
  return b.chat.id - a.chat.id;
}

export class SessionService {
  private readonly deps: SessionServiceDeps;

  constructor(deps: SessionServiceDeps) {
    this.deps = deps;
  }

  start(uin: Uin): SessionSnapshot {
    const { users, chats, messages, contacts, views, events, clock } = this.deps;
    const user = requireUser(users, uin);
    const rows: ListedChat[] = [];
    for (const member of chats.listChatList(uin, SESSION_CHAT_LIMIT)) {
      const chat = chats.findById(member.chatId);
      if (chat === null) throw new Error(`Membership of ${uin} points to missing chat ${member.chatId}`);
      const lastId = messages.maxId(chat.id);
      if (lastId > member.lastDeliveredId) events.markDelivered(chat, uin, lastId);
      rows.push({ chat: views.chat(uin, chat, member), pinOrder: member.pinOrder });
    }
    const ordered = [...rows].sort(compareChats).map((entry) => entry.chat);
    const contactList = contacts.list(uin);
    return {
      me: views.me(user),
      settings: { groupInvites: user.groupInvites },
      chats: ordered,
      users: views.users(uin, [...ordered.flatMap(chatRefs), ...contactList]),
      contacts: contactList,
      serverTime: clock.now().toISOString(),
    };
  }
}
