/** Lookups and service messages shared by the group services (plan rule 11). */
import { LIMITS } from '@openicq/protocol';
import type { MemberRecord, MessageRecord, NewMessage, StoredChatEvent, UserRecord } from '../domain/entities.ts';
import { DomainError } from '../domain/errors.ts';
import type { BlockRepository, ChatRepository, ContactRepository, MessageRepository } from '../domain/repositories.ts';
import { groupInviteAllowed, isAdminRole } from '../domain/rules.ts';
import type { Uin } from '../domain/vocabulary.ts';
import { MESSAGES, requireMembership, type Membership } from './support.ts';

export const GROUP_FULL_MESSAGE = `The group is full (${LIMITS.groupMembersMax.toLocaleString('en-US')} members).`;
export const INVALID_LINK_MESSAGE = 'This invite link is invalid or was replaced by a new one.';

export function requireGroup(chats: ChatRepository, chatId: number, uin: Uin): Membership {
  const membership = requireMembership(chats, chatId, uin);
  if (membership.chat.type !== 'group') throw new DomainError('bad_request', MESSAGES.notGroup);
  return membership;
}

export function requireGroupAdmin(chats: ChatRepository, chatId: number, uin: Uin): Membership {
  const membership = requireGroup(chats, chatId, uin);
  if (!isAdminRole(membership.member.role)) throw new DomainError('forbidden', MESSAGES.adminsOnly);
  return membership;
}

/**
 * Adds a member whose read and delivery marks start at the current last
 * message: earlier history stays readable, but it does not count as unread.
 */
export function addGroupMember(
  repositories: { messages: MessageRepository; chats: ChatRepository },
  chatId: number,
  uin: Uin,
  at: string,
): MemberRecord {
  const added = repositories.chats.addMember({ chatId, uin, role: 'member', joinedAt: at, hidden: false, pinOrder: null });
  const lastId = repositories.messages.maxId(chatId);
  if (lastId === 0) return added;
  return repositories.chats.saveMember(chatId, uin, { ...added, lastReadId: lastId, lastDeliveredId: lastId });
}

/** Refuses growth past the group size limit. */
export function assertRoom(chats: ChatRepository, chatId: number, joining: number): void {
  if (chats.countMembers(chatId) + joining > LIMITS.groupMembersMax) throw new DomainError('conflict', GROUP_FULL_MESSAGE);
}

/**
 * "Who can add me to groups" of the invitee, with "contacts" meaning the
 * invitee saved the inviter as a contact. Someone who blocked the inviter always refuses.
 */
export function invitationAccepted(
  contacts: ContactRepository,
  blocks: BlockRepository,
  inviter: Uin,
  invitee: UserRecord,
): boolean {
  if (blocks.isBlocking(invitee.uin, inviter)) return false;
  return groupInviteAllowed(invitee.groupInvites, contacts.has(invitee.uin, inviter));
}

/** Writes the service messages of one structural change, in order, and marks the chat active. */
export class ServiceLog {
  private readonly messages: MessageRepository;
  private readonly chats: ChatRepository;
  private readonly chatId: number;
  private readonly actor: Uin;
  private readonly at: string;
  readonly records: MessageRecord[] = [];

  constructor(repositories: { messages: MessageRepository; chats: ChatRepository }, chatId: number, actor: Uin, at: string) {
    this.messages = repositories.messages;
    this.chats = repositories.chats;
    this.chatId = chatId;
    this.actor = actor;
    this.at = at;
  }

  add(type: StoredChatEvent['type'], target: Uin | null = null, value: string | null = null): MessageRecord {
    const message: NewMessage = {
      chatId: this.chatId,
      senderUin: this.actor,
      clientId: null,
      text: '',
      event: { type, target, value },
      replyToId: null,
      forwardedFrom: null,
      sentAt: this.at,
    };
    const record = this.messages.create(message);
    this.chats.touch(this.chatId, this.at);
    this.records.push(record);
    return record;
  }
}
