/** Messages: sending with auto-response, read receipts, history and unread summaries. */
import {
  isAwayStatus,
  type AutoResponse,
  type ChatMessage,
  type NotInListEntry,
  type Uin,
} from '@openicq/protocol';
import { DomainError } from '../domain/errors.ts';
import type { Clock, Notifier } from '../domain/ports.ts';
import type { ContactRepository, IgnoreRepository, MessageRepository, UserRepository } from '../domain/repositories.ts';
import { toChatMessage } from './mappers.ts';
import { requireUser } from './support.ts';
import type { VisibilityResolver } from './visibility-resolver.ts';

export interface MessagingServiceDeps {
  readonly users: UserRepository;
  readonly messages: MessageRepository;
  readonly contacts: ContactRepository;
  readonly ignores: IgnoreRepository;
  readonly notifier: Notifier;
  readonly clock: Clock;
  readonly visibility: VisibilityResolver;
}

export interface SendOutcome {
  readonly message: ChatMessage;
  readonly autoResponse: AutoResponse | null;
}

export interface HistoryPage {
  readonly messages: ChatMessage[];
  readonly hasMore: boolean;
}

export class MessagingService {
  private readonly users: UserRepository;
  private readonly messages: MessageRepository;
  private readonly contacts: ContactRepository;
  private readonly ignores: IgnoreRepository;
  private readonly notifier: Notifier;
  private readonly clock: Clock;
  private readonly visibility: VisibilityResolver;

  constructor(deps: MessagingServiceDeps) {
    this.users = deps.users;
    this.messages = deps.messages;
    this.contacts = deps.contacts;
    this.ignores = deps.ignores;
    this.notifier = deps.notifier;
    this.clock = deps.clock;
    this.visibility = deps.visibility;
  }

  /**
   * Stores and delivers a message. When the recipient ignores the sender the
   * message is stored hidden and never delivered, and the sender still sees success.
   *
   * `deliveredOffline` follows the visibility rule, not the raw connection: a
   * message to a recipient who looks offline to the sender (invisible, ignoring,
   * or not yet authorized) is an offline message, as in the original client.
   * Anything else would reveal that the recipient is actually connected.
   *
   * `urgent` is presentation only and relayed as is, except to a recipient in
   * DND, who "selected not to accept urgent events".
   */
  send(from: Uin, to: Uin, text: string, urgent: boolean): SendOutcome {
    if (to === from) throw new DomainError('bad_request', 'You cannot send a message to yourself.');
    const recipient = requireUser(this.users, to);
    const hidden = this.ignores.isIgnoring(to, from);
    const visible = this.visibility.statusFor(from, to);
    const record = this.messages.create({
      fromUin: from,
      toUin: to,
      text,
      kind: 'normal',
      sentAt: this.clock.now().toISOString(),
      deliveredOffline: visible === 'offline',
      urgent: urgent && visible !== 'dnd',
      recipientHidden: hidden,
    });
    const message = toChatMessage(record);
    if (!hidden) this.notifier.notify(to, { type: 'message', message });
    return { message, autoResponse: isAwayStatus(visible) ? { status: visible, text: recipient.awayMessages[visible] } : null };
  }

  markRead(owner: Uin, from: Uin): number {
    return this.messages.markRead(owner, from, this.clock.now().toISOString());
  }

  /** One page of the conversation, oldest first within the page. */
  history(owner: Uin, other: Uin, beforeId: number | undefined, limit: number): HistoryPage {
    const newestFirst = this.messages.history(owner, other, beforeId ?? null, limit + 1);
    return {
      messages: newestFirst.slice(0, limit).reverse().map(toChatMessage),
      hasMore: newestFirst.length > limit,
    };
  }

  /** Unread messages for the owner, including those stored while offline, oldest first. */
  unread(owner: Uin): ChatMessage[] {
    return this.messages.listUnread(owner).map(toChatMessage);
  }

  /** Senders of the given unread messages who are not in the owner's contact list. */
  notInList(owner: Uin, unread: readonly ChatMessage[]): NotInListEntry[] {
    const senders = [...new Set(unread.map((message) => message.from))];
    return senders
      .filter((uin) => this.contacts.findActive(owner, uin) === null)
      .map((uin) => ({ uin, nickname: requireUser(this.users, uin).nickname }));
  }

}
