import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { NewSession, SessionRecord } from '../../domain/entities.ts';
import type { SessionRepository } from '../../domain/repositories.ts';
import type { Uin } from '../../domain/vocabulary.ts';
import { flag, integer, required, text, toFlag, type Row } from './rows.ts';

const COLUMNS = 'id, token_hash, uin, device, persistent, created_at, last_seen_at, expires_at';

function toSession(row: Row): SessionRecord {
  return {
    id: integer(row, 'id'),
    tokenHash: text(row, 'token_hash'),
    uin: integer(row, 'uin'),
    device: text(row, 'device'),
    persistent: flag(row, 'persistent'),
    createdAt: text(row, 'created_at'),
    lastSeenAt: text(row, 'last_seen_at'),
    expiresAt: text(row, 'expires_at'),
  };
}

export class SqliteSessionRepository implements SessionRepository {
  private readonly insertStatement: StatementSync;
  private readonly byTokenStatement: StatementSync;
  private readonly byIdStatement: StatementSync;
  private readonly listStatement: StatementSync;
  private readonly touchStatement: StatementSync;
  private readonly deleteStatement: StatementSync;
  private readonly deleteOthersStatement: StatementSync;
  private readonly deleteExpiredStatement: StatementSync;

  constructor(db: DatabaseSync) {
    this.insertStatement = db.prepare(`
      INSERT INTO sessions (token_hash, uin, device, persistent, created_at, last_seen_at, expires_at)
      VALUES (:tokenHash, :uin, :device, :persistent, :createdAt, :lastSeenAt, :expiresAt)
      RETURNING ${COLUMNS}`);
    this.byTokenStatement = db.prepare(`SELECT ${COLUMNS} FROM sessions WHERE token_hash = :tokenHash`);
    this.byIdStatement = db.prepare(`SELECT ${COLUMNS} FROM sessions WHERE id = :id`);
    this.listStatement = db.prepare(
      `SELECT ${COLUMNS} FROM sessions WHERE uin = :uin AND expires_at > :now ORDER BY last_seen_at DESC, id DESC`,
    );
    this.touchStatement = db.prepare('UPDATE sessions SET last_seen_at = :lastSeenAt, expires_at = :expiresAt WHERE id = :id');
    this.deleteStatement = db.prepare('DELETE FROM sessions WHERE id = :id');
    this.deleteOthersStatement = db.prepare('DELETE FROM sessions WHERE uin = :uin AND id <> :keepId RETURNING id');
    this.deleteExpiredStatement = db.prepare('DELETE FROM sessions WHERE expires_at <= :now');
  }

  create(session: NewSession): SessionRecord {
    const row = this.insertStatement.get({ ...session, persistent: toFlag(session.persistent) });
    return toSession(required(row, 'the new session'));
  }

  findByTokenHash(tokenHash: string): SessionRecord | null {
    const row = this.byTokenStatement.get({ tokenHash });
    return row === undefined ? null : toSession(row);
  }

  findById(id: number): SessionRecord | null {
    const row = this.byIdStatement.get({ id });
    return row === undefined ? null : toSession(row);
  }

  listForUser(uin: Uin, now: string): SessionRecord[] {
    return this.listStatement.all({ uin, now }).map(toSession);
  }

  touch(id: number, lastSeenAt: string, expiresAt: string): void {
    this.touchStatement.run({ id, lastSeenAt, expiresAt });
  }

  delete(id: number): boolean {
    return Number(this.deleteStatement.run({ id }).changes) > 0;
  }

  deleteOthers(uin: Uin, keepId: number): number[] {
    return this.deleteOthersStatement.all({ uin, keepId }).map((row) => integer(row, 'id'));
  }

  deleteExpired(now: string): number {
    return Number(this.deleteExpiredStatement.run({ now }).changes);
  }
}
