/**
 * Ports the application layer depends on. Infrastructure and transport
 * provide the implementations; tests replace them with mocks.
 */
import type { Readable } from 'node:stream';
import type { ServerEvent } from '@openicq/protocol';
import type { Uin } from './vocabulary.ts';

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

/** Group invite link tokens: 16 random bytes in base64url. */
export interface InviteTokens {
  issue(): string;
}

/** Identifies one open WebSocket, so an event can skip the connection that caused it. */
export type ConnectionId = string;

/** Delivers events to the live connections of a user. */
export interface Notifier {
  /**
   * Sends the event to every started connection of the user except `except`.
   * Returns how many connections it was handed to (0 when the user is offline).
   */
  notify(uin: Uin, event: ServerEvent, except?: ConnectionId | null): number;
}

/** Live presence: a user is online while at least one connection is started. */
export interface PresenceRegistry {
  isOnline(uin: Uin): boolean;
}

/** Runs a multi-step write atomically. */
export interface TransactionRunner {
  run<T>(work: () => T): T;
}

/** Where failures that cannot reach the caller are reported (the server logger). */
export interface ErrorLog {
  error(details: object, message: string): void;
}

/** The server logger for background jobs, which also report what they did. */
export interface JobLog extends ErrorLog {
  info(details: object, message: string): void;
}

export interface SavedFile {
  readonly storageName: string;
  readonly size: number;
}

/** Uploaded file contents on disk, under random names. */
export interface FileStorage {
  /**
   * Streams `source` into a new file. Rejects with `FileTooLargeError` past
   * `maxBytes`; on any failure the partial file is removed before rejecting.
   */
  save(source: Readable, maxBytes: number): Promise<SavedFile>;
  /** Size on disk; rejects when the file is missing. */
  size(storageName: string): Promise<number>;
  open(storageName: string): Readable;
  remove(storageName: string): Promise<void>;
  pathOf(storageName: string): string;
}

export type SafeImageType = 'jpeg' | 'png' | 'gif' | 'webp';

export interface ImageInfo {
  readonly type: SafeImageType;
  readonly width: number;
  readonly height: number;
}

/** Detects JPEG, PNG, GIF and WebP by content. Null for anything else. */
export interface ImageProbe {
  probe(path: string): Promise<ImageInfo | null>;
}
