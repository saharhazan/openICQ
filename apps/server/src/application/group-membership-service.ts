/**
 * Group membership (plan rule 11): adding and removing members, the invite
 * link preview and join, and join requests for groups with "Join with Approval".
 */
import type { Chat, GroupPreview, RequestResult } from '@openicq/protocol';
import type { ChatRecord } from '../domain/entities.ts';
import { DomainError } from '../domain/errors.ts';
import type { Clock, TransactionRunner } from '../domain/ports.ts';
import type {
  BlockRepository,
  ChatRepository,
  ContactRepository,
  JoinRequestRepository,
  MessageRepository,
  UserRepository,
} from '../domain/repositories.ts';
import { canRemoveMember } from '../domain/rules.ts';
import type { Uin } from '../domain/vocabulary.ts';
import type { ChatEvents } from './chat-events.ts';
import type { GroupService } from './group-service.ts';
import {
  INVALID_LINK_MESSAGE,
  ServiceLog,
  addGroupMember,
  assertRoom,
  invitationAccepted,
  requireGroupAdmin,
} from './group-support.ts';
import { requireUser, unique, type Actor } from './support.ts';
import type { ViewBuilder } from './views.ts';

export interface GroupMembershipServiceDeps {
  readonly users: UserRepository;
  readonly chats: ChatRepository;
  readonly messages: MessageRepository;
  readonly contacts: ContactRepository;
  readonly blocks: BlockRepository;
  readonly requests: JoinRequestRepository;
  readonly views: ViewBuilder;
  readonly events: ChatEvents;
  readonly groups: GroupService;
  readonly transactions: TransactionRunner;
  readonly clock: Clock;
}

export interface AddMembersOutcome {
  readonly added: Uin[];
  readonly refused: Uin[];
}

export class GroupMembershipService {
  private readonly deps: GroupMembershipServiceDeps;

  constructor(deps: GroupMembershipServiceDeps) {
    this.deps = deps;
  }

  /**
   * Admins add members, subject to each invitee's "Who can add me to groups".
   * Users already in the group appear in neither list.
   */
  addMembers(actor: Actor, chatId: number, uins: readonly Uin[]): AddMembersOutcome {
    const { users, chats, messages, contacts, blocks, requests, transactions } = this.deps;
    requireGroupAdmin(chats, chatId, actor.uin);
    const candidates = unique(uins)
      .map((uin) => requireUser(users, uin))
      .filter((user) => user.uin !== actor.uin && chats.findMember(chatId, user.uin) === null);
    const added = candidates.filter((user) => invitationAccepted(contacts, blocks, actor.uin, user)).map((user) => user.uin);
    const refused = candidates.map((user) => user.uin).filter((uin) => !added.includes(uin));
    if (added.length === 0) return { added, refused };
    const at = this.now();
    const records = transactions.run(() => {
      assertRoom(chats, chatId, added.length);
      const service = new ServiceLog({ messages, chats }, chatId, actor.uin, at);
      for (const uin of added) {
        addGroupMember({ messages, chats }, chatId, uin, at);
        requests.delete(chatId, uin);
        service.add('member_added', uin);
      }
      return service.records;
    });
    this.deps.groups.publish(records);
    return { added, refused };
  }

  /** The creator removes anyone; admins remove members and read-only members. */
  removeMember(actor: Actor, chatId: number, uin: Uin): void {
    const { chats, messages, transactions, events } = this.deps;
    const { member } = requireGroupAdmin(chats, chatId, actor.uin);
    if (uin === actor.uin) throw new DomainError('bad_request', 'Use "Leave and delete" to leave the group.');
    const target = chats.findMember(chatId, uin);
    if (target === null) throw new DomainError('not_found', 'This user is not a member of the group.');
    if (!canRemoveMember(member.role, target.role)) {
      throw new DomainError('forbidden', 'Only the creator can remove admins.');
    }
    const records = transactions.run(() => {
      chats.removeMember(chatId, uin);
      const service = new ServiceLog({ messages, chats }, chatId, actor.uin, this.now());
      service.add('member_removed', uin);
      return service.records;
    });
    this.deps.groups.publish(records);
    events.toUser(uin, { type: 'chat.removed', chatId });
  }

  /** What an invite link opens, before joining. */
  preview(actor: Actor, token: string): GroupPreview {
    const { chats, requests } = this.deps;
    const chat = this.chatForToken(token);
    const state =
      chats.findMember(chat.id, actor.uin) !== null
        ? 'member'
        : requests.find(chat.id, actor.uin) !== null
          ? 'pending'
          : 'none';
    return {
      chatId: chat.id,
      title: chat.title,
      about: chat.about,
      avatarFileId: chat.avatarFileId,
      membersCount: chats.countMembers(chat.id),
      joinWithApproval: chat.joinWithApproval,
      state,
    };
  }

  /** Joins by link, or files a join request when the group needs approval. */
  join(actor: Actor, token: string): RequestResult<'group.join'> {
    const { chats, messages, requests, events, transactions } = this.deps;
    const chat = this.chatForToken(token);
    if (chats.findMember(chat.id, actor.uin) !== null) return { state: 'member', chat: this.rowFor(actor.uin, chat) };
    if (chat.joinWithApproval) {
      if (requests.find(chat.id, actor.uin) === null) {
        requests.create({ chatId: chat.id, uin: actor.uin, requestedAt: this.now() });
        events.chatUpdatedToAdmins(chat.id);
      }
      return { state: 'pending', chat: null };
    }
    const at = this.now();
    const records = transactions.run(() => {
      assertRoom(chats, chat.id, 1);
      addGroupMember({ messages, chats }, chat.id, actor.uin, at);
      requests.delete(chat.id, actor.uin);
      const service = new ServiceLog({ messages, chats }, chat.id, actor.uin, at);
      service.add('joined_by_link');
      return service.records;
    });
    this.deps.groups.publish(records);
    return { state: 'member', chat: this.rowFor(actor.uin, chat) };
  }

  requests(actor: Actor, chatId: number): RequestResult<'group.requests'> {
    const { chats, requests, views } = this.deps;
    requireGroupAdmin(chats, chatId, actor.uin);
    const pending = requests.list(chatId).map((request) => ({ uin: request.uin, requestedAt: request.requestedAt }));
    return { requests: pending, users: views.users(actor.uin, pending.map((request) => request.uin)) };
  }

  /** Approving adds the user (a `member_added` service message); either way the admins see the new count. */
  resolveRequest(actor: Actor, chatId: number, uin: Uin, approve: boolean): void {
    const { chats, messages, requests, events, transactions } = this.deps;
    requireGroupAdmin(chats, chatId, actor.uin);
    if (requests.find(chatId, uin) === null) throw new DomainError('not_found', 'This join request no longer exists.');
    if (!approve) {
      requests.delete(chatId, uin);
      events.chatUpdatedToAdmins(chatId);
      return;
    }
    const at = this.now();
    const records = transactions.run(() => {
      assertRoom(chats, chatId, 1);
      requests.delete(chatId, uin);
      addGroupMember({ messages, chats }, chatId, uin, at);
      const service = new ServiceLog({ messages, chats }, chatId, actor.uin, at);
      service.add('member_added', uin);
      return service.records;
    });
    this.deps.groups.publish(records);
    events.chatUpdatedToAdmins(chatId);
  }

  private chatForToken(token: string): ChatRecord {
    const chat = this.deps.chats.findByInviteToken(token);
    if (chat === null) throw new DomainError('not_found', INVALID_LINK_MESSAGE);
    return chat;
  }

  private rowFor(uin: Uin, chat: ChatRecord): Chat | null {
    return this.deps.views.chatPayloadById(uin, chat.id)?.chat ?? null;
  }

  private now(): string {
    return this.deps.clock.now().toISOString();
  }
}
