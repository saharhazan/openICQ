import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService, IDLE_TTL_MS, LOGIN_FAILED_MESSAGE, REMEMBER_TTL_MS } from '../../src/application/auth-service.ts';
import { DEFAULT_AWAY_MESSAGES, DEFAULT_PREFERENCES } from '../../src/domain/defaults.ts';
import type { SessionRecord } from '../../src/domain/entities.ts';
import { fixedClock, mockHasher, mockSessions, mockTokens, mockUsers, user, usersById } from './mocks.ts';

const UIN = 100000;
const NOW = '2026-11-04T12:00:00.000Z';

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    tokenHash: 'hash-1',
    uin: UIN,
    createdAt: NOW,
    expiresAt: new Date(Date.parse(NOW) + IDLE_TTL_MS).toISOString(),
    lastUsedAt: NOW,
    remember: false,
    ...overrides,
  };
}

describe('AuthService', () => {
  let users: ReturnType<typeof mockUsers>;
  let sessions: ReturnType<typeof mockSessions>;
  let hasher: ReturnType<typeof mockHasher>;
  let tokens: ReturnType<typeof mockTokens>;
  let clock: ReturnType<typeof fixedClock>;
  let service: AuthService;

  beforeEach(() => {
    users = mockUsers();
    sessions = mockSessions();
    hasher = mockHasher();
    tokens = mockTokens();
    clock = fixedClock(NOW);
    service = new AuthService({ users, sessions, hasher, tokens, clock });
    users.findByUin.mockImplementation(usersById(user(UIN, { nickname: 'Alice', passwordHash: 'real-hash' })));
    hasher.hash.mockResolvedValue('dummy-hash');
    tokens.issue.mockReturnValue({ token: 'token-1', tokenHash: 'hash-1' });
    tokens.hash.mockImplementation((token) => `hash-of-${token}`);
    sessions.create.mockReturnValue(undefined);
    sessions.deleteExpired.mockReturnValue(0);
  });

  describe('login', () => {
    it('gives the same generic error for an unknown UIN and still runs one hash check', async () => {
      hasher.verify.mockResolvedValue(false);
      await expect(service.login({ uin: 999999, password: 'secret', remember: false })).rejects.toMatchObject({
        code: 'unauthorized',
        message: LOGIN_FAILED_MESSAGE,
      });
      expect(hasher.verify).toHaveBeenCalledWith('secret', 'dummy-hash');
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it('gives the same generic error for a wrong password', async () => {
      hasher.verify.mockResolvedValue(false);
      await expect(service.login({ uin: UIN, password: 'wrong', remember: false })).rejects.toMatchObject({
        code: 'unauthorized',
        message: LOGIN_FAILED_MESSAGE,
      });
      expect(hasher.verify).toHaveBeenCalledWith('wrong', 'real-hash');
    });

    it('creates a 30-day session with a persistent cookie when "Save password" is on', async () => {
      hasher.verify.mockResolvedValue(true);
      const outcome = await service.login({ uin: UIN, password: 'right', remember: true });

      expect(outcome).toEqual({ token: 'token-1', session: { uin: UIN, nickname: 'Alice' }, cookieMaxAgeSeconds: REMEMBER_TTL_MS / 1000 });
      expect(sessions.create).toHaveBeenCalledWith({
        tokenHash: 'hash-1',
        uin: UIN,
        createdAt: NOW,
        lastUsedAt: NOW,
        expiresAt: new Date(Date.parse(NOW) + REMEMBER_TTL_MS).toISOString(),
        remember: true,
      });
    });

    it('creates a browser-session cookie with a 24h idle expiry otherwise', async () => {
      hasher.verify.mockResolvedValue(true);
      const outcome = await service.login({ uin: UIN, password: 'right', remember: false });
      expect(outcome.cookieMaxAgeSeconds).toBeNull();
      expect(sessions.create).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: session().expiresAt, remember: false }));
    });
  });

  describe('authenticate', () => {
    it('slides the idle expiry forward on use', () => {
      sessions.find.mockReturnValue(session());
      sessions.touch.mockReturnValue(undefined);
      clock.set('2026-11-04T18:00:00.000Z');

      expect(service.authenticate('token-1')).toEqual({ uin: UIN, nickname: 'Alice', tokenHash: 'hash-of-token-1' });
      expect(sessions.touch).toHaveBeenCalledWith(
        'hash-of-token-1',
        '2026-11-04T18:00:00.000Z',
        new Date(Date.parse('2026-11-04T18:00:00.000Z') + IDLE_TTL_MS).toISOString(),
      );
    });

    it('keeps the fixed expiry of a remembered session', () => {
      const remembered = session({ remember: true, expiresAt: '2026-12-01T00:00:00.000Z' });
      sessions.find.mockReturnValue(remembered);
      sessions.touch.mockReturnValue(undefined);
      service.authenticate('token-1');
      expect(sessions.touch).toHaveBeenCalledWith('hash-of-token-1', NOW, '2026-12-01T00:00:00.000Z');
    });

    it('drops an expired session', () => {
      sessions.find.mockReturnValue(session({ expiresAt: '2026-11-04T11:59:59.000Z' }));
      sessions.delete.mockReturnValue(undefined);
      expect(service.authenticate('token-1')).toBeNull();
      expect(sessions.delete).toHaveBeenCalledWith('hash-of-token-1');
    });

    it('ignores missing and oversized tokens without touching storage', () => {
      expect(service.authenticate(undefined)).toBeNull();
      expect(service.authenticate('x'.repeat(500))).toBeNull();
      expect(sessions.find).not.toHaveBeenCalled();
    });
  });

  it('registers with the central defaults', async () => {
    users.create.mockImplementation((input) => ({ ...input, uin: 100005, lastSeenAt: null }));
    const result = await service.register({
      nickname: 'Neo',
      firstName: '',
      lastName: '',
      email: '',
      password: 'secret1',
      authRequired: true,
      about: '',
    });
    expect(result).toEqual({ uin: 100005 });
    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({
        passwordHash: 'dummy-hash',
        webAware: false,
        hideEmail: false,
        preferences: DEFAULT_PREFERENCES,
        awayMessages: DEFAULT_AWAY_MESSAGES,
      }),
    );
  });

  describe('changePassword', () => {
    it('refuses a wrong current password', async () => {
      hasher.verify.mockResolvedValue(false);
      await expect(service.changePassword(UIN, 'keep', 'bad', 'newpass1')).rejects.toMatchObject({ code: 'forbidden' });
      expect(users.updatePassword).not.toHaveBeenCalled();
    });

    it('stores the new hash and revokes every other session', async () => {
      hasher.verify.mockResolvedValue(true);
      hasher.hash.mockResolvedValue('new-hash');
      users.updatePassword.mockReturnValue(undefined);
      sessions.deleteAllForUserExcept.mockReturnValue(2);

      await service.changePassword(UIN, 'keep', 'right', 'newpass1');

      expect(users.updatePassword).toHaveBeenCalledWith(UIN, 'new-hash');
      expect(sessions.deleteAllForUserExcept).toHaveBeenCalledWith(UIN, 'keep');
    });
  });
});
