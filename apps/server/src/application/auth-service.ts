/** Registration, sign-in sessions and password changes. */
import type { SessionInfo, Uin, registerBodySchema } from '@openicq/protocol';
import type { z } from 'zod';
import { DEFAULT_AWAY_MESSAGES, DEFAULT_HIDE_EMAIL, DEFAULT_PREFERENCES, DEFAULT_WEB_AWARE } from '../domain/defaults.ts';
import { DomainError } from '../domain/errors.ts';
import type { Clock, PasswordHasher, SessionTokens } from '../domain/ports.ts';
import type { SessionRepository, UserRepository } from '../domain/repositories.ts';
import { requireUser } from './support.ts';

/** "Save password" keeps the session for 30 days. */
export const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Without "Save password" the session ends after 24 hours without use. */
export const IDLE_TTL_MS = 24 * 60 * 60 * 1000;
/** The same text for every sign-in failure, so it never reveals whether a UIN exists. */
export const LOGIN_FAILED_MESSAGE = 'Incorrect UIN or password.';
/** Longest cookie value worth hashing; real tokens are 43 characters. */
const MAX_TOKEN_LENGTH = 128;

/** A registration body after validation, with defaults applied. */
export type RegisterInput = z.output<typeof registerBodySchema>;

export interface LoginInput {
  readonly uin: Uin;
  readonly password: string;
  readonly remember: boolean;
}

export interface LoginOutcome {
  readonly token: string;
  readonly session: SessionInfo;
  /** Cookie lifetime in seconds, or null for a browser-session cookie. */
  readonly cookieMaxAgeSeconds: number | null;
}

export interface AuthenticatedSession {
  readonly uin: Uin;
  readonly nickname: string;
  readonly tokenHash: string;
}

export interface AuthServiceDeps {
  readonly users: UserRepository;
  readonly sessions: SessionRepository;
  readonly hasher: PasswordHasher;
  readonly tokens: SessionTokens;
  readonly clock: Clock;
}

export class AuthService {
  private readonly users: UserRepository;
  private readonly sessions: SessionRepository;
  private readonly hasher: PasswordHasher;
  private readonly tokens: SessionTokens;
  private readonly clock: Clock;
  private dummyHash: Promise<string> | null = null;

  constructor(deps: AuthServiceDeps) {
    this.users = deps.users;
    this.sessions = deps.sessions;
    this.hasher = deps.hasher;
    this.tokens = deps.tokens;
    this.clock = deps.clock;
  }

  async register(input: RegisterInput): Promise<{ uin: Uin }> {
    const passwordHash = await this.hasher.hash(input.password);
    const user = this.users.create({
      nickname: input.nickname,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      gender: 'unspecified',
      age: null,
      country: '',
      city: '',
      homepage: '',
      about: input.about,
      passwordHash,
      authRequired: input.authRequired,
      webAware: DEFAULT_WEB_AWARE,
      hideEmail: DEFAULT_HIDE_EMAIL,
      preferences: { ...DEFAULT_PREFERENCES },
      awayMessages: { ...DEFAULT_AWAY_MESSAGES },
      createdAt: this.clock.now().toISOString(),
    });
    return { uin: user.uin };
  }

  async login(input: LoginInput): Promise<LoginOutcome> {
    const user = this.users.findByUin(input.uin);
    // An unknown UIN still pays for one hash check, so timing does not reveal which UINs exist.
    const hash = user?.passwordHash ?? (await this.timingDummyHash());
    const valid = await this.hasher.verify(input.password, hash);
    if (user === null || !valid) throw new DomainError('unauthorized', LOGIN_FAILED_MESSAGE);

    const now = this.clock.now();
    this.sessions.deleteExpired(now.toISOString());
    const { token, tokenHash } = this.tokens.issue();
    const ttl = input.remember ? REMEMBER_TTL_MS : IDLE_TTL_MS;
    this.sessions.create({
      tokenHash,
      uin: user.uin,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttl).toISOString(),
      lastUsedAt: now.toISOString(),
      remember: input.remember,
    });
    return {
      token,
      session: { uin: user.uin, nickname: user.nickname },
      cookieMaxAgeSeconds: input.remember ? REMEMBER_TTL_MS / 1000 : null,
    };
  }

  /** Resolves a cookie token to a live session, extending the idle expiry. */
  authenticate(token: string | undefined): AuthenticatedSession | null {
    if (token === undefined || token === '' || token.length > MAX_TOKEN_LENGTH) return null;
    return this.resume(this.tokens.hash(token));
  }

  /** Re-validates a stored session (used by live connections); null when it expired or was revoked. */
  resume(tokenHash: string): AuthenticatedSession | null {
    const session = this.sessions.find(tokenHash);
    if (session === null) return null;
    const now = this.clock.now();
    if (session.expiresAt <= now.toISOString()) {
      this.sessions.delete(tokenHash);
      return null;
    }
    const user = this.users.findByUin(session.uin);
    if (user === null) return null;
    const expiresAt = session.remember ? session.expiresAt : new Date(now.getTime() + IDLE_TTL_MS).toISOString();
    this.sessions.touch(tokenHash, now.toISOString(), expiresAt);
    return { uin: user.uin, nickname: user.nickname, tokenHash };
  }

  /** Revokes the session behind the token. Returns its hash so live connections can be closed. */
  logout(token: string | undefined): string | null {
    if (token === undefined || token === '' || token.length > MAX_TOKEN_LENGTH) return null;
    const tokenHash = this.tokens.hash(token);
    this.sessions.delete(tokenHash);
    return tokenHash;
  }

  /** Verifies the current password, stores the new one and signs out every other session. */
  async changePassword(uin: Uin, keepTokenHash: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = requireUser(this.users, uin);
    if (!(await this.hasher.verify(currentPassword, user.passwordHash))) {
      throw new DomainError('forbidden', 'The current password is incorrect.');
    }
    this.users.updatePassword(uin, await this.hasher.hash(newPassword));
    this.sessions.deleteAllForUserExcept(uin, keepTokenHash);
  }

  private timingDummyHash(): Promise<string> {
    // Computed once; a failure is not cached, so the next sign-in tries again.
    this.dummyHash ??= this.hasher.hash('timing-equalizer-password').catch((error: unknown) => {
      this.dummyHash = null;
      throw error;
    });
    return this.dummyHash;
  }
}
