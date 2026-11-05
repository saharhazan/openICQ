/**
 * Groups (plan rule 11): creating and editing, the member list, roles, the
 * invite link and leaving. Every structural change writes a service message;
 * every member receives it (the actor's devices included, since results do not carry them).
 */
import type { Member, RequestResult } from '@openicq/protocol';
import type { GroupFields, MessageRecord } from '../domain/entities.ts';
import { DomainError } from '../domain/errors.ts';
import type { Clock, InviteTokens, TransactionRunner } from '../domain/ports.ts';
import type {
  BlockRepository,
  ChatRepository,
  ContactRepository,
  FileRepository,
  MessageRepository,
  UserRepository,
} from '../domain/repositories.ts';
import { compareRoles, pickSuccessor, roleChangeRefusal } from '../domain/rules.ts';
import type { AssignableRole, Uin } from '../domain/vocabulary.ts';
import type { ChatEvents } from './chat-events.ts';
import {
  ServiceLog,
  addGroupMember,
  assertRoom,
  invitationAccepted,
  requireGroup,
  requireGroupAdmin,
} from './group-support.ts';
import { requireAvatarFile, requireUser, unique, type Actor } from './support.ts';
import type { ChatPayload, ViewBuilder } from './views.ts';

export interface GroupServiceDeps {
  readonly users: UserRepository;
  readonly chats: ChatRepository;
  readonly messages: MessageRepository;
  readonly files: FileRepository;
  readonly contacts: ContactRepository;
  readonly blocks: BlockRepository;
  readonly views: ViewBuilder;
  readonly events: ChatEvents;
  readonly inviteTokens: InviteTokens;
  readonly transactions: TransactionRunner;
  readonly clock: Clock;
}

export interface CreateGroupInput {
  readonly name: string;
  readonly about: string;
  readonly avatarFileId: number | null;
  readonly memberUins: readonly Uin[];
  readonly joinWithApproval: boolean;
  readonly public: boolean;
}

export interface UpdateGroupInput {
  readonly chatId: number;
  readonly name?: string | undefined;
  readonly about?: string | undefined;
  readonly rules?: string | undefined;
  readonly avatarFileId?: number | null | undefined;
  readonly joinWithApproval?: boolean | undefined;
  readonly public?: boolean | undefined;
}

export class GroupService {
  private readonly deps: GroupServiceDeps;

  constructor(deps: GroupServiceDeps) {
    this.deps = deps;
  }

  /** Initial members join subject to their "Who can add me to groups"; refused ones are left out. */
  create(actor: Actor, input: CreateGroupInput): ChatPayload {
    const { users, chats, messages, files, contacts, blocks, views, transactions } = this.deps;
    if (input.avatarFileId !== null) requireAvatarFile(files, actor.uin, input.avatarFileId);
    const invitees = unique(input.memberUins)
      .filter((uin) => uin !== actor.uin)
      .map((uin) => requireUser(users, uin));
    const at = this.now();
    const { chat, log } = transactions.run(() => {
      const created = chats.create({
        type: 'group',
        pair: null,
        title: input.name,
        about: input.about,
        rules: '',
        avatarFileId: input.avatarFileId,
        joinWithApproval: input.joinWithApproval,
        isPublic: input.public,
        inviteToken: this.deps.inviteTokens.issue(),
        createdAt: at,
        updatedAt: at,
      });
      chats.addMember({ chatId: created.id, uin: actor.uin, role: 'creator', joinedAt: at, hidden: false, pinOrder: null });
      const service = new ServiceLog({ messages, chats }, created.id, actor.uin, at);
      service.add('created', null, input.name);
      const accepted = invitees.filter((invitee) => invitationAccepted(contacts, blocks, actor.uin, invitee));
      assertRoom(chats, created.id, accepted.length);
      for (const invitee of accepted) {
        addGroupMember({ messages, chats }, created.id, invitee.uin, at);
        service.add('member_added', invitee.uin);
      }
      return { chat: created, log: service };
    });
    this.publish(log.records);
    const member = chats.findMember(chat.id, actor.uin);
    if (member === null) throw new Error(`Creator ${actor.uin} is missing from group ${chat.id}`);
    const row = views.chat(actor.uin, chat, member);
    const memberUins = chats.listMembers(chat.id).map((entry) => entry.uin);
    return { chat: row, users: views.users(actor.uin, memberUins) };
  }

  /** Admins edit the group. Making it private also replaces the invite link (as in ICQ New). */
  update(actor: Actor, input: UpdateGroupInput): ChatPayload {
    const { chats, messages, files, views, events, transactions } = this.deps;
    const { chat } = requireGroupAdmin(chats, input.chatId, actor.uin);
    if (input.avatarFileId !== undefined && input.avatarFileId !== null && input.avatarFileId !== chat.avatarFileId) {
      requireAvatarFile(files, actor.uin, input.avatarFileId);
    }
    const next: GroupFields = {
      title: input.name ?? chat.title,
      about: input.about ?? chat.about,
      rules: input.rules ?? chat.rules,
      avatarFileId: input.avatarFileId === undefined ? chat.avatarFileId : input.avatarFileId,
      joinWithApproval: input.joinWithApproval ?? chat.joinWithApproval,
      isPublic: input.public ?? chat.isPublic,
    };
    const at = this.now();
    const { updated, records } = transactions.run(() => {
      const saved = chats.updateGroup(chat.id, next);
      const service = new ServiceLog({ messages, chats }, chat.id, actor.uin, at);
      if (next.title !== chat.title) service.add('renamed', null, next.title);
      if (next.about !== chat.about) service.add('about_changed');
      if (next.rules !== chat.rules) service.add('rules_changed');
      if (next.avatarFileId !== chat.avatarFileId) service.add('avatar_changed');
      if (next.joinWithApproval !== chat.joinWithApproval) service.add('approval_changed', null, String(next.joinWithApproval));
      if (chat.isPublic && !next.isPublic) {
        chats.setInviteToken(chat.id, this.deps.inviteTokens.issue());
        service.add('link_changed');
      }
      return { updated: saved, records: service.records };
    });
    this.publish(records);
    // A change without a service message (only "Public chat" switched on) still reaches everyone.
    if (records.length === 0 && next.isPublic !== chat.isPublic) {
      events.toMembers(chat.id, (member) => ({ type: 'chat.updated', ...views.chatPayload(member.uin, updated, member) }), actor.connectionId);
    }
    const payload = views.chatPayloadById(actor.uin, chat.id);
    if (payload === null) throw new Error(`Admin ${actor.uin} is missing from group ${chat.id}`);
    return payload;
  }

  /** Creator, admins, members, read-only; each by seniority. */
  members(actor: Actor, chatId: number): RequestResult<'group.members'> {
    const { chats, views } = this.deps;
    requireGroup(chats, chatId, actor.uin);
    const members: Member[] = [...chats.listMembers(chatId)]
      .map((entry, seniority) => ({ entry, seniority }))
      .sort((a, b) => compareRoles(a.entry.role, b.entry.role) || a.seniority - b.seniority)
      .map(({ entry }) => ({ uin: entry.uin, role: entry.role, joinedAt: entry.joinedAt }));
    return { members, users: views.users(actor.uin, members.map((member) => member.uin)) };
  }

  /** Only the creator assigns and revokes admins; admins switch between member and read-only. */
  setRole(actor: Actor, chatId: number, uin: Uin, role: AssignableRole): void {
    const { chats, messages, transactions } = this.deps;
    const { member } = requireGroup(chats, chatId, actor.uin);
    if (uin === actor.uin) throw new DomainError('bad_request', 'You cannot change your own role.');
    const target = chats.findMember(chatId, uin);
    if (target === null) throw new DomainError('not_found', 'This user is not a member of the group.');
    const refusal = roleChangeRefusal(member.role, target.role, role);
    if (refusal !== null) throw new DomainError('forbidden', refusal);
    if (target.role === role) return;
    const records = transactions.run(() => {
      chats.setRole(chatId, uin, role);
      const service = new ServiceLog({ messages, chats }, chatId, actor.uin, this.now());
      service.add('role_changed', uin, role);
      return service.records;
    });
    this.publish(records);
  }

  /** "Generate new link": the old token stops working at once. */
  regenerateLink(actor: Actor, chatId: number): string {
    const { chats, messages, transactions } = this.deps;
    requireGroupAdmin(chats, chatId, actor.uin);
    const token = this.deps.inviteTokens.issue();
    const records = transactions.run(() => {
      chats.setInviteToken(chatId, token);
      const service = new ServiceLog({ messages, chats }, chatId, actor.uin, this.now());
      service.add('link_changed');
      return service.records;
    });
    this.publish(records);
    return token;
  }

  /**
   * Leaves the group. A leaving creator hands over to the most senior admin,
   * or to the most senior member when there is no admin.
   */
  leave(actor: Actor, chatId: number): void {
    const { chats, messages, transactions } = this.deps;
    const { member } = requireGroup(chats, chatId, actor.uin);
    const at = this.now();
    const records = transactions.run(() => {
      chats.removeMember(chatId, actor.uin);
      const service = new ServiceLog({ messages, chats }, chatId, actor.uin, at);
      service.add('member_left');
      if (member.role === 'creator') {
        const successor = pickSuccessor(chats.listMembers(chatId));
        if (successor !== null) {
          chats.setRole(chatId, successor.uin, 'creator');
          service.add('role_changed', successor.uin, 'creator');
        }
      }
      return service.records;
    });
    this.publish(records);
  }

  /** Pushes service messages to every member, the actor's own connections included. */
  publish(records: readonly MessageRecord[]): void {
    for (const record of records) this.deps.events.newMessage(record, null);
  }

  private now(): string {
    return this.deps.clock.now().toISOString();
  }
}
