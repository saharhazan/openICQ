import { CHAT_EVENT_TYPES, reactionSchema } from '@openicq/protocol';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { z } from 'zod';
import type { FileRecord, MessageRecord, NewMessage, StoredChatEvent } from '../../domain/entities.ts';
import type { MessageRepository, ReactionCountRow } from '../../domain/repositories.ts';
import type { Reaction, Uin } from '../../domain/vocabulary.ts';
import { FILE_COLUMNS, toFile } from './file-repository.ts';
import { flag, integer, optionalInteger, optionalText, required, text, type Row } from './rows.ts';

const COLUMNS = `id, chat_id, sender_uin, client_id, text, event_type, event_target, event_value, reply_to_id,
  forwarded_from, edited_at, deleted, sent_at`;
const eventTypeSchema = z.enum(CHAT_EVENT_TYPES);
const ADMIN_ONLY_EVENT: (typeof CHAT_EVENT_TYPES)[number] = 'member_left';

/**
 * Messages of a chat the viewer still sees: after "Clear history", not deleted
 * for them, and "has left group" only for administrators (as in ICQ New).
 */
const VISIBLE = `chat_id = :chatId AND id > :clearedBeforeId
  AND NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h.uin = :viewer AND h.message_id = messages.id)
  AND (event_type IS NULL OR event_type <> '${ADMIN_ONLY_EVENT}' OR EXISTS (
    SELECT 1 FROM chat_members m WHERE m.chat_id = messages.chat_id AND m.uin = :viewer AND m.role IN ('creator', 'admin')))`;

function toEvent(row: Row): StoredChatEvent | null {
  const type = optionalText(row, 'event_type');
  if (type === null) return null;
  return {
    type: eventTypeSchema.parse(type),
    target: optionalInteger(row, 'event_target'),
    value: optionalText(row, 'event_value'),
  };
}

function toMessage(row: Row): MessageRecord {
  return {
    id: integer(row, 'id'),
    chatId: integer(row, 'chat_id'),
    senderUin: integer(row, 'sender_uin'),
    clientId: optionalText(row, 'client_id'),
    text: text(row, 'text'),
    event: toEvent(row),
    replyToId: optionalInteger(row, 'reply_to_id'),
    forwardedFrom: optionalInteger(row, 'forwarded_from'),
    editedAt: optionalText(row, 'edited_at'),
    deleted: flag(row, 'deleted'),
    sentAt: text(row, 'sent_at'),
  };
}

/** Id lists travel as one JSON parameter, unpacked with json_each. */
function idList(ids: readonly number[]): string {
  return JSON.stringify(ids);
}

function prepareStatements(db: DatabaseSync) {
  return {
    insert: db.prepare(`
      INSERT INTO messages (chat_id, sender_uin, client_id, text, event_type, event_target, event_value, reply_to_id,
        forwarded_from, sent_at)
      VALUES (:chatId, :senderUin, :clientId, :text, :eventType, :eventTarget, :eventValue, :replyToId,
        :forwardedFrom, :sentAt)
      RETURNING ${COLUMNS}`),
    attach: db.prepare('INSERT INTO message_files (message_id, file_id, position) VALUES (:messageId, :fileId, :position)'),
    byId: db.prepare(`SELECT ${COLUMNS} FROM messages WHERE id = :id`),
    byIds: db.prepare(`SELECT ${COLUMNS} FROM messages WHERE id IN (SELECT value FROM json_each(:ids)) ORDER BY id`),
    history: db.prepare(`
      SELECT ${COLUMNS} FROM messages
      WHERE ${VISIBLE} AND (:beforeId IS NULL OR id < :beforeId)
      ORDER BY id DESC LIMIT :limit`),
    lastVisible: db.prepare(`SELECT ${COLUMNS} FROM messages WHERE ${VISIBLE} ORDER BY id DESC LIMIT 1`),
    maxId: db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM messages WHERE chat_id = :chatId'),
    countUnread: db.prepare(`
      SELECT COUNT(*) AS n FROM messages
      WHERE ${VISIBLE} AND sender_uin <> :viewer AND deleted = 0`),
    visibleIds: db.prepare(`SELECT id FROM messages WHERE ${VISIBLE} AND id <= :toId ORDER BY id`),
    hiddenFor: db.prepare(`
      SELECT message_id FROM message_hidden
      WHERE uin = :viewer AND message_id IN (SELECT value FROM json_each(:ids))`),
    hide: db.prepare('INSERT OR IGNORE INTO message_hidden (uin, message_id) VALUES (:viewer, :messageId)'),
    updateText: db.prepare(`UPDATE messages SET text = :text, edited_at = :editedAt WHERE id = :id RETURNING ${COLUMNS}`),
    tombstone: db.prepare(`UPDATE messages SET text = '', deleted = 1 WHERE id = :id RETURNING ${COLUMNS}`),
    dropFiles: db.prepare('DELETE FROM message_files WHERE message_id = :id'),
    dropReactions: db.prepare('DELETE FROM reactions WHERE message_id = :id'),
    attachments: db.prepare(`
      SELECT mf.message_id AS message_id, ${FILE_COLUMNS.split(',').map((column) => `f.${column.trim()}`).join(', ')}
      FROM message_files mf JOIN files f ON f.id = mf.file_id
      WHERE mf.message_id IN (SELECT value FROM json_each(:ids))
      ORDER BY mf.message_id, mf.position`),
    setReaction: db.prepare(`
      INSERT INTO reactions (message_id, uin, reaction, created_at) VALUES (:messageId, :uin, :reaction, :at)
      ON CONFLICT (message_id, uin) DO UPDATE SET reaction = excluded.reaction, created_at = excluded.created_at`),
    removeReaction: db.prepare('DELETE FROM reactions WHERE message_id = :messageId AND uin = :uin'),
    reactionCounts: db.prepare(`
      SELECT message_id, reaction, COUNT(*) AS n, MAX(uin = :viewer) AS mine
      FROM reactions WHERE message_id IN (SELECT value FROM json_each(:ids))
      GROUP BY message_id, reaction`),
  } satisfies Record<string, StatementSync>;
}

export class SqliteMessageRepository implements MessageRepository {
  private readonly sql: ReturnType<typeof prepareStatements>;

  constructor(db: DatabaseSync) {
    this.sql = prepareStatements(db);
  }

  create(message: NewMessage): MessageRecord {
    const row = this.sql.insert.get({
      chatId: message.chatId,
      senderUin: message.senderUin,
      clientId: message.clientId,
      text: message.text,
      eventType: message.event?.type ?? null,
      eventTarget: message.event?.target ?? null,
      eventValue: message.event?.value ?? null,
      replyToId: message.replyToId,
      forwardedFrom: message.forwardedFrom,
      sentAt: message.sentAt,
    });
    return toMessage(required(row, 'the new message'));
  }

  attachFiles(messageId: number, fileIds: readonly number[]): void {
    fileIds.forEach((fileId, position) => this.sql.attach.run({ messageId, fileId, position }));
  }

  findById(id: number): MessageRecord | null {
    const row = this.sql.byId.get({ id });
    return row === undefined ? null : toMessage(row);
  }

  findMany(ids: readonly number[]): MessageRecord[] {
    if (ids.length === 0) return [];
    return this.sql.byIds.all({ ids: idList(ids) }).map(toMessage);
  }

  history(chatId: number, viewer: Uin, clearedBeforeId: number, beforeId: number | null, limit: number): MessageRecord[] {
    return this.sql.history.all({ chatId, viewer, clearedBeforeId, beforeId, limit }).map(toMessage);
  }

  lastVisible(chatId: number, viewer: Uin, clearedBeforeId: number): MessageRecord | null {
    const row = this.sql.lastVisible.get({ chatId, viewer, clearedBeforeId });
    return row === undefined ? null : toMessage(row);
  }

  maxId(chatId: number): number {
    return integer(required(this.sql.maxId.get({ chatId }), 'max message id'), 'id');
  }

  countUnread(chatId: number, viewer: Uin, afterId: number): number {
    return integer(required(this.sql.countUnread.get({ chatId, viewer, clearedBeforeId: afterId }), 'unread count'), 'n');
  }

  visibleIds(chatId: number, viewer: Uin, fromId: number, toId: number): number[] {
    return this.sql.visibleIds.all({ chatId, viewer, clearedBeforeId: fromId, toId }).map((row) => integer(row, 'id'));
  }

  hiddenFor(viewer: Uin, ids: readonly number[]): Set<number> {
    if (ids.length === 0) return new Set();
    return new Set(this.sql.hiddenFor.all({ viewer, ids: idList(ids) }).map((row) => integer(row, 'message_id')));
  }

  hide(viewer: Uin, ids: readonly number[]): void {
    for (const messageId of ids) this.sql.hide.run({ viewer, messageId });
  }

  updateText(id: number, text: string, editedAt: string): MessageRecord {
    return toMessage(required(this.sql.updateText.get({ id, text, editedAt }), `message ${id}`));
  }

  tombstone(id: number): MessageRecord {
    this.sql.dropFiles.run({ id });
    this.sql.dropReactions.run({ id });
    return toMessage(required(this.sql.tombstone.get({ id }), `message ${id}`));
  }

  attachmentsOf(ids: readonly number[]): Map<number, FileRecord[]> {
    const result = new Map<number, FileRecord[]>();
    if (ids.length === 0) return result;
    for (const row of this.sql.attachments.all({ ids: idList(ids) })) {
      const messageId = integer(row, 'message_id');
      result.set(messageId, [...(result.get(messageId) ?? []), toFile(row)]);
    }
    return result;
  }

  setReaction(messageId: number, uin: Uin, reaction: Reaction, at: string): void {
    this.sql.setReaction.run({ messageId, uin, reaction, at });
  }

  removeReaction(messageId: number, uin: Uin): void {
    this.sql.removeReaction.run({ messageId, uin });
  }

  reactionCounts(ids: readonly number[], viewer: Uin): ReactionCountRow[] {
    if (ids.length === 0) return [];
    return this.sql.reactionCounts.all({ ids: idList(ids), viewer }).map((row) => ({
      messageId: integer(row, 'message_id'),
      reaction: reactionSchema.parse(text(row, 'reaction')),
      count: integer(row, 'n'),
      mine: flag(row, 'mine'),
    }));
  }
}
