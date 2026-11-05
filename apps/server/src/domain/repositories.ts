/**
 * Repository ports. Synchronous because the storage engine (node:sqlite) is;
 * multi-step writes go through `TransactionRunner`.
 */
import type {
  ChatRecord,
  FileRecord,
  GroupFields,
  JoinRequestRecord,
  MemberRecord,
  MemberState,
  MessageRecord,
  NewChat,
  NewFile,
  NewMember,
  NewMessage,
  NewSession,
  NewUser,
  ProfileFields,
  SessionRecord,
  UserRecord,
  UserSearchCriteria,
} from './entities.ts';
import type { GroupInvitePolicy, MemberRole, Reaction, Uin } from './vocabulary.ts';

export interface UserRepository {
  create(user: NewUser): UserRecord;
  findByUin(uin: Uin): UserRecord | null;
  findByEmail(email: string): UserRecord | null;
  findByNickname(nickname: string): UserRecord | null;
  /** Exact UIN, nickname prefix, then name fragment; at most `limit`. */
  search(criteria: UserSearchCriteria, limit: number): UserRecord[];
  updateProfile(uin: Uin, profile: ProfileFields): UserRecord;
  updateGroupInvites(uin: Uin, policy: GroupInvitePolicy): UserRecord;
  updatePassword(uin: Uin, passwordHash: string): void;
  touchLastSeen(uin: Uin, at: string): void;
}

export interface SessionRepository {
  create(session: NewSession): SessionRecord;
  findByTokenHash(tokenHash: string): SessionRecord | null;
  findById(id: number): SessionRecord | null;
  /** Live sessions of the user, most recently used first. */
  listForUser(uin: Uin, now: string): SessionRecord[];
  touch(id: number, lastSeenAt: string, expiresAt: string): void;
  delete(id: number): boolean;
  /** Deletes every session of the user but one. Returns the ids deleted. */
  deleteOthers(uin: Uin, keepId: number): number[];
  deleteExpired(now: string): number;
}

export interface ChatRepository {
  create(chat: NewChat): ChatRecord;
  findById(id: number): ChatRecord | null;
  findByPair(low: Uin, high: Uin): ChatRecord | null;
  findFavorites(uin: Uin): ChatRecord | null;
  findByInviteToken(token: string): ChatRecord | null;
  updateGroup(id: number, fields: GroupFields): ChatRecord;
  setInviteToken(id: number, token: string): void;
  touch(id: number, at: string): void;

  addMember(member: NewMember): MemberRecord;
  findMember(chatId: number, uin: Uin): MemberRecord | null;
  /** Members in seniority order (who joined first). */
  listMembers(chatId: number): MemberRecord[];
  /** At most `limit` members for the read marks: the viewer, the direct peer, then the highest read marks. */
  listReadMarks(chatId: number, viewer: Uin, peer: Uin | null, limit: number): MemberRecord[];
  countMembers(chatId: number): number;
  /** The user's memberships; hidden ones only when asked. */
  listMemberships(uin: Uin, includeHidden: boolean): MemberRecord[];
  /** At most `limit` of the user's shown memberships: pinned in pin order, then the most recent activity. */
  listChatList(uin: Uin, limit: number): MemberRecord[];
  saveMember(chatId: number, uin: Uin, state: MemberState): MemberRecord;
  setRole(chatId: number, uin: Uin, role: MemberRole): void;
  /** Moves the delivery mark forward only. True when it moved. */
  advanceDelivered(chatId: number, uin: Uin, messageId: number): boolean;
  /** Shows the chat again to every member who hid it. */
  unhideAll(chatId: number): void;
  removeMember(chatId: number, uin: Uin): boolean;
  nextPinOrder(uin: Uin): number;
  /**
   * Everyone who shares a direct chat or a group with the user, counting a chat
   * only while neither side hides it: a direct chat the other side never saw
   * (opened with `chat.direct`, never written to) links nobody.
   */
  listCoMembers(uin: Uin): Uin[];
}

export interface ReactionCountRow {
  readonly messageId: number;
  readonly reaction: Reaction;
  readonly count: number;
  readonly mine: boolean;
}

export interface MessageRepository {
  create(message: NewMessage): MessageRecord;
  attachFiles(messageId: number, fileIds: readonly number[]): void;
  findById(id: number): MessageRecord | null;
  findMany(ids: readonly number[]): MessageRecord[];
  /** Messages of the chat the viewer still sees, newest first, strictly older than `beforeId`. */
  history(chatId: number, viewer: Uin, clearedBeforeId: number, beforeId: number | null, limit: number): MessageRecord[];
  lastVisible(chatId: number, viewer: Uin, clearedBeforeId: number): MessageRecord | null;
  /** Highest message id of the chat, 0 when it has none. */
  maxId(chatId: number): number;
  /** Rule 10: others' messages, not deleted, not hidden, newer than `afterId`. */
  countUnread(chatId: number, viewer: Uin, afterId: number): number;
  /** Ids the viewer still sees in `(fromId, toId]`. */
  visibleIds(chatId: number, viewer: Uin, fromId: number, toId: number): number[];
  /** Hidden ids among the given ones, for the viewer. */
  hiddenFor(viewer: Uin, ids: readonly number[]): Set<number>;
  hide(viewer: Uin, ids: readonly number[]): void;
  updateText(id: number, text: string, editedAt: string): MessageRecord;
  /** Delete for all: clears text, files and reactions. */
  tombstone(id: number): MessageRecord;
  attachmentsOf(ids: readonly number[]): Map<number, FileRecord[]>;
  setReaction(messageId: number, uin: Uin, reaction: Reaction, at: string): void;
  removeReaction(messageId: number, uin: Uin): void;
  reactionCounts(ids: readonly number[], viewer: Uin): ReactionCountRow[];
}

export interface FileRepository {
  create(file: NewFile): FileRecord;
  findById(id: number): FileRecord | null;
  /**
   * True when the user is a member of a chat with a message carrying the file
   * that they still see: not deleted for all, not deleted for them, not cleared.
   */
  isSharedWith(fileId: number, uin: Uin): boolean;
  /** Total size of the user's stored files in bytes. */
  bytesOwnedBy(owner: Uin): number;
  /** Total size of every stored file in bytes. */
  totalBytes(): number;
  /** Deletes those of the files that no message and no avatar uses. Returns the deleted rows. */
  deleteUnreferenced(ids: readonly number[]): FileRecord[];
  /** Deletes up to `limit` files created before `createdBefore` that no message and no avatar uses. */
  deleteUnreferencedBefore(createdBefore: string, limit: number): FileRecord[];
}

export interface ContactRepository {
  /** Idempotent. */
  add(owner: Uin, contact: Uin, at: string): void;
  remove(owner: Uin, contact: Uin): boolean;
  has(owner: Uin, contact: Uin): boolean;
  list(owner: Uin): Uin[];
  /** Everyone who saved the user as a contact. */
  ownersOf(contact: Uin): Uin[];
}

export interface BlockRepository {
  /** Idempotent. */
  add(owner: Uin, blocked: Uin, at: string): void;
  remove(owner: Uin, blocked: Uin): boolean;
  isBlocking(owner: Uin, blocked: Uin): boolean;
  list(owner: Uin): Uin[];
}

export interface JoinRequestRepository {
  /** Idempotent: an existing request keeps its time. */
  create(request: JoinRequestRecord): void;
  find(chatId: number, uin: Uin): JoinRequestRecord | null;
  list(chatId: number): JoinRequestRecord[];
  count(chatId: number): number;
  delete(chatId: number, uin: Uin): boolean;
}
