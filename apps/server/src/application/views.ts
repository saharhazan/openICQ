/**
 * Builds protocol payloads for one viewer (plan rule 8). Reactions (`mine`),
 * chat rows (unread, read marks, pins, role) and user flags (contact, blocked,
 * presence) all depend on who looks, so every event is built per recipient.
 */
import {
  REACTIONS,
  type Attachment,
  type Chat,
  type GroupInfo,
  type Me,
  type Message,
  type Presence,
  type ReactionCount,
  type ReplyPreview,
  type User,
} from '@openicq/protocol';
import type { ChatRecord, FileRecord, MemberRecord, MessageRecord, UserRecord } from '../domain/entities.ts';
import type { PresenceRegistry } from '../domain/ports.ts';
import type {
  BlockRepository,
  ChatRepository,
  ContactRepository,
  JoinRequestRepository,
  MessageRepository,
  UserRepository,
} from '../domain/repositories.ts';
import { isAdminRole, peerOf } from '../domain/rules.ts';
import type { Uin } from '../domain/vocabulary.ts';
import { unique } from './support.ts';

/** "First characters of the quoted text". */
export const REPLY_PREVIEW_CHARS = 200;
/** What a user who blocked the viewer looks like to them. */
const HIDDEN_PRESENCE: Presence = Object.freeze({ online: false, lastSeen: null });

export interface ViewDeps {
  readonly users: UserRepository;
  readonly chats: ChatRepository;
  readonly messages: MessageRepository;
  readonly contacts: ContactRepository;
  readonly blocks: BlockRepository;
  readonly requests: JoinRequestRepository;
  readonly presence: PresenceRegistry;
}

/** A chat row and the users it refers to, as sent in `chat.updated` and request results. */
export interface ChatPayload {
  readonly chat: Chat;
  readonly users: User[];
}

export function toAttachment(file: FileRecord): Attachment {
  return {
    fileId: file.id,
    name: file.name,
    mime: file.mime,
    size: file.size,
    kind: file.kind,
    width: file.width,
    height: file.height,
  };
}

/** Every user a message mentions: sender, original author, quoted sender, event actor and target. */
export function messageRefs(message: Message): Uin[] {
  const refs: Uin[] = [message.sender];
  if (message.forwardedFrom !== null) refs.push(message.forwardedFrom);
  if (message.replyTo !== null) refs.push(message.replyTo.sender);
  if (message.event !== null && message.event.target !== null) refs.push(message.event.target);
  return refs;
}

export function chatRefs(chat: Chat): Uin[] {
  const refs: Uin[] = chat.peer === null ? [] : [chat.peer];
  return chat.lastMessage === null ? refs : [...refs, ...messageRefs(chat.lastMessage)];
}

export class ViewBuilder {
  private readonly deps: ViewDeps;

  constructor(deps: ViewDeps) {
    this.deps = deps;
  }

  me(user: UserRecord): Me {
    return {
      uin: user.uin,
      nickname: user.nickname,
      firstName: user.firstName,
      lastName: user.lastName,
      about: user.about,
      avatarFileId: user.avatarFileId,
      email: user.email ?? '',
    };
  }

  /** Online while connected; hidden entirely from people the subject blocked. */
  presence(viewer: Uin, subject: UserRecord): Presence {
    if (subject.uin !== viewer && this.deps.blocks.isBlocking(subject.uin, viewer)) return HIDDEN_PRESENCE;
    return { online: this.deps.presence.isOnline(subject.uin), lastSeen: subject.lastSeenAt };
  }

  user(viewer: Uin, subject: UserRecord): User {
    const other = subject.uin !== viewer;
    return {
      uin: subject.uin,
      nickname: subject.nickname,
      firstName: subject.firstName,
      lastName: subject.lastName,
      about: subject.about,
      avatarFileId: subject.avatarFileId,
      presence: this.presence(viewer, subject),
      isContact: other && this.deps.contacts.has(viewer, subject.uin),
      blocked: other && this.deps.blocks.isBlocking(viewer, subject.uin),
    };
  }

  /** The given users, once each, skipping UINs that no longer exist. */
  users(viewer: Uin, uins: Iterable<Uin>): User[] {
    const result: User[] = [];
    for (const uin of unique(uins)) {
      const record = this.deps.users.findByUin(uin);
      if (record !== null) result.push(this.user(viewer, record));
    }
    return result;
  }

  message(viewer: Uin, record: MessageRecord): Message {
    const [message] = this.messages(viewer, [record]);
    if (message === undefined) throw new Error(`Message ${record.id} produced no view`);
    return message;
  }

  /** Builds many messages with one query per kind of detail. */
  messages(viewer: Uin, records: readonly MessageRecord[]): Message[] {
    if (records.length === 0) return [];
    const ids = records.map((record) => record.id);
    const replyIds = unique(records.flatMap((record) => (record.replyToId === null ? [] : [record.replyToId])));
    const replies = new Map(this.deps.messages.findMany(replyIds).map((reply) => [reply.id, reply]));
    const files = this.deps.messages.attachmentsOf(unique([...ids, ...replyIds]));
    const reactions = this.reactionsByMessage(ids, viewer);
    return records.map((record) => {
      const reply = record.replyToId === null ? undefined : replies.get(record.replyToId);
      return {
        id: record.id,
        chatId: record.chatId,
        sender: record.senderUin,
        clientId: record.senderUin === viewer ? record.clientId : null,
        text: record.text,
        event: record.event === null ? null : { ...record.event, actor: record.senderUin },
        replyTo: reply === undefined ? null : this.replyPreview(reply, (files.get(reply.id) ?? []).length > 0),
        forwardedFrom: record.forwardedFrom,
        attachments: (files.get(record.id) ?? []).map(toAttachment),
        reactions: reactions.get(record.id) ?? [],
        editedAt: record.editedAt,
        deleted: record.deleted,
        sentAt: record.sentAt,
      };
    });
  }

  chat(viewer: Uin, chat: ChatRecord, member: MemberRecord): Chat {
    const last = this.deps.messages.lastVisible(chat.id, viewer, member.clearedBeforeId);
    const peer = chat.type === 'direct' && chat.pair !== null ? peerOf(chat.pair, viewer) : null;
    const peerMember = peer === null ? null : this.deps.chats.findMember(chat.id, peer);
    return {
      id: chat.id,
      type: chat.type,
      title: chat.type === 'group' ? chat.title : '',
      peer,
      avatarFileId: chat.type === 'group' ? chat.avatarFileId : null,
      group: chat.type === 'group' ? this.groupInfo(chat, member) : null,
      lastMessage: last === null ? null : this.message(viewer, last),
      unread: this.deps.messages.countUnread(chat.id, viewer, Math.max(member.lastReadId, member.clearedBeforeId)),
      markedUnread: member.markedUnread,
      lastReadId: member.lastReadId,
      peerDeliveredId: peerMember?.lastDeliveredId ?? 0,
      peerReadId: peerMember?.lastReadId ?? 0,
      pinned: member.pinOrder !== null,
      muted: member.muted,
      updatedAt: chat.updatedAt,
    };
  }

  /** The chat row and its users for a viewer who is a member. */
  chatPayload(viewer: Uin, chat: ChatRecord, member: MemberRecord): ChatPayload {
    const row = this.chat(viewer, chat, member);
    return { chat: row, users: this.users(viewer, chatRefs(row)) };
  }

  /** Same, looking the records up; null when the chat or the membership is gone. */
  chatPayloadById(viewer: Uin, chatId: number): ChatPayload | null {
    const chat = this.deps.chats.findById(chatId);
    const member = chat === null ? null : this.deps.chats.findMember(chatId, viewer);
    return chat === null || member === null ? null : this.chatPayload(viewer, chat, member);
  }

  private groupInfo(chat: ChatRecord, member: MemberRecord): GroupInfo {
    const admin = isAdminRole(member.role);
    return {
      about: chat.about,
      rules: chat.rules,
      joinWithApproval: chat.joinWithApproval,
      public: chat.isPublic,
      membersCount: this.deps.chats.countMembers(chat.id),
      myRole: member.role,
      inviteToken: admin ? chat.inviteToken : null,
      pendingRequests: admin ? this.deps.requests.count(chat.id) : 0,
    };
  }

  private replyPreview(reply: MessageRecord, hasAttachments: boolean): ReplyPreview {
    return {
      messageId: reply.id,
      sender: reply.senderUin,
      text: reply.deleted ? '' : reply.text.slice(0, REPLY_PREVIEW_CHARS),
      hasAttachments: !reply.deleted && hasAttachments,
      deleted: reply.deleted,
    };
  }

  /** Reaction counts per message, in the order of the six default reactions. */
  private reactionsByMessage(ids: readonly number[], viewer: Uin): Map<number, ReactionCount[]> {
    const result = new Map<number, ReactionCount[]>();
    const rows = [...this.deps.messages.reactionCounts(ids, viewer)].sort(
      (a, b) => REACTIONS.indexOf(a.reaction) - REACTIONS.indexOf(b.reaction),
    );
    for (const row of rows) {
      const entry: ReactionCount = { reaction: row.reaction, count: row.count, mine: row.mine };
      result.set(row.messageId, [...(result.get(row.messageId) ?? []), entry]);
    }
    return result;
  }
}
