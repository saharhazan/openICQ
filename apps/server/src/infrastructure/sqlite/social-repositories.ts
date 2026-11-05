/** Contacts, blocks and group join requests: small relation tables between users and chats. */
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { JoinRequestRecord } from '../../domain/entities.ts';
import type { BlockRepository, ContactRepository, JoinRequestRepository } from '../../domain/repositories.ts';
import type { Uin } from '../../domain/vocabulary.ts';
import { integer, required, text, type Row } from './rows.ts';

export class SqliteContactRepository implements ContactRepository {
  private readonly addStatement: StatementSync;
  private readonly removeStatement: StatementSync;
  private readonly hasStatement: StatementSync;
  private readonly listStatement: StatementSync;
  private readonly ownersStatement: StatementSync;

  constructor(db: DatabaseSync) {
    this.addStatement = db.prepare(
      'INSERT OR IGNORE INTO contacts (owner_uin, contact_uin, created_at) VALUES (:owner, :contact, :at)',
    );
    this.removeStatement = db.prepare('DELETE FROM contacts WHERE owner_uin = :owner AND contact_uin = :contact');
    this.hasStatement = db.prepare('SELECT 1 AS found FROM contacts WHERE owner_uin = :owner AND contact_uin = :contact');
    this.listStatement = db.prepare('SELECT contact_uin FROM contacts WHERE owner_uin = :owner ORDER BY created_at, contact_uin');
    this.ownersStatement = db.prepare('SELECT owner_uin FROM contacts WHERE contact_uin = :contact');
  }

  add(owner: Uin, contact: Uin, at: string): void {
    this.addStatement.run({ owner, contact, at });
  }

  remove(owner: Uin, contact: Uin): boolean {
    return Number(this.removeStatement.run({ owner, contact }).changes) > 0;
  }

  has(owner: Uin, contact: Uin): boolean {
    return this.hasStatement.get({ owner, contact }) !== undefined;
  }

  list(owner: Uin): Uin[] {
    return this.listStatement.all({ owner }).map((row) => integer(row, 'contact_uin'));
  }

  ownersOf(contact: Uin): Uin[] {
    return this.ownersStatement.all({ contact }).map((row) => integer(row, 'owner_uin'));
  }
}

export class SqliteBlockRepository implements BlockRepository {
  private readonly addStatement: StatementSync;
  private readonly removeStatement: StatementSync;
  private readonly isStatement: StatementSync;
  private readonly listStatement: StatementSync;

  constructor(db: DatabaseSync) {
    this.addStatement = db.prepare(
      'INSERT OR IGNORE INTO blocks (owner_uin, blocked_uin, created_at) VALUES (:owner, :blocked, :at)',
    );
    this.removeStatement = db.prepare('DELETE FROM blocks WHERE owner_uin = :owner AND blocked_uin = :blocked');
    this.isStatement = db.prepare('SELECT 1 AS found FROM blocks WHERE owner_uin = :owner AND blocked_uin = :blocked');
    this.listStatement = db.prepare('SELECT blocked_uin FROM blocks WHERE owner_uin = :owner ORDER BY created_at, blocked_uin');
  }

  add(owner: Uin, blocked: Uin, at: string): void {
    this.addStatement.run({ owner, blocked, at });
  }

  remove(owner: Uin, blocked: Uin): boolean {
    return Number(this.removeStatement.run({ owner, blocked }).changes) > 0;
  }

  isBlocking(owner: Uin, blocked: Uin): boolean {
    return this.isStatement.get({ owner, blocked }) !== undefined;
  }

  list(owner: Uin): Uin[] {
    return this.listStatement.all({ owner }).map((row) => integer(row, 'blocked_uin'));
  }
}

function toRequest(row: Row): JoinRequestRecord {
  return { chatId: integer(row, 'chat_id'), uin: integer(row, 'uin'), requestedAt: text(row, 'requested_at') };
}

export class SqliteJoinRequestRepository implements JoinRequestRepository {
  private readonly createStatement: StatementSync;
  private readonly findStatement: StatementSync;
  private readonly listStatement: StatementSync;
  private readonly countStatement: StatementSync;
  private readonly deleteStatement: StatementSync;

  constructor(db: DatabaseSync) {
    this.createStatement = db.prepare(
      'INSERT OR IGNORE INTO join_requests (chat_id, uin, requested_at) VALUES (:chatId, :uin, :requestedAt)',
    );
    this.findStatement = db.prepare(
      'SELECT chat_id, uin, requested_at FROM join_requests WHERE chat_id = :chatId AND uin = :uin',
    );
    this.listStatement = db.prepare(
      'SELECT chat_id, uin, requested_at FROM join_requests WHERE chat_id = :chatId ORDER BY requested_at, uin',
    );
    this.countStatement = db.prepare('SELECT COUNT(*) AS n FROM join_requests WHERE chat_id = :chatId');
    this.deleteStatement = db.prepare('DELETE FROM join_requests WHERE chat_id = :chatId AND uin = :uin');
  }

  create(request: JoinRequestRecord): void {
    this.createStatement.run({ ...request });
  }

  find(chatId: number, uin: Uin): JoinRequestRecord | null {
    const row = this.findStatement.get({ chatId, uin });
    return row === undefined ? null : toRequest(row);
  }

  list(chatId: number): JoinRequestRecord[] {
    return this.listStatement.all({ chatId }).map(toRequest);
  }

  count(chatId: number): number {
    return integer(required(this.countStatement.get({ chatId }), 'join request count'), 'n');
  }

  delete(chatId: number, uin: Uin): boolean {
    return Number(this.deleteStatement.run({ chatId, uin }).changes) > 0;
  }
}
