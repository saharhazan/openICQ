/**
 * Persistent records as the application layer sees them. Repositories map
 * database rows to these shapes; nothing above the infrastructure layer knows
 * about columns.
 */
import type { AwayMessages, Gender, MessageKind, NoticeKind, Preferences, Uin } from '@openicq/protocol';

/** The user-editable public details of an account. */
export interface ProfileFields {
  readonly nickname: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly gender: Gender;
  readonly age: number | null;
  readonly country: string;
  readonly city: string;
  readonly homepage: string;
  readonly about: string;
}

/** The private settings of an account. */
export interface SettingsFields {
  readonly authRequired: boolean;
  readonly webAware: boolean;
  readonly hideEmail: boolean;
  readonly preferences: Preferences;
  readonly awayMessages: AwayMessages;
}

export interface UserRecord extends ProfileFields, SettingsFields {
  readonly uin: Uin;
  readonly passwordHash: string;
  readonly createdAt: string;
  readonly lastSeenAt: string | null;
}

export type NewUser = Omit<UserRecord, 'uin' | 'lastSeenAt'>;

export interface SessionRecord {
  readonly tokenHash: string;
  readonly uin: Uin;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly lastUsedAt: string;
  /** "Save password": a persistent cookie with a fixed 30-day lifetime. */
  readonly remember: boolean;
}

/** One row of an owner's contact list. `nickname` is the owner's alias. */
export interface ContactRecord {
  readonly ownerUin: Uin;
  readonly contactUin: Uin;
  readonly nickname: string;
  readonly authorized: boolean;
  readonly createdAt: string;
}

export interface NewContact {
  readonly ownerUin: Uin;
  readonly contactUin: Uin;
  readonly nickname: string;
  readonly authorized: boolean;
  readonly createdAt: string;
}

export interface MessageRecord {
  readonly id: number;
  readonly fromUin: Uin;
  readonly toUin: Uin;
  readonly text: string;
  readonly kind: MessageKind;
  readonly sentAt: string;
  readonly deliveredOffline: boolean;
  /** "Send Urgent"; presentation only, the server stores and relays it. */
  readonly urgent: boolean;
  readonly readAt: string | null;
  /** True when the recipient ignores the sender: stored, never shown to the recipient. */
  readonly recipientHidden: boolean;
}

export type NewMessage = Omit<MessageRecord, 'id' | 'readAt'>;

export interface NoticeRecord {
  readonly id: number;
  readonly toUin: Uin;
  readonly kind: NoticeKind;
  readonly fromUin: Uin;
  /** Current nickname of the sender, joined at read time. */
  readonly fromNickname: string;
  readonly reason: string;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
}

export interface NewNotice {
  readonly toUin: Uin;
  readonly kind: NoticeKind;
  readonly fromUin: Uin;
  readonly reason: string;
  readonly createdAt: string;
}

/** Search criteria for "Find by details"; empty fields are not used. */
export interface DetailsCriteria {
  readonly nickname: string;
  readonly firstName: string;
  readonly lastName: string;
}
