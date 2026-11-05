/**
 * Repository ports. Synchronous because the storage engine (node:sqlite) is;
 * multi-step writes go through `TransactionRunner`.
 */
import type { NoticeKind, Uin } from '@openicq/protocol';
import type {
  ContactRecord,
  DetailsCriteria,
  MessageRecord,
  NewContact,
  NewMessage,
  NewNotice,
  NewUser,
  NoticeRecord,
  ProfileFields,
  SessionRecord,
  SettingsFields,
  UserRecord,
} from './entities.ts';

export interface UserRepository {
  create(user: NewUser): UserRecord;
  findByUin(uin: Uin): UserRecord | null;
  /** Exact, case-insensitive match among users who do not hide their email. */
  findByVisibleEmail(email: string, limit: number): UserRecord[];
  /** Case-insensitive substring match, ANDed over the non-empty fields. */
  searchByDetails(criteria: DetailsCriteria, limit: number): UserRecord[];
  updateProfile(uin: Uin, profile: ProfileFields): UserRecord;
  updateSettings(uin: Uin, settings: SettingsFields): UserRecord;
  updatePassword(uin: Uin, passwordHash: string): void;
  touchLastSeen(uin: Uin, at: string): void;
}

export interface SessionRepository {
  create(session: SessionRecord): void;
  find(tokenHash: string): SessionRecord | null;
  touch(tokenHash: string, lastUsedAt: string, expiresAt: string): void;
  delete(tokenHash: string): void;
  deleteAllForUserExcept(uin: Uin, keepTokenHash: string): number;
  deleteExpired(now: string): number;
}

export interface ContactRepository {
  /** The owner's active (not removed) entry for the contact. */
  findActive(ownerUin: Uin, contactUin: Uin): ContactRecord | null;
  listActive(ownerUin: Uin): ContactRecord[];
  /** Active entries that have `contactUin` in their list: the watchers of that user. */
  listWatchers(contactUin: Uin): ContactRecord[];
  /** Inserts the entry, or revives a removed one with the new values. */
  upsertActive(contact: NewContact): ContactRecord;
  /** Marks an active entry as authorized; null when there is no active entry. */
  authorize(ownerUin: Uin, contactUin: Uin): ContactRecord | null;
  rename(ownerUin: Uin, contactUin: Uin, nickname: string): ContactRecord | null;
  /** Soft delete; false when there was no active entry. */
  remove(ownerUin: Uin, contactUin: Uin, at: string): boolean;
}

export interface MessageRepository {
  create(message: NewMessage): MessageRecord;
  /** Unread messages shown to the recipient, oldest first. */
  listUnread(toUin: Uin): MessageRecord[];
  markRead(toUin: Uin, fromUin: Uin, at: string): number;
  /**
   * The conversation between `viewer` and `other` as the viewer may see it,
   * newest first, strictly older than `beforeId` when given.
   */
  history(viewer: Uin, other: Uin, beforeId: number | null, limit: number): MessageRecord[];
}

export interface NoticeRepository {
  create(notice: NewNotice): NoticeRecord;
  findUnresolved(id: number, toUin: Uin): NoticeRecord | null;
  listUnresolved(toUin: Uin): NoticeRecord[];
  resolve(id: number, at: string): void;
  /** Resolves earlier unresolved notices of one kind from one sender. */
  resolvePending(toUin: Uin, fromUin: Uin, kind: NoticeKind, at: string): number;
}

export interface IgnoreRepository {
  /** Idempotent. */
  add(ownerUin: Uin, ignoredUin: Uin, at: string): void;
  remove(ownerUin: Uin, ignoredUin: Uin): boolean;
  isIgnoring(ownerUin: Uin, ignoredUin: Uin): boolean;
  list(ownerUin: Uin): Uin[];
}
