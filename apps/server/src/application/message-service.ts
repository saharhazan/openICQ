/**
 * Messages (plan rules 5 to 8): send, reply, forward, edit, delete for me or
 * for all, and reactions. The acting connection gets the result; every other
 * connection of every member gets the matching event, built for its user.
 */
import type { Message, Reaction } from '@openicq/protocol';
import type { MessageRecord } from '../domain/entities.ts';
import { DomainError } from '../domain/errors.ts';
import type { Clock, TransactionRunner } from '../domain/ports.ts';
import type { BlockRepository, ChatRepository, FileRepository, MessageRepository } from '../domain/repositories.ts';
import { canDeleteForAll } from '../domain/rules.ts';
import type { Uin } from '../domain/vocabulary.ts';
import type { ChatEvents } from './chat-events.ts';
import { assertCanWrite, assertNotBlocked } from './chat-service.ts';
import { MESSAGES, requireMembership, unique, type Actor } from './support.ts';
import type { ViewBuilder } from './views.ts';

export const EMPTY_MESSAGE = 'A message needs text or a file.';

/** Deletes uploaded files nothing uses any more (the file service). Reports its own failures, never rejects. */
export interface FileCleanup {
  removeUnreferenced(fileIds: readonly number[]): Promise<void>;
}

export interface MessageServiceDeps {
  readonly chats: ChatRepository;
  readonly messages: MessageRepository;
  readonly files: FileRepository;
  readonly blocks: BlockRepository;
  readonly views: ViewBuilder;
  readonly events: ChatEvents;
  readonly fileCleanup: FileCleanup;
  readonly transactions: TransactionRunner;
  readonly clock: Clock;
}

export interface SendInput {
  readonly chatId: number;
  readonly clientId: string;
  readonly text: string;
  readonly replyToId?: number | undefined;
  readonly attachmentFileIds: readonly number[];
}

export interface DeleteInput {
  readonly chatId: number;
  readonly messageIds: readonly number[];
  readonly forAll: boolean;
}

function hasText(text: string): boolean {
  return text.trim() !== '';
}

export class MessageService {
  private readonly deps: MessageServiceDeps;

  constructor(deps: MessageServiceDeps) {
    this.deps = deps;
  }

  send(actor: Actor, input: SendInput): Message {
    const { chats, messages, blocks, views, events, transactions } = this.deps;
    const { chat, member } = requireMembership(chats, input.chatId, actor.uin);
    assertCanWrite(blocks, chat, member);
    const fileIds = this.ownAttachments(actor.uin, input.attachmentFileIds);
    if (!hasText(input.text) && fileIds.length === 0) throw new DomainError('bad_request', EMPTY_MESSAGE);
    if (input.replyToId !== undefined) {
      const quoted = messages.findById(input.replyToId);
      if (quoted === null || quoted.chatId !== chat.id) {
        throw new DomainError('bad_request', 'You can only reply to a message of the same chat.');
      }
    }
    const at = this.now();
    const record = transactions.run(() => {
      const created = messages.create({
        chatId: chat.id,
        senderUin: actor.uin,
        clientId: input.clientId,
        text: hasText(input.text) ? input.text : '',
        event: null,
        replyToId: input.replyToId ?? null,
        forwardedFrom: null,
        sentAt: at,
      });
      messages.attachFiles(created.id, fileIds);
      chats.touch(chat.id, at);
      chats.unhideAll(chat.id);
      return created;
    });
    events.newMessage(record, actor.connectionId);
    return views.message(actor.uin, record);
  }

  /**
   * Copies messages into another chat in their original order. `forwardedFrom`
   * names the original author, also when forwarding a forwarded message.
   */
  forward(actor: Actor, fromChatId: number, messageIds: readonly number[], toChatId: number): Message[] {
    const { chats, messages, blocks, views, events, transactions } = this.deps;
    const source = requireMembership(chats, fromChatId, actor.uin);
    const target = requireMembership(chats, toChatId, actor.uin);
    assertCanWrite(blocks, target.chat, target.member);
    const originals = this.visibleMessages(actor.uin, fromChatId, source.member.clearedBeforeId, messageIds);
    if (originals.some((original) => original.deleted || original.event !== null)) {
      throw new DomainError('bad_request', 'Deleted and service messages cannot be forwarded.');
    }
    const files = messages.attachmentsOf(originals.map((original) => original.id));
    const at = this.now();
    const records = transactions.run(() => {
      const created = originals.map((original) => {
        const copy = messages.create({
          chatId: toChatId,
          senderUin: actor.uin,
          clientId: null,
          text: original.text,
          event: null,
          replyToId: null,
          forwardedFrom: original.forwardedFrom ?? original.senderUin,
          sentAt: at,
        });
        messages.attachFiles(copy.id, (files.get(original.id) ?? []).map((file) => file.id));
        return copy;
      });
      chats.touch(toChatId, at);
      chats.unhideAll(toChatId);
      return created;
    });
    for (const record of records) events.newMessage(record, actor.connectionId);
    return views.messages(actor.uin, records);
  }

  /** Your own message, not deleted and not a service message; no time limit. */
  edit(actor: Actor, messageId: number, text: string): Message {
    const { chats, messages, blocks, views, events } = this.deps;
    const record = this.requireMessage(messageId);
    const { chat, member } = requireMembership(chats, record.chatId, actor.uin);
    this.visibleMessages(actor.uin, record.chatId, member.clearedBeforeId, [record.id]);
    if (record.senderUin !== actor.uin) throw new DomainError('forbidden', 'You can only edit your own messages.');
    if (record.deleted || record.event !== null) {
      throw new DomainError('bad_request', 'Deleted and service messages cannot be edited.');
    }
    assertCanWrite(blocks, chat, member);
    if (!hasText(text) && messages.attachmentsOf([record.id]).size === 0) throw new DomainError('bad_request', EMPTY_MESSAGE);
    const updated = messages.updateText(record.id, text, this.now());
    events.messageUpdated(updated, actor.connectionId);
    return views.message(actor.uin, updated);
  }

  /**
   * "Delete for me" hides the messages for the viewer (their other devices get
   * `messages.removed`). "Delete for all" leaves tombstones for everyone, and
   * their files are deleted once no other message and no avatar uses them.
   */
  async delete(actor: Actor, input: DeleteInput): Promise<void> {
    const { chats, messages, events, transactions } = this.deps;
    const { chat, member } = requireMembership(chats, input.chatId, actor.uin);
    const records = this.visibleMessages(actor.uin, chat.id, member.clearedBeforeId, input.messageIds);
    if (!input.forAll) {
      messages.hide(actor.uin, records.map((record) => record.id));
      events.toUser(actor.uin, { type: 'messages.removed', chatId: chat.id, messageIds: records.map((record) => record.id) }, actor.connectionId);
      events.chatUpdated(actor.uin, chat.id);
      return;
    }
    for (const record of records) {
      if (record.event !== null) throw new DomainError('bad_request', 'Service messages can only be deleted for you.');
      if (!canDeleteForAll(chat.type, member.role, record.senderUin === actor.uin)) {
        throw new DomainError('forbidden', 'You can only delete your own messages for everyone.');
      }
    }
    const doomed = records.filter((record) => !record.deleted);
    const attached = messages.attachmentsOf(doomed.map((record) => record.id));
    const fileIds = unique([...attached.values()].flat().map((file) => file.id));
    const tombstones = transactions.run(() => doomed.map((record) => messages.tombstone(record.id)));
    for (const tombstone of tombstones) events.messageUpdated(tombstone, actor.connectionId);
    await this.deps.fileCleanup.removeUnreferenced(fileIds);
  }

  /** One reaction per user per message; null takes it back. */
  react(actor: Actor, messageId: number, reaction: Reaction | null): Message {
    const { chats, messages, blocks, views, events } = this.deps;
    const record = this.requireMessage(messageId);
    const { chat, member } = requireMembership(chats, record.chatId, actor.uin);
    this.visibleMessages(actor.uin, record.chatId, member.clearedBeforeId, [record.id]);
    if (record.deleted || record.event !== null) {
      throw new DomainError('bad_request', 'You cannot react to a deleted or service message.');
    }
    // Read-only members may react; blocking still stops it in a direct chat.
    assertNotBlocked(blocks, chat, actor.uin);
    if (reaction === null) messages.removeReaction(record.id, actor.uin);
    else messages.setReaction(record.id, actor.uin, reaction, this.now());
    events.messageUpdated(record, actor.connectionId);
    return views.message(actor.uin, record);
  }

  /** Files attached to a new message must be the sender's own attachment uploads. */
  private ownAttachments(uin: Uin, fileIds: readonly number[]): number[] {
    const distinct = unique(fileIds);
    if (distinct.length !== fileIds.length) throw new DomainError('bad_request', 'The same file is attached twice.');
    for (const fileId of distinct) {
      const file = this.deps.files.findById(fileId);
      if (file === null || file.ownerUin !== uin || file.purpose !== 'attachment') {
        throw new DomainError('not_found', MESSAGES.fileNotFound);
      }
    }
    return distinct;
  }

  private requireMessage(messageId: number): MessageRecord {
    const record = this.deps.messages.findById(messageId);
    if (record === null) throw new DomainError('not_found', MESSAGES.messageNotFound);
    return record;
  }

  /** The messages, all of them in the chat and still visible to the viewer, oldest first. */
  private visibleMessages(viewer: Uin, chatId: number, clearedBeforeId: number, ids: readonly number[]): MessageRecord[] {
    const wanted = unique(ids);
    const records = this.deps.messages.findMany(wanted);
    const hidden = this.deps.messages.hiddenFor(viewer, wanted);
    const visible = records.filter((record) => record.chatId === chatId && record.id > clearedBeforeId && !hidden.has(record.id));
    if (visible.length !== wanted.length) throw new DomainError('not_found', MESSAGES.messageNotFound);
    return visible;
  }

  private now(): string {
    return this.deps.clock.now().toISOString();
  }
}
