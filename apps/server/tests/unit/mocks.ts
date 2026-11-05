/**
 * Strict mocks for the ports (London school): every method throws unless the
 * test configures it, so an unexpected collaboration fails loudly.
 */
import type { SettableStatus, Uin } from '@openicq/protocol';
import { vi, type Mocked } from 'vitest';
import { DEFAULT_AWAY_MESSAGES, DEFAULT_PREFERENCES } from '../../src/domain/defaults.ts';
import type { ContactRecord, UserRecord } from '../../src/domain/entities.ts';
import type { Clock, Notifier, PasswordHasher, PresenceRegistry, SessionTokens, TransactionRunner } from '../../src/domain/ports.ts';
import type {
  ContactRepository,
  IgnoreRepository,
  MessageRepository,
  NoticeRepository,
  SessionRepository,
  UserRepository,
} from '../../src/domain/repositories.ts';

function strictMock<T extends object>(name: string, methods: readonly (keyof T & string)[]): Mocked<T> {
  const mock: Record<string, unknown> = {};
  for (const method of methods) {
    mock[method] = vi.fn(() => {
      throw new Error(`Unexpected call to ${name}.${method}`);
    });
  }
  // Every method of T is present as a vi.fn, which is what Mocked<T> describes.
  return mock as Mocked<T>;
}

export const mockUsers = () =>
  strictMock<UserRepository>('users', [
    'create',
    'findByUin',
    'findByVisibleEmail',
    'searchByDetails',
    'updateProfile',
    'updateSettings',
    'updatePassword',
    'touchLastSeen',
  ]);

export const mockSessions = () =>
  strictMock<SessionRepository>('sessions', ['create', 'find', 'touch', 'delete', 'deleteAllForUserExcept', 'deleteExpired']);

export const mockContacts = () =>
  strictMock<ContactRepository>('contacts', [
    'findActive',
    'listActive',
    'listWatchers',
    'upsertActive',
    'authorize',
    'rename',
    'remove',
  ]);

export const mockMessages = () =>
  strictMock<MessageRepository>('messages', ['create', 'listUnread', 'markRead', 'history']);

export const mockNotices = () =>
  strictMock<NoticeRepository>('notices', ['create', 'findUnresolved', 'listUnresolved', 'resolve', 'resolvePending']);

export const mockIgnores = () => strictMock<IgnoreRepository>('ignores', ['add', 'remove', 'isIgnoring', 'list']);

export const mockHasher = () => strictMock<PasswordHasher>('hasher', ['hash', 'verify']);

export const mockTokens = () => strictMock<SessionTokens>('tokens', ['issue', 'hash']);

export function mockNotifier(): Mocked<Notifier> {
  return { notify: vi.fn() };
}

export function fixedClock(iso = '2026-11-04T12:00:00.000Z'): Clock & { set(iso: string): void } {
  let current = new Date(iso);
  return {
    now: () => new Date(current),
    set: (next: string) => {
      current = new Date(next);
    },
  };
}

/** A presence registry backed by a plain map, so tests state who is online. */
export function presenceOf(statuses: Record<Uin, SettableStatus>): PresenceRegistry {
  const map = new Map<Uin, SettableStatus>(Object.entries(statuses).map(([uin, status]) => [Number(uin), status]));
  return {
    statusOf: (uin) => map.get(uin) ?? null,
    set: (uin, status) => {
      map.set(uin, status);
    },
    remove: (uin) => {
      map.delete(uin);
    },
  };
}

export const immediateTransactions: TransactionRunner = { run: (work) => work() };

export function user(uin: Uin, overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    uin,
    nickname: `User${uin}`,
    firstName: '',
    lastName: '',
    email: '',
    gender: 'unspecified',
    age: null,
    country: '',
    city: '',
    homepage: '',
    about: '',
    passwordHash: 'stored-hash',
    authRequired: false,
    webAware: false,
    hideEmail: false,
    preferences: { ...DEFAULT_PREFERENCES },
    awayMessages: { ...DEFAULT_AWAY_MESSAGES },
    createdAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: null,
    ...overrides,
  };
}

export function contactEntry(ownerUin: Uin, contactUin: Uin, overrides: Partial<ContactRecord> = {}): ContactRecord {
  return {
    ownerUin,
    contactUin,
    nickname: `User${contactUin}`,
    authorized: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** A lookup that answers from a fixed list of users. */
export function usersById(...records: UserRecord[]): (uin: Uin) => UserRecord | null {
  return (uin) => records.find((record) => record.uin === uin) ?? null;
}
