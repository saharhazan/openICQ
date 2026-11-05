/**
 * Accounts and sign-in sessions (plan rules 1 and 2): registration with a
 * Favorites chat, sign-in by ICQ number or email, many sessions per user,
 * "Session List" and password changes.
 */
import { UIN_MAX, UIN_MIN, type SessionEntry, type registerBodySchema } from '@openicq/protocol';
import type { z } from 'zod';
import type { SessionRecord, UserRecord } from '../domain/entities.ts';
import { DomainError } from '../domain/errors.ts';
import type { Clock, PasswordHasher, SessionTokens, TransactionRunner } from '../domain/ports.ts';
import type { ChatRepository, SessionRepository, UserRepository } from '../domain/repositories.ts';
import type { Uin } from '../domain/vocabulary.ts';
import { MESSAGES, requireUser } from './support.ts';

/** "Keep me signed in": a persistent cookie and session for 30 days. */
export const PERSISTENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Otherwise a browser-session cookie, and the session ends after 24 hours without use. */
export const IDLE_TTL_MS = 24 * 60 * 60 * 1000;
/** Last-seen writes are skipped when the previous one is this recent. */
export const TOUCH_INTERVAL_MS = 60 * 1000;
/** The same text for every sign-in failure, so it never reveals whether an account exists (ICQ New 23.2 string). */
export const LOGIN_FAILED_MESSAGE = 'Invalid login or password';
export const EMAIL_TAKEN_MESSAGE = 'This email is already registered.';
export const WRONG_PASSWORD_MESSAGE = 'The current password is incorrect.';
/** Longest cookie value worth hashing; real tokens are 43 characters. */
const MAX_TOKEN_LENGTH = 128;
const DIGITS = /^\d+$/;

/** A registration body after validation, with defaults applied. */
export type RegisterInput = z.output<typeof registerBodySchema>;

export interface LoginInput {
  /** An ICQ number or an email. */
  readonly login: string;
  readonly password: string;
  readonly keepSignedIn: boolean;
  readonly device: string;
}

export interface LoginOutcome {
  readonly token: string;
  readonly uin: Uin;
  /** Cookie lifetime in seconds, or null for a browser-session cookie. */
  readonly cookieMaxAgeSeconds: number | null;
}

export interface AuthenticatedSession {
  readonly uin: Uin;
  readonly sessionId: number;
}

export interface AuthServiceDeps {
  readonly users: UserRepository;
  readonly sessions: SessionRepository;
  readonly chats: ChatRepository;
  readonly hasher: PasswordHasher;
  readonly tokens: SessionTokens;
  readonly transactions: TransactionRunner;
  readonly clock: Clock;
}

export class AuthService {
  private readonly users: UserRepository;
  private readonly sessions: SessionRepository;
  private readonly chats: ChatRepository;
  private readonly hasher: PasswordHasher;
  private readonly tokens: SessionTokens;
  private readonly transactions: TransactionRunner;
  private readonly clock: Clock;
  private dummyHash: Promise<string> | null = null;

  constructor(deps: AuthServiceDeps) {
    this.users = deps.users;
    this.sessions = deps.sessions;
    this.chats = deps.chats;
    this.hasher = deps.hasher;
    this.tokens = deps.tokens;
    this.transactions = deps.transactions;
    this.clock = deps.clock;
  }

  /** Creates the account and its Favorites chat, pinned. */
  async register(input: RegisterInput): Promise<{ uin: Uin }> {
    const passwordHash = await this.hasher.hash(input.password);
    const email = input.email === '' ? null : input.email;
    const at = this.now();
    const user = this.transactions.run(() => {
      if (input.nickname !== null && this.users.findByNickname(input.nickname) !== null) {
        throw new DomainError('conflict', MESSAGES.nicknameTaken);
      }
      if (email !== null && this.users.findByEmail(email) !== null) throw new DomainError('conflict', EMAIL_TAKEN_MESSAGE);
      const created = this.users.create({
        nickname: input.nickname,
        firstName: input.firstName,
        lastName: input.lastName,
        about: '',
        avatarFileId: null,
        email,
        passwordHash,
        groupInvites: 'everybody',
        createdAt: at,
      });
      this.createFavorites(created.uin, at);
      return created;
    });
    return { uin: user.uin };
  }

  async login(input: LoginInput): Promise<LoginOutcome> {
    const user = this.findByLogin(input.login);
    // An unknown login still pays for one hash check, so timing does not reveal which accounts exist.
    const hash = user?.passwordHash ?? (await this.timingDummyHash());
    const valid = await this.hasher.verify(input.password, hash);
    if (user === null || !valid) throw new DomainError('unauthorized', LOGIN_FAILED_MESSAGE);

    const now = this.clock.now();
    this.sessions.deleteExpired(now.toISOString());
    const { token, tokenHash } = this.tokens.issue();
    const ttl = input.keepSignedIn ? PERSISTENT_TTL_MS : IDLE_TTL_MS;
    this.sessions.create({
      tokenHash,
      uin: user.uin,
      device: input.device,
      persistent: input.keepSignedIn,
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttl).toISOString(),
    });
    return { token, uin: user.uin, cookieMaxAgeSeconds: input.keepSignedIn ? PERSISTENT_TTL_MS / 1000 : null };
  }

  /** Resolves a cookie token to a live session and records the activity. */
  authenticate(token: string | undefined): AuthenticatedSession | null {
    if (token === undefined || token === '' || token.length > MAX_TOKEN_LENGTH) return null;
    return this.validate(this.sessions.findByTokenHash(this.tokens.hash(token)));
  }

  /** Re-validates a session of a live connection; null when it expired or was closed. */
  resume(sessionId: number): AuthenticatedSession | null {
    return this.validate(this.sessions.findById(sessionId));
  }

  /** Revokes the session behind the token. Returns its id so live connections can be closed. */
  logout(token: string | undefined): number | null {
    if (token === undefined || token === '' || token.length > MAX_TOKEN_LENGTH) return null;
    const session = this.sessions.findByTokenHash(this.tokens.hash(token));
    if (session === null) return null;
    this.sessions.delete(session.id);
    return session.id;
  }

  listSessions(uin: Uin, currentSessionId: number): SessionEntry[] {
    const entries = this.sessions.listForUser(uin, this.now()).map((session) => ({
      id: session.id,
      current: session.id === currentSessionId,
      device: session.device,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
    }));
    return [...entries.filter((entry) => entry.current), ...entries.filter((entry) => !entry.current)];
  }

  /** "Close session". The current session signs out through logout instead. Returns the closed id. */
  closeSession(uin: Uin, currentSessionId: number, sessionId: number): number[] {
    if (sessionId === currentSessionId) {
      throw new DomainError('bad_request', 'This is the current session. Sign out to close it.');
    }
    const session = this.sessions.findById(sessionId);
    if (session === null || session.uin !== uin) throw new DomainError('not_found', 'Session not found.');
    this.sessions.delete(session.id);
    return [session.id];
  }

  /** "Close all other sessions". Returns the closed ids. */
  closeOtherSessions(uin: Uin, currentSessionId: number): number[] {
    return this.sessions.deleteOthers(uin, currentSessionId);
  }

  /** Verifies the current password, stores the new one and closes every other session. Returns their ids. */
  async changePassword(uin: Uin, currentSessionId: number, oldPassword: string, newPassword: string): Promise<number[]> {
    const user = requireUser(this.users, uin);
    if (!(await this.hasher.verify(oldPassword, user.passwordHash))) {
      throw new DomainError('forbidden', WRONG_PASSWORD_MESSAGE);
    }
    const passwordHash = await this.hasher.hash(newPassword);
    return this.transactions.run(() => {
      this.users.updatePassword(uin, passwordHash);
      return this.sessions.deleteOthers(uin, currentSessionId);
    });
  }

  private createFavorites(uin: Uin, at: string): void {
    const favorites = this.chats.create({
      type: 'favorites',
      pair: [uin, uin],
      title: '',
      about: '',
      rules: '',
      avatarFileId: null,
      joinWithApproval: false,
      isPublic: false,
      inviteToken: null,
      createdAt: at,
      updatedAt: at,
    });
    this.chats.addMember({ chatId: favorites.id, uin, role: 'creator', joinedAt: at, hidden: false, pinOrder: 1 });
  }

  /** An ICQ number (digits only) or an email, case-insensitive. */
  private findByLogin(login: string): UserRecord | null {
    if (DIGITS.test(login)) {
      const uin = Number(login);
      return uin >= UIN_MIN && uin <= UIN_MAX ? this.users.findByUin(uin) : null;
    }
    return login.includes('@') ? this.users.findByEmail(login.toLowerCase()) : null;
  }

  private validate(session: SessionRecord | null): AuthenticatedSession | null {
    if (session === null) return null;
    const now = this.clock.now();
    if (session.expiresAt <= now.toISOString()) {
      this.sessions.delete(session.id);
      return null;
    }
    if (now.getTime() - Date.parse(session.lastSeenAt) >= TOUCH_INTERVAL_MS) {
      const expiresAt = session.persistent ? session.expiresAt : new Date(now.getTime() + IDLE_TTL_MS).toISOString();
      this.sessions.touch(session.id, now.toISOString(), expiresAt);
    }
    return { uin: session.uin, sessionId: session.id };
  }

  private now(): string {
    return this.clock.now().toISOString();
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
