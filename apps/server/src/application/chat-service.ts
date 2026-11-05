/**
 * The chat list and one chat (plan rules 4, 9 and 10): history, direct chats,
 * read marks, "Mark as unread", pin and mute, "Clear history", "Hide", typing.
 */
import type { ReadMark, RequestResult } from '@openicq/protocol';
import type { ChatRecord, MemberRecord } from '../domain/entities.ts';
import { DomainError } from '../domain/errors.ts';
import type { Clock, TransactionRunner } from '../domain/ports.ts';
import type { BlockRepository, ChatRepository, MessageRepository, UserRepository } from '../domain/repositories.ts';
import { canWrite, orderedPair, peerOf } from '../domain/rules.ts';
import type { Uin } from '../domain/vocabulary.ts';
import type { ChatEvents } from './chat-events.ts';
import type { GroupService } from './group-service.ts';
import { MESSAGES, requireMembership, requireUser, type Actor } from './support.ts';
import { messageRefs, type ChatPayload, type ViewBuilder } from './views.ts';

/** Read marks in one `chat.history` page, so a 25,000-member group stays a bounded answer. */
export const READ_MARKS_LIMIT = 200;

export interface ChatServiceDeps {
  readonly users: UserRepository;
  readonly chats: ChatRepository;
  readonly messages: MessageRepository;
  readonly blocks: BlockRepository;
  readonly views: ViewBuilder;
  readonly events: ChatEvents;
  readonly groups: GroupService;
  readonly transactions: TransactionRunner;
  readonly clock: Clock;
}

export interface HistoryQuery {
  readonly chatId: number;
  readonly beforeId?: number | undefined;
  readonly limit: number;
}

export interface ChatSettingsUpdate {
  readonly pinned?: boolean | undefined;
  readonly muted?: boolean | undefined;
}

/**
 * Sending, typing and reacting in a chat: read-only members may not, and in a
 * direct chat neither side may while one blocks the other.
 */
export function assertCanWrite(blocks: BlockRepository, chat: ChatRecord, member: MemberRecord): void {
  if (!canWrite(member.role)) throw new DomainError('forbidden', MESSAGES.writeForbidden);
  assertNotBlocked(blocks, chat, member.uin);
}

/** In a direct chat nobody interacts while either side blocks the other (plan rule 4). */
export function assertNotBlocked(blocks: BlockRepository, chat: ChatRecord, uin: Uin): void {
  if (chat.type !== 'direct' || chat.pair === null) return;
  const peer = peerOf(chat.pair, uin);
  if (blocks.isBlocking(peer, uin)) throw new DomainError('forbidden', MESSAGES.writeForbidden);
  if (blocks.isBlocking(uin, peer)) throw new DomainError('forbidden', 'You blocked this user. Unblock them to send messages.');
}

export class ChatService {
  private readonly deps: ChatServiceDeps;

  constructor(deps: ChatServiceDeps) {
    this.deps = deps;
  }

  /**
   * One page, oldest first, plus at most 200 read marks: mine, the direct peer's,
   * then the members who read furthest. Loading it counts as receiving it.
   */
  history(actor: Actor, query: HistoryQuery): RequestResult<'chat.history'> {
    const { chats, messages, views, events } = this.deps;
    const { chat, member } = requireMembership(chats, query.chatId, actor.uin);
    const newestFirst = messages.history(chat.id, actor.uin, member.clearedBeforeId, query.beforeId ?? null, query.limit + 1);
    const page = views.messages(actor.uin, newestFirst.slice(0, query.limit).reverse());
    const peer = chat.type === 'direct' && chat.pair !== null ? peerOf(chat.pair, actor.uin) : null;
    const readMarks: ReadMark[] = chats.listReadMarks(chat.id, actor.uin, peer, READ_MARKS_LIMIT).map((entry) => ({
      uin: entry.uin,
      lastReadId: entry.lastReadId,
      lastDeliveredId: entry.lastDeliveredId,
    }));
    const newest = page.at(-1);
    if (newest !== undefined) events.markDelivered(chat, actor.uin, newest.id);
    return {
      messages: page,
      users: views.users(actor.uin, [...page.flatMap(messageRefs), ...readMarks.map((mark) => mark.uin)]),
      readMarks,
      hasMore: newestFirst.length > query.limit,
    };
  }

  /** Opens the direct chat with a user, creating it on first use. Opening it with yourself opens Favorites. */
  direct(actor: Actor, uin: Uin): ChatPayload {
    const { chats, views, events, transactions } = this.deps;
    const target = requireUser(this.deps.users, uin);
    if (target.uin === actor.uin) return this.favorites(actor.uin);
    const [low, high] = orderedPair(actor.uin, target.uin);
    const { chat, shown } = transactions.run(() => {
      const existing = chats.findByPair(low, high);
      if (existing === null) return { chat: this.createDirect(low, high, actor.uin), shown: true };
      const member = chats.findMember(existing.id, actor.uin);
      if (member === null) throw new Error(`Direct chat ${existing.id} has no member ${actor.uin}`);
      if (member.hidden) chats.saveMember(existing.id, actor.uin, { ...member, hidden: false });
      return { chat: existing, shown: member.hidden };
    });
    if (shown) events.chatUpdated(actor.uin, chat.id, actor.connectionId);
    const payload = views.chatPayloadById(actor.uin, chat.id);
    if (payload === null) throw new Error(`Direct chat ${chat.id} lost its member ${actor.uin}`);
    return { chat: payload.chat, users: views.users(actor.uin, [target.uin, ...payload.users.map((user) => user.uin)]) };
  }

  /** Moves the read mark forward and clears "Mark as unread" (plan rule 9). */
  read(actor: Actor, chatId: number, messageId: number): void {
    const { chats, messages, events } = this.deps;
    const { chat, member } = requireMembership(chats, chatId, actor.uin);
    const target = Math.min(messageId, messages.maxId(chatId));
    const advanced = target > member.lastReadId;
    if (!advanced && !member.markedUnread) return;
    const lastReadId = Math.max(member.lastReadId, target);
    chats.saveMember(chatId, actor.uin, {
      ...member,
      lastReadId,
      lastDeliveredId: Math.max(member.lastDeliveredId, lastReadId),
      markedUnread: false,
    });
    if (advanced) {
      events.readMoved(chat, actor.uin, lastReadId, actor.connectionId);
    } else {
      events.chatUpdated(actor.uin, chatId, actor.connectionId);
    }
  }

  markUnread(actor: Actor, chatId: number): void {
    const { member } = requireMembership(this.deps.chats, chatId, actor.uin);
    if (member.markedUnread) return;
    this.deps.chats.saveMember(chatId, actor.uin, { ...member, markedUnread: true });
    this.deps.events.chatUpdated(actor.uin, chatId, actor.connectionId);
  }

  /** Pin (appended after the other pinned chats) and mute. */
  update(actor: Actor, chatId: number, update: ChatSettingsUpdate): ChatPayload {
    const { chats, views, events } = this.deps;
    const { chat, member } = requireMembership(chats, chatId, actor.uin);
    const pinOrder =
      update.pinned === undefined || update.pinned === (member.pinOrder !== null)
        ? member.pinOrder
        : update.pinned
          ? chats.nextPinOrder(actor.uin)
          : null;
    const muted = update.muted ?? member.muted;
    if (pinOrder === member.pinOrder && muted === member.muted) return views.chatPayload(actor.uin, chat, member);
    const saved = chats.saveMember(chatId, actor.uin, { ...member, pinOrder, muted });
    events.chatUpdated(actor.uin, chatId, actor.connectionId);
    return views.chatPayload(actor.uin, chat, saved);
  }

  /** "Clear history": hides every current message for the viewer only. */
  clear(actor: Actor, chatId: number): void {
    const { chats, messages, events } = this.deps;
    const { member } = requireMembership(chats, chatId, actor.uin);
    const lastId = messages.maxId(chatId);
    if (lastId <= member.clearedBeforeId) return;
    const removed = messages.visibleIds(chatId, actor.uin, member.clearedBeforeId, lastId);
    chats.saveMember(chatId, actor.uin, { ...member, clearedBeforeId: lastId });
    if (removed.length > 0) {
      events.toUser(actor.uin, { type: 'messages.removed', chatId, messageIds: removed }, actor.connectionId);
    }
    events.chatUpdated(actor.uin, chatId);
  }

  /** Direct chat: "Hide" until the next message. Group: "Leave and delete". Favorites stays. */
  remove(actor: Actor, chatId: number): void {
    const { chats, events } = this.deps;
    const { chat, member } = requireMembership(chats, chatId, actor.uin);
    if (chat.type === 'favorites') throw new DomainError('bad_request', 'Favorites cannot be removed.');
    if (chat.type === 'group') {
      this.deps.groups.leave(actor, chatId);
    } else if (!member.hidden) {
      chats.saveMember(chatId, actor.uin, { ...member, hidden: true });
    }
    events.toUser(actor.uin, { type: 'chat.removed', chatId }, actor.connectionId);
  }

  /** Relays "is typing" to the other members (rate limited by the transport). */
  typing(actor: Actor, chatId: number): void {
    const { chat, member } = requireMembership(this.deps.chats, chatId, actor.uin);
    assertCanWrite(this.deps.blocks, chat, member);
    this.deps.events.toMembers(
      chatId,
      (other) => (other.uin === actor.uin ? null : { type: 'typing', chatId, uin: actor.uin }),
      actor.connectionId,
    );
  }

  private favorites(uin: Uin): ChatPayload {
    const chat = this.deps.chats.findFavorites(uin);
    const payload = chat === null ? null : this.deps.views.chatPayloadById(uin, chat.id);
    if (payload === null) throw new Error(`User ${uin} has no Favorites chat`);
    return payload;
  }

  /** A new direct chat: shown to the opener, and to the peer only from the first message (plan rule 4). */
  private createDirect(low: Uin, high: Uin, opener: Uin): ChatRecord {
    const at = this.deps.clock.now().toISOString();
    const chat = this.deps.chats.create({
      type: 'direct',
      pair: [low, high],
      title: '',
      about: '',
      rules: '',
      avatarFileId: null,
      joinWithApproval: false,
      isPublic: false,
      inviteToken: null,
      createdAt: at,
      updatedAt: at,
    });
    for (const uin of [low, high]) {
      this.deps.chats.addMember({ chatId: chat.id, uin, role: 'member', joinedAt: at, hidden: uin !== opener, pinOrder: null });
    }
    return chat;
  }
}
