import type { Uin } from '@openicq/protocol';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { ContactRecord, NewContact } from '../../domain/entities.ts';
import type { ContactRepository } from '../../domain/repositories.ts';
import { flag, integer, required, text, toFlag, type Row } from './rows.ts';

const COLUMNS = 'owner_uin, contact_uin, nickname, authorized, created_at';

function toContact(row: Row): ContactRecord {
  return {
    ownerUin: integer(row, 'owner_uin'),
    contactUin: integer(row, 'contact_uin'),
    nickname: text(row, 'nickname'),
    authorized: flag(row, 'authorized'),
    createdAt: text(row, 'created_at'),
  };
}

function optionalContact(row: Row | undefined): ContactRecord | null {
  return row === undefined ? null : toContact(row);
}

export class SqliteContactRepository implements ContactRepository {
  private readonly findStatement: StatementSync;
  private readonly listStatement: StatementSync;
  private readonly watchersStatement: StatementSync;
  private readonly upsertStatement: StatementSync;
  private readonly authorizeStatement: StatementSync;
  private readonly renameStatement: StatementSync;
  private readonly removeStatement: StatementSync;

  constructor(db: DatabaseSync) {
    const active = 'owner_uin = :owner AND contact_uin = :contact AND removed_at IS NULL';
    this.findStatement = db.prepare(`SELECT ${COLUMNS} FROM contacts WHERE ${active}`);
    this.listStatement = db.prepare(`
      SELECT ${COLUMNS} FROM contacts WHERE owner_uin = :owner AND removed_at IS NULL
      ORDER BY nickname COLLATE NOCASE, contact_uin`);
    this.watchersStatement = db.prepare(
      `SELECT ${COLUMNS} FROM contacts WHERE contact_uin = :contact AND removed_at IS NULL`,
    );
    // Re-adding a removed contact revives its row; the original created_at is kept.
    this.upsertStatement = db.prepare(`
      INSERT INTO contacts (owner_uin, contact_uin, nickname, authorized, created_at, removed_at)
      VALUES (:owner, :contact, :nickname, :authorized, :createdAt, NULL)
      ON CONFLICT (owner_uin, contact_uin) DO UPDATE SET
        nickname = excluded.nickname, authorized = excluded.authorized, removed_at = NULL
      RETURNING ${COLUMNS}`);
    this.authorizeStatement = db.prepare(`UPDATE contacts SET authorized = 1 WHERE ${active} RETURNING ${COLUMNS}`);
    this.renameStatement = db.prepare(`UPDATE contacts SET nickname = :nickname WHERE ${active} RETURNING ${COLUMNS}`);
    this.removeStatement = db.prepare(`UPDATE contacts SET removed_at = :at WHERE ${active}`);
  }

  findActive(ownerUin: Uin, contactUin: Uin): ContactRecord | null {
    return optionalContact(this.findStatement.get({ owner: ownerUin, contact: contactUin }));
  }

  listActive(ownerUin: Uin): ContactRecord[] {
    return this.listStatement.all({ owner: ownerUin }).map(toContact);
  }

  listWatchers(contactUin: Uin): ContactRecord[] {
    return this.watchersStatement.all({ contact: contactUin }).map(toContact);
  }

  upsertActive(contact: NewContact): ContactRecord {
    const row = this.upsertStatement.get({
      owner: contact.ownerUin,
      contact: contact.contactUin,
      nickname: contact.nickname,
      authorized: toFlag(contact.authorized),
      createdAt: contact.createdAt,
    });
    return toContact(required(row, `contact ${contact.ownerUin}/${contact.contactUin}`));
  }

  authorize(ownerUin: Uin, contactUin: Uin): ContactRecord | null {
    return optionalContact(this.authorizeStatement.get({ owner: ownerUin, contact: contactUin }));
  }

  rename(ownerUin: Uin, contactUin: Uin, nickname: string): ContactRecord | null {
    return optionalContact(this.renameStatement.get({ owner: ownerUin, contact: contactUin, nickname }));
  }

  remove(ownerUin: Uin, contactUin: Uin, at: string): boolean {
    return Number(this.removeStatement.run({ owner: ownerUin, contact: contactUin, at }).changes) > 0;
  }
}
