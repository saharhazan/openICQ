import { messageKindSchema, type Uin } from '@openicq/protocol';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { MessageRecord, NewMessage } from '../../domain/entities.ts';
import type { MessageRepository } from '../../domain/repositories.ts';
import { flag, integer, optionalText, required, text, toFlag, type Row } from './rows.ts';

const COLUMNS = 'id, from_uin, to_uin, text, kind, sent_at, delivered_offline, urgent, read_at, recipient_hidden';

function toMessage(row: Row): MessageRecord {
  return {
    id: integer(row, 'id'),
    fromUin: integer(row, 'from_uin'),
    toUin: integer(row, 'to_uin'),
    text: text(row, 'text'),
    kind: messageKindSchema.parse(text(row, 'kind')),
    sentAt: text(row, 'sent_at'),
    deliveredOffline: flag(row, 'delivered_offline'),
    urgent: flag(row, 'urgent'),
    readAt: optionalText(row, 'read_at'),
    recipientHidden: flag(row, 'recipient_hidden'),
  };
}

export class SqliteMessageRepository implements MessageRepository {
  private readonly insertStatement: StatementSync;
  private readonly unreadStatement: StatementSync;
  private readonly markReadStatement: StatementSync;
  private readonly historyStatement: StatementSync;

  constructor(db: DatabaseSync) {
    this.insertStatement = db.prepare(`
      INSERT INTO messages (from_uin, to_uin, text, kind, sent_at, delivered_offline, urgent, recipient_hidden)
      VALUES (:from, :to, :text, :kind, :sentAt, :deliveredOffline, :urgent, :recipientHidden)
      RETURNING ${COLUMNS}`);
    this.unreadStatement = db.prepare(`
      SELECT ${COLUMNS} FROM messages
      WHERE to_uin = :to AND read_at IS NULL AND recipient_hidden = 0
      ORDER BY id`);
    this.markReadStatement = db.prepare(`
      UPDATE messages SET read_at = :at
      WHERE to_uin = :to AND from_uin = :from AND read_at IS NULL AND recipient_hidden = 0`);
    // Two index range scans, one per direction. Messages hidden from the viewer as recipient are left out.
    this.historyStatement = db.prepare(`
      SELECT ${COLUMNS} FROM (
        SELECT ${COLUMNS} FROM messages
        WHERE from_uin = :viewer AND to_uin = :other AND id < :before
        ORDER BY id DESC LIMIT :limit
      )
      UNION ALL
      SELECT ${COLUMNS} FROM (
        SELECT ${COLUMNS} FROM messages
        WHERE from_uin = :other AND to_uin = :viewer AND recipient_hidden = 0 AND id < :before
        ORDER BY id DESC LIMIT :limit
      )
      ORDER BY id DESC LIMIT :limit`);
  }

  create(message: NewMessage): MessageRecord {
    const row = this.insertStatement.get({
      from: message.fromUin,
      to: message.toUin,
      text: message.text,
      kind: message.kind,
      sentAt: message.sentAt,
      deliveredOffline: toFlag(message.deliveredOffline),
      urgent: toFlag(message.urgent),
      recipientHidden: toFlag(message.recipientHidden),
    });
    return toMessage(required(row, 'the new message'));
  }

  listUnread(toUin: Uin): MessageRecord[] {
    return this.unreadStatement.all({ to: toUin }).map(toMessage);
  }

  markRead(toUin: Uin, fromUin: Uin, at: string): number {
    return Number(this.markReadStatement.run({ to: toUin, from: fromUin, at }).changes);
  }

  history(viewer: Uin, other: Uin, beforeId: number | null, limit: number): MessageRecord[] {
    return this.historyStatement
      .all({ viewer, other, before: beforeId ?? Number.MAX_SAFE_INTEGER, limit })
      .map(toMessage);
  }
}
