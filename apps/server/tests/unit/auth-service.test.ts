import { beforeEach, describe, expect, it } from 'vitest';
import {
  AuthService,
  IDLE_TTL_MS,
  LOGIN_FAILED_MESSAGE,
  PERSISTENT_TTL_MS,
  TOUCH_INTERVAL_MS,
} from '../../src/application/auth-service.ts';
import { MESSAGES } from '../../src/application/support.ts';
import type { SessionRecord } from '../../src/domain/entities.ts';
import {
  fixedClock,
  immediateTransactions,
  member,
  mockChats,
  mockHasher,
  mockSessions,
  mockTokens,
  mockUsers,
  user,
} from './mocks.ts';

const UIN = 100000;
const NOW = '2026-11-05T12:00:00.000Z';

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 7,
    tokenHash: 'hash-1',
    uin: UIN,
    device: 'Chrome on macOS',
    persistent: false,
    createdAt: NOW,
    lastSeenAt: NOW,
    expiresAt: new Date(Date.parse(NOW) + IDLE_TTL_MS).toISOString(),
    ...overrides,
  };
}

describe('AuthService', () => {
  let users: ReturnType<typeof mockUsers>;
  let sessions: ReturnType<typeof mockSessions>;
  let chats: ReturnType<typeof mockChats>;
  let hasher: ReturnType<typeof mockHasher>;
  let tokens: ReturnType<typeof mockTokens>;
  let clock: ReturnType<typeof fixedClock>;
  let service: AuthService;

  beforeEach(() => {
    users = mockUsers();
    sessions = mockSessions();
    chats = mockChats();
    hasher = mockHasher();
    tokens = mockTokens();
    clock = fixedClock(NOW);
    service = new AuthService({ users, sessions, chats, hasher, tokens, transactions: immediateTransactions, clock });
    hasher.hash.mockResolvedValue('new-hash');
    tokens.issue.mockReturnValue({ token: 'token-1', tokenHash: 'hash-1' });
    tokens.hash.mockImplementation((token) => `hash-of-${token}`);
  });

  describe('register', () => {
    it('creates the user and a pinned Favorites chat', async () => {
      users.findByNickname.mockReturnValue(null);
      users.findByEmail.mockReturnValue(null);
      users.create.mockImplementation((input) => ({ ...input, uin: UIN, lastSeenAt: null }));
      chats.create.mockImplementation((input) => ({ ...input, id: 1 }));
      chats.addMember.mockImplementation((input) => member(input.chatId, input.uin, { pinOrder: input.pinOrder }));

      const result = await service.register({ firstName: 'Alice', lastName: '', nickname: 'alice', email: '', password: 'secret1' });
      expect(result).toEqual({ uin: UIN });
      expect(users.create).toHaveBeenCalledWith(expect.objectContaining({ email: null, passwordHash: 'new-hash', groupInvites: 'everybody' }));
      expect(chats.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'favorites', pair: [UIN, UIN] }));
      expect(chats.addMember).toHaveBeenCalledWith(expect.objectContaining({ chatId: 1, uin: UIN, pinOrder: 1, hidden: false }));
    });

    it('refuses a taken nickname before writing anything', async () => {
      users.findByNickname.mockReturnValue(user(UIN + 1));
      await expect(
        service.register({ firstName: 'A', lastName: '', nickname: 'taken', email: '', password: 'secret1' }),
      ).rejects.toMatchObject({ code: 'conflict', message: MESSAGES.nicknameTaken });
      expect(users.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('finds the account by ICQ number or by email and never by anything else', async () => {
      users.findByUin.mockReturnValue(null);
      users.findByEmail.mockReturnValue(null);
      hasher.verify.mockResolvedValue(false);
      for (const login of ['100000', 'Alice@Example.com', 'alice', '42']) {
        await expect(service.login({ login, password: 'x', keepSignedIn: true, device: 'd' })).rejects.toMatchObject({
          code: 'unauthorized',
          message: LOGIN_FAILED_MESSAGE,
        });
      }
      expect(users.findByUin).toHaveBeenCalledTimes(1);
      expect(users.findByUin).toHaveBeenCalledWith(UIN);
      expect(users.findByEmail).toHaveBeenCalledWith('alice@example.com');
      // Unknown accounts still pay for a hash check, against the dummy hash.
      expect(hasher.verify).toHaveBeenCalledWith('x', 'new-hash');
    });

    it('creates a persistent 30-day session for keepSignedIn', async () => {
      users.findByUin.mockReturnValue(user(UIN));
      hasher.verify.mockResolvedValue(true);
      sessions.deleteExpired.mockReturnValue(0);
      sessions.create.mockImplementation((input) => ({ ...input, id: 3 }));
      const outcome = await service.login({ login: String(UIN), password: 'secret1', keepSignedIn: true, device: 'Chrome on macOS' });
      expect(outcome).toEqual({ token: 'token-1', uin: UIN, cookieMaxAgeSeconds: PERSISTENT_TTL_MS / 1000 });
      expect(sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          persistent: true,
          device: 'Chrome on macOS',
          expiresAt: new Date(Date.parse(NOW) + PERSISTENT_TTL_MS).toISOString(),
        }),
      );
    });

    it('creates a browser-session cookie otherwise', async () => {
      users.findByUin.mockReturnValue(user(UIN));
      hasher.verify.mockResolvedValue(true);
      sessions.deleteExpired.mockReturnValue(0);
      sessions.create.mockImplementation((input) => ({ ...input, id: 3 }));
      const outcome = await service.login({ login: String(UIN), password: 'secret1', keepSignedIn: false, device: 'd' });
      expect(outcome.cookieMaxAgeSeconds).toBeNull();
    });
  });

  describe('authenticate', () => {
    it('drops expired sessions', () => {
      sessions.findByTokenHash.mockReturnValue(session({ expiresAt: NOW }));
      sessions.delete.mockReturnValue(true);
      expect(service.authenticate('token')).toBeNull();
      expect(sessions.delete).toHaveBeenCalledWith(7);
    });

    it('records activity at most once a minute and slides the idle expiry', () => {
      sessions.findByTokenHash.mockReturnValue(session());
      expect(service.authenticate('token')).toEqual({ uin: UIN, sessionId: 7 });
      expect(sessions.touch).not.toHaveBeenCalled();

      clock.set(new Date(Date.parse(NOW) + TOUCH_INTERVAL_MS).toISOString());
      sessions.touch.mockReturnValue(undefined);
      service.authenticate('token');
      const later = Date.parse(NOW) + TOUCH_INTERVAL_MS;
      expect(sessions.touch).toHaveBeenCalledWith(7, new Date(later).toISOString(), new Date(later + IDLE_TTL_MS).toISOString());
    });

    it('ignores empty and oversized tokens without a lookup', () => {
      expect(service.authenticate(undefined)).toBeNull();
      expect(service.authenticate('x'.repeat(200))).toBeNull();
      expect(sessions.findByTokenHash).not.toHaveBeenCalled();
    });
  });

  describe('sessions', () => {
    it('refuses to close the current session or a foreign one', () => {
      expect(() => service.closeSession(UIN, 7, 7)).toThrow(/current session/);
      sessions.findById.mockReturnValue(session({ id: 8, uin: UIN + 1 }));
      expect(() => service.closeSession(UIN, 7, 8)).toThrow('Session not found.');
    });

    it('changing the password closes every other session', async () => {
      users.findByUin.mockReturnValue(user(UIN));
      hasher.verify.mockResolvedValue(true);
      users.updatePassword.mockReturnValue(undefined);
      sessions.deleteOthers.mockReturnValue([8, 9]);
      expect(await service.changePassword(UIN, 7, 'old', 'newpass')).toEqual([8, 9]);
      expect(users.updatePassword).toHaveBeenCalledWith(UIN, 'new-hash');
      expect(sessions.deleteOthers).toHaveBeenCalledWith(UIN, 7);
    });
  });
});
