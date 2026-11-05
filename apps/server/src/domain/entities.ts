/**
 * Persistent records as the application layer sees them. Repositories map
 * database rows to these shapes; nothing above the infrastructure layer knows
 * about columns.
 */
import type {
  AttachmentKindValue,
  ChatEventType,
  ChatType,
  FilePurpose,
  GroupInvitePolicy,
  MemberRole,
  Uin,
} from './vocabulary.ts';

/** The user-editable public details of an account. */
export interface ProfileFields {
  /** Lower case; null when the account has none. */
  readonly nickname: string | null;
  readonly firstName: string;
  readonly lastName: string;
  readonly about: string;
  readonly avatarFileId: number | null;
}

export interface UserRecord extends ProfileFields {
  readonly uin: Uin;
  /** Lower case; null when the account has none. */
  readonly email: string | null;
  readonly passwordHash: string;
  /** "Who can add me to groups". */
  readonly groupInvites: GroupInvitePolicy;
  readonly createdAt: string;
  /** Set when the last connection of the user closes. */
  readonly lastSeenAt: string | null;
}

export type NewUser = Omit<UserRecord, 'uin' | 'lastSeenAt'>;

export interface SessionRecord {
  readonly id: number;
  /** SHA-256 of the cookie token; the token itself is never stored. */
  readonly tokenHash: string;
  readonly uin: Uin;
  /** Short description from the user agent ("Chrome on macOS"). */
  readonly device: string;
  /** "Keep me signed in": a fixed 30-day lifetime instead of an idle timeout. */
  readonly persistent: boolean;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly expiresAt: string;
}

export type NewSession = Omit<SessionRecord, 'id'>;

/** The editable details of a group (empty for direct chats and Favorites). */
export interface GroupFields {
  readonly title: string;
  readonly about: string;
  readonly rules: string;
  readonly avatarFileId: number | null;
  readonly joinWithApproval: boolean;
  readonly isPublic: boolean;
}

export interface ChatRecord extends GroupFields {
  readonly id: number;
  readonly type: ChatType;
  /** Direct chats: both members, lower UIN first. Favorites: the owner twice. Null for groups. */
  readonly pair: readonly [Uin, Uin] | null;
  /** Groups only; replaced by "Generate new link". */
  readonly inviteToken: string | null;
  readonly createdAt: string;
  /** Last activity, for ordering the chat list. */
  readonly updatedAt: string;
}

export type NewChat = Omit<ChatRecord, 'id'>;

/** Everything about a membership that changes over time. */
export interface MemberState {
  readonly role: MemberRole;
  readonly lastReadId: number;
  readonly lastDeliveredId: number;
  /** "Clear history": messages up to this id are hidden for the member. */
  readonly clearedBeforeId: number;
  /** Position among the member's pinned chats; null when not pinned. */
  readonly pinOrder: number | null;
  readonly muted: boolean;
  readonly markedUnread: boolean;
  /** Not in the member's chat list (a direct chat before its first message, or after "Hide"). */
  readonly hidden: boolean;
}

export interface MemberRecord extends MemberState {
  readonly chatId: number;
  readonly uin: Uin;
  readonly joinedAt: string;
}

export interface NewMember {
  readonly chatId: number;
  readonly uin: Uin;
  readonly role: MemberRole;
  readonly joinedAt: string;
  readonly hidden: boolean;
  readonly pinOrder: number | null;
}

/** A group service message; the actor is the message sender. */
export interface StoredChatEvent {
  readonly type: ChatEventType;
  readonly target: Uin | null;
  readonly value: string | null;
}

export interface MessageRecord {
  readonly id: number;
  readonly chatId: number;
  readonly senderUin: Uin;
  readonly clientId: string | null;
  readonly text: string;
  readonly event: StoredChatEvent | null;
  readonly replyToId: number | null;
  /** The original author of a forwarded message. */
  readonly forwardedFrom: Uin | null;
  readonly editedAt: string | null;
  /** "Delete for all": a tombstone without text, files or reactions. */
  readonly deleted: boolean;
  readonly sentAt: string;
}

export type NewMessage = Omit<MessageRecord, 'id' | 'editedAt' | 'deleted'>;

export interface FileRecord {
  readonly id: number;
  readonly ownerUin: Uin;
  readonly purpose: FilePurpose;
  /** Random name of the file inside the files directory. */
  readonly storageName: string;
  /** The name the uploader gave, sanitized. */
  readonly name: string;
  readonly mime: string;
  readonly size: number;
  readonly kind: AttachmentKindValue;
  readonly width: number | null;
  readonly height: number | null;
  readonly createdAt: string;
}

export type NewFile = Omit<FileRecord, 'id'>;

export interface JoinRequestRecord {
  readonly chatId: number;
  readonly uin: Uin;
  readonly requestedAt: string;
}

/**
 * Search criteria for `user.search`; null fields are not used. There is no
 * email criterion: an exact email match would tell anyone whether an address
 * has an account (ICQ New searched by nickname or phone only).
 */
export interface UserSearchCriteria {
  readonly uin: Uin | null;
  /** Lower case, matched as a nickname prefix. */
  readonly nicknamePrefix: string;
  /** Matched anywhere in "first last". */
  readonly nameFragment: string;
  readonly excludeUin: Uin;
}
