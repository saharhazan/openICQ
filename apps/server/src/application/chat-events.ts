/**
 * Fan-out of chat events to members, built per recipient, and the delivery
 * marks (plan rule 9): a message handed to at least one connection of a
 * recipient moves that recipient's delivery mark, and in a direct chat the
 * sender gets `delivered`. Neither `delivered` nor `read` crosses a block.
 */
import type { ServerEvent } from '@openicq/protocol';
import type { ChatRecord, MemberRecord, MessageRecord } from '../domain/entities.ts';
import type { ConnectionId, Notifier } from '../domain/ports.ts';
import type { BlockRepository, ChatRepository, MessageRepository } from '../domain/repositories.ts';
import { peerOf } from '../domain/rules.ts';
import type { Uin } from '../domain/vocabulary.ts';
import { chatRefs, messageRefs, type ViewBuilder } from './views.ts';

export interface ChatEventsDeps {
  readonly chats: ChatRepository;
  readonly messages: MessageRepository;
  readonly blocks: BlockRepository;
  readonly views: ViewBuilder;
  readonly notifier: Notifier;
}

export class ChatEvents {
  private readonly chats: ChatRepository;
  private readonly messages: MessageRepository;
  private readonly blocks: BlockRepository;
  private readonly views: ViewBuilder;
  private readonly notifier: Notifier;

  constructor(deps: ChatEventsDeps) {
    this.chats = deps.chats;
    this.messages = deps.messages;
    this.blocks = deps.blocks;
    this.views = deps.views;
    this.notifier = deps.notifier;
  }

  /**
   * Sends a per-member event to every member who has the chat in their list,
   * skipping the `except` connection. `build` may return null to skip a member.
   */
  toMembers(chatId: number, build: (member: MemberRecord) => ServerEvent | null, except: ConnectionId | null): void {
    for (const member of this.chats.listMembers(chatId)) {
      if (member.hidden) continue;
      const event = build(member);
      if (event !== null) this.notifier.notify(member.uin, event, except);
    }
  }

  toUser(uin: Uin, event: ServerEvent, except: ConnectionId | null = null): void {
    this.notifier.notify(uin, event, except);
  }

  /** `chat.updated` with the row as `uin` now sees it; nothing when they left the chat. */
  chatUpdated(uin: Uin, chatId: number, except: ConnectionId | null = null): void {
    const payload = this.views.chatPayloadById(uin, chatId);
    if (payload !== null) this.notifier.notify(uin, { type: 'chat.updated', ...payload }, except);
  }

  /** `chat.updated` to every admin of a group (for example when join requests change). */
  chatUpdatedToAdmins(chatId: number, except: ConnectionId | null = null): void {
    for (const member of this.chats.listMembers(chatId)) {
      if (member.role === 'creator' || member.role === 'admin') this.chatUpdated(member.uin, chatId, except);
    }
  }

  /**
   * `message.updated` (edit, delete for all, reactions) to every member who
   * still sees the message, each with their own `mine`. Members who deleted it
   * for themselves or cleared the history past it get nothing, so it never comes back.
   */
  messageUpdated(record: MessageRecord, except: ConnectionId | null): void {
    this.toMembers(
      record.chatId,
      (member) =>
        record.id <= member.clearedBeforeId || this.messages.hiddenFor(member.uin, [record.id]).has(record.id)
          ? null
          : { type: 'message.updated', message: this.views.message(member.uin, record) },
      except,
    );
  }

  /**
   * Pushes a new message to every member (the sender's other devices included),
   * moves the delivery mark of each recipient it reached, and reports
   * `delivered` to the sender of a direct chat.
   */
  newMessage(record: MessageRecord, except: ConnectionId | null): void {
    // Read after the write, so the row carries the new activity time.
    const chat = this.chats.findById(record.chatId);
    if (chat === null) throw new Error(`Chat ${record.chatId} of message ${record.id} does not exist`);
    const adminsOnly = record.event?.type === 'member_left';
    for (const member of this.chats.listMembers(chat.id)) {
      if (member.hidden) continue;
      // "has left group (this message is visible only to administrators)".
      if (adminsOnly && member.role !== 'creator' && member.role !== 'admin') continue;
      const message = this.views.message(member.uin, record);
      const row = this.views.chat(member.uin, chat, member);
      const users = this.views.users(member.uin, [...messageRefs(message), ...chatRefs(row)]);
      const reached = this.notifier.notify(member.uin, { type: 'message', message, chat: row, users }, except);
      if (member.uin !== record.senderUin && reached > 0) this.markDelivered(chat, member.uin, record.id);
    }
  }

  /** Moves `uin`'s delivery mark to `messageId` (forward only) and tells the peer of a direct chat. */
  markDelivered(chat: ChatRecord, uin: Uin, messageId: number): void {
    if (!this.chats.advanceDelivered(chat.id, uin, messageId)) return;
    if (chat.type !== 'direct' || chat.pair === null) return;
    const peer = peerOf(chat.pair, uin);
    if (this.blockedEitherWay(uin, peer)) return;
    this.notifier.notify(peer, { type: 'delivered', chatId: chat.id, uin, messageId });
  }

  /**
   * `read` to every member and to the reader's other devices. In a direct chat
   * the peer gets nothing while either side blocks the other.
   */
  readMoved(chat: ChatRecord, uin: Uin, messageId: number, except: ConnectionId | null): void {
    const silenced = chat.type === 'direct' && chat.pair !== null && this.blockedEitherWay(uin, peerOf(chat.pair, uin));
    this.toMembers(
      chat.id,
      (member) => (silenced && member.uin !== uin ? null : { type: 'read', chatId: chat.id, uin, messageId }),
      except,
    );
  }

  private blockedEitherWay(a: Uin, b: Uin): boolean {
    return this.blocks.isBlocking(a, b) || this.blocks.isBlocking(b, a);
  }
}
