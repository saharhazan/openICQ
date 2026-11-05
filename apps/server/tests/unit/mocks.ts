/**
 * Strict mocks for the ports (London school): every method throws unless the
 * test configures it, so an unexpected collaboration fails loudly.
 */
import { vi, type Mocked } from 'vitest';
import type { ChatRecord, FileRecord, MemberRecord, MessageRecord, UserRecord } from '../../src/domain/entities.ts';
import type { Clock, Notifier, PasswordHasher, SessionTokens, TransactionRunner } from '../../src/domain/ports.ts';
import type {
  BlockRepository,
  ChatRepository,
  ContactRepository,
  FileRepository,
  MessageRepository,
  SessionRepository,
  UserRepository,
} from '../../src/domain/repositories.ts';
import type { Uin } from '../../src/domain/vocabulary.ts';

export function strictMock<T extends object>(name: string, methods: readonly (keyof T & string)[]): Mocked<T> {
  const mock: Record<string, unknown> = {};
  for (const method of methods) {
    mock[method] = vi.fn(() => {
      throw new Error(`Unexpected call to ${name}.${method}`);
    });
  }
  // Every listed method of T is present as a vi.fn, which is what Mocked<T> describes.
  return mock as Mocked<T>;
}

export const mockUsers = () =>
  strictMock<UserRepository>('users', [
    'create',
    'findByUin',
    'findByEmail',
    'findByNickname',
    'search',
    'updateProfile',
    'updateGroupInvites',
    'updatePassword',
    'touchLastSeen',
  ]);

export const mockSessions = () =>
  strictMock<SessionRepository>('sessions', [
    'create',
    'findByTokenHash',
    'findById',
    'listForUser',
    'touch',
    'delete',
    'deleteOthers',
    'deleteExpired',
  ]);

export const mockChats = () =>
  strictMock<ChatRepository>('chats', [
    'create',
    'findById',
    'findByPair',
    'findFavorites',
    'findByInviteToken',
    'updateGroup',
    'setInviteToken',
    'touch',
    'addMember',
    'findMember',
    'listMembers',
    'listReadMarks',
    'countMembers',
    'listMemberships',
    'listChatList',
    'saveMember',
    'setRole',
    'advanceDelivered',
    'unhideAll',
    'removeMember',
    'nextPinOrder',
    'listCoMembers',
  ]);

export const mockMessages = () =>
  strictMock<MessageRepository>('messages', [
    'create',
    'attachFiles',
    'findById',
    'findMany',
    'history',
    'lastVisible',
    'maxId',
    'countUnread',
    'visibleIds',
    'hiddenFor',
    'hide',
    'updateText',
    'tombstone',
    'attachmentsOf',
    'setReaction',
    'removeReaction',
    'reactionCounts',
  ]);

export const mockFiles = () =>
  strictMock<FileRepository>('files', [
    'create',
    'findById',
    'isSharedWith',
    'bytesOwnedBy',
    'totalBytes',
    'deleteUnreferenced',
    'deleteUnreferencedBefore',
  ]);
export const mockContacts = () => strictMock<ContactRepository>('contacts', ['add', 'remove', 'has', 'list', 'ownersOf']);
export const mockBlocks = () => strictMock<BlockRepository>('blocks', ['add', 'remove', 'isBlocking', 'list']);
export const mockHasher = () => strictMock<PasswordHasher>('hasher', ['hash', 'verify']);
export const mockTokens = () => strictMock<SessionTokens>('tokens', ['issue', 'hash']);
export const mockNotifier = () => strictMock<Notifier>('notifier', ['notify']);

export const immediateTransactions: TransactionRunner = { run: (work) => work() };

export function fixedClock(iso = '2026-11-05T12:00:00.000Z'): Clock & { set(iso: string): void } {
  let current = new Date(iso);
  return {
    now: () => new Date(current),
    set: (next: string) => {
      current = new Date(next);
    },
  };
}

export function user(uin: Uin, overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    uin,
    nickname: null,
    firstName: `User${uin}`,
    lastName: '',
    about: '',
    avatarFileId: null,
    email: null,
    passwordHash: 'stored-hash',
    groupInvites: 'everybody',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: null,
    ...overrides,
  };
}

export function chat(id: number, overrides: Partial<ChatRecord> = {}): ChatRecord {
  return {
    id,
    type: 'direct',
    pair: [100000, 100001],
    title: '',
    about: '',
    rules: '',
    avatarFileId: null,
    joinWithApproval: false,
    isPublic: false,
    inviteToken: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function member(chatId: number, uin: Uin, overrides: Partial<MemberRecord> = {}): MemberRecord {
  return {
    chatId,
    uin,
    role: 'member',
    joinedAt: '2026-01-01T00:00:00.000Z',
    lastReadId: 0,
    lastDeliveredId: 0,
    clearedBeforeId: 0,
    pinOrder: null,
    muted: false,
    markedUnread: false,
    hidden: false,
    ...overrides,
  };
}

export function message(id: number, chatId: number, senderUin: Uin, overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id,
    chatId,
    senderUin,
    clientId: null,
    text: `message ${id}`,
    event: null,
    replyToId: null,
    forwardedFrom: null,
    editedAt: null,
    deleted: false,
    sentAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function file(id: number, ownerUin: Uin, overrides: Partial<FileRecord> = {}): FileRecord {
  return {
    id,
    ownerUin,
    purpose: 'attachment',
    storageName: '0123456789abcdef0123456789abcdef',
    name: 'file.bin',
    mime: 'application/octet-stream',
    size: 10,
    kind: 'file',
    width: null,
    height: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
