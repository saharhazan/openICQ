import { ATTACHMENT_KINDS, filePurposeSchema } from '@openicq/protocol';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { z } from 'zod';
import type { FileRecord, NewFile } from '../../domain/entities.ts';
import type { FileRepository } from '../../domain/repositories.ts';
import type { Uin } from '../../domain/vocabulary.ts';
import { integer, optionalInteger, required, text, type Row } from './rows.ts';

export const FILE_COLUMNS = 'id, owner_uin, purpose, storage_name, name, mime, size, kind, width, height, created_at';
const kindSchema = z.enum(ATTACHMENT_KINDS);

export function toFile(row: Row): FileRecord {
  return {
    id: integer(row, 'id'),
    ownerUin: integer(row, 'owner_uin'),
    purpose: filePurposeSchema.parse(text(row, 'purpose')),
    storageName: text(row, 'storage_name'),
    name: text(row, 'name'),
    mime: text(row, 'mime'),
    size: integer(row, 'size'),
    kind: kindSchema.parse(text(row, 'kind')),
    width: optionalInteger(row, 'width'),
    height: optionalInteger(row, 'height'),
    createdAt: text(row, 'created_at'),
  };
}

/**
 * SQL condition on `files.id`: no message carries the file and no profile or
 * group uses it as its avatar. Uncorrelated subqueries, so each runs once per statement.
 */
const UNREFERENCED = `id NOT IN (SELECT file_id FROM message_files)
  AND id NOT IN (SELECT avatar_file_id FROM users WHERE avatar_file_id IS NOT NULL)
  AND id NOT IN (SELECT avatar_file_id FROM chats WHERE avatar_file_id IS NOT NULL)`;

function prepareStatements(db: DatabaseSync) {
  return {
    insert: db.prepare(`
      INSERT INTO files (owner_uin, purpose, storage_name, name, mime, size, kind, width, height, created_at)
      VALUES (:ownerUin, :purpose, :storageName, :name, :mime, :size, :kind, :width, :height, :createdAt)
      RETURNING ${FILE_COLUMNS}`),
    byId: db.prepare(`SELECT ${FILE_COLUMNS} FROM files WHERE id = :id`),
    // The viewer must still see the message: not deleted for all, not deleted for them, not before their "Clear history".
    shared: db.prepare(`
      SELECT 1 AS shared
      FROM message_files mf
      JOIN messages m ON m.id = mf.message_id AND m.deleted = 0
      JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.uin = :uin AND m.id > cm.cleared_before_id
      WHERE mf.file_id = :fileId
        AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.uin = :uin AND h.message_id = m.id)
      LIMIT 1`),
    bytesOwnedBy: db.prepare('SELECT COALESCE(SUM(size), 0) AS n FROM files WHERE owner_uin = :owner'),
    totalBytes: db.prepare('SELECT COALESCE(SUM(size), 0) AS n FROM files'),
    deleteUnreferenced: db.prepare(`
      DELETE FROM files WHERE id IN (SELECT value FROM json_each(:ids)) AND ${UNREFERENCED}
      RETURNING ${FILE_COLUMNS}`),
    deleteUnreferencedBefore: db.prepare(`
      DELETE FROM files WHERE id IN (
        SELECT id FROM files WHERE created_at < :createdBefore AND ${UNREFERENCED} ORDER BY id LIMIT :limit)
      RETURNING ${FILE_COLUMNS}`),
  } satisfies Record<string, StatementSync>;
}

export class SqliteFileRepository implements FileRepository {
  private readonly sql: ReturnType<typeof prepareStatements>;

  constructor(db: DatabaseSync) {
    this.sql = prepareStatements(db);
  }

  create(file: NewFile): FileRecord {
    return toFile(required(this.sql.insert.get({ ...file }), 'the new file'));
  }

  findById(id: number): FileRecord | null {
    const row = this.sql.byId.get({ id });
    return row === undefined ? null : toFile(row);
  }

  isSharedWith(fileId: number, uin: Uin): boolean {
    return this.sql.shared.get({ fileId, uin }) !== undefined;
  }

  bytesOwnedBy(owner: Uin): number {
    return integer(required(this.sql.bytesOwnedBy.get({ owner }), 'stored bytes'), 'n');
  }

  totalBytes(): number {
    return integer(required(this.sql.totalBytes.get(), 'stored bytes'), 'n');
  }

  deleteUnreferenced(ids: readonly number[]): FileRecord[] {
    if (ids.length === 0) return [];
    return this.sql.deleteUnreferenced.all({ ids: JSON.stringify(ids) }).map(toFile);
  }

  deleteUnreferencedBefore(createdBefore: string, limit: number): FileRecord[] {
    return this.sql.deleteUnreferencedBefore.all({ createdBefore, limit }).map(toFile);
  }
}
