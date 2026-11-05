/**
 * Ports the application layer depends on. Infrastructure and transport
 * provide the implementations; tests replace them with mocks.
 */
import type { ServerEvent, SettableStatus, Uin } from '@openicq/protocol';

export interface Clock {
  now(): Date;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

export interface IssuedToken {
  /** Sent to the browser in the session cookie, never stored. */
  readonly token: string;
  /** Stored server-side. */
  readonly tokenHash: string;
}

export interface SessionTokens {
  issue(): IssuedToken;
  hash(token: string): string;
}

/** Best-effort delivery of an event to the user's live connection, if any. */
export interface Notifier {
  notify(uin: Uin, event: ServerEvent): void;
}

/** Live presence: who is connected and with which status. */
export interface PresenceRegistry {
  /** The live status, or null when the user is not connected. */
  statusOf(uin: Uin): SettableStatus | null;
  set(uin: Uin, status: SettableStatus): void;
  remove(uin: Uin): void;
}

/** Runs a multi-step write atomically. */
export interface TransactionRunner {
  run<T>(work: () => T): T;
}
