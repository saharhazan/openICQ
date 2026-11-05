import type { Uin } from '@openicq/protocol';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { SessionRecord } from '../../domain/entities.ts';
import type { SessionRepository } from '../../domain/repositories.ts';
import { flag, integer, text, toFlag, type Row } from './rows.ts';

function toSession(row: Row): SessionRecord {
  return {
    tokenHash: text(row, 'token_hash'),
    uin: integer(row, 'uin'),
    createdAt: text(row, 'created_at'),
    expiresAt: text(row, 'expires_at'),
    lastUsedAt: text(row, 'last_used_at'),
    remember: flag(row, 'remember'),
  };
}

export class SqliteSessionRepository implements SessionRepository {
  private readonly insertStatement: StatementSync;
  private readonly findStatement: StatementSync;
  private readonly touchStatement: StatementSync;
  private readonly deleteStatement: StatementSync;
  private readonly deleteOthersStatement: StatementSync;
  private readonly deleteExpiredStatement: StatementSync;

  constructor(db: DatabaseSync) {
    this.insertStatement = db.prepare(`
      INSERT INTO sessions (token_hash, uin, created_at, expires_at, last_used_at, remember)
      VALUES (:tokenHash, :uin, :createdAt, :expiresAt, :lastUsedAt, :remember)`);
    this.findStatement = db.prepare(
      'SELECT token_hash, uin, created_at, expires_at, last_used_at, remember FROM sessions WHERE token_hash = :tokenHash',
    );
    this.touchStatement = db.prepare(
      'UPDATE sessions SET last_used_at = :lastUsedAt, expires_at = :expiresAt WHERE token_hash = :tokenHash',
    );
    this.deleteStatement = db.prepare('DELETE FROM sessions WHERE token_hash = :tokenHash');
    this.deleteOthersStatement = db.prepare('DELETE FROM sessions WHERE uin = :uin AND token_hash <> :keep');
    this.deleteExpiredStatement = db.prepare('DELETE FROM sessions WHERE expires_at <= :now');
  }

  create(session: SessionRecord): void {
    this.insertStatement.run({ ...session, remember: toFlag(session.remember) });
  }

  find(tokenHash: string): SessionRecord | null {
    const row = this.findStatement.get({ tokenHash });
    return row === undefined ? null : toSession(row);
  }

  touch(tokenHash: string, lastUsedAt: string, expiresAt: string): void {
    this.touchStatement.run({ tokenHash, lastUsedAt, expiresAt });
  }

  delete(tokenHash: string): void {
    this.deleteStatement.run({ tokenHash });
  }

  deleteAllForUserExcept(uin: Uin, keepTokenHash: string): number {
    return Number(this.deleteOthersStatement.run({ uin, keep: keepTokenHash }).changes);
  }

  deleteExpired(now: string): number {
    return Number(this.deleteExpiredStatement.run({ now }).changes);
  }
}
