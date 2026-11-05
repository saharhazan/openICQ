import { noticeKindSchema, type NoticeKind, type Uin } from '@openicq/protocol';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { NewNotice, NoticeRecord } from '../../domain/entities.ts';
import type { NoticeRepository } from '../../domain/repositories.ts';
import { integer, optionalText, required, text, type Row } from './rows.ts';

const SELECT = `
  SELECT n.id, n.to_uin, n.kind, n.from_uin, u.nickname AS from_nickname, n.reason, n.created_at, n.resolved_at
  FROM notices n JOIN users u ON u.uin = n.from_uin`;

function toNotice(row: Row): NoticeRecord {
  return {
    id: integer(row, 'id'),
    toUin: integer(row, 'to_uin'),
    kind: noticeKindSchema.parse(text(row, 'kind')),
    fromUin: integer(row, 'from_uin'),
    fromNickname: text(row, 'from_nickname'),
    reason: text(row, 'reason'),
    createdAt: text(row, 'created_at'),
    resolvedAt: optionalText(row, 'resolved_at'),
  };
}

export class SqliteNoticeRepository implements NoticeRepository {
  private readonly insertStatement: StatementSync;
  private readonly byIdStatement: StatementSync;
  private readonly unresolvedByIdStatement: StatementSync;
  private readonly listStatement: StatementSync;
  private readonly resolveStatement: StatementSync;
  private readonly resolvePendingStatement: StatementSync;

  constructor(db: DatabaseSync) {
    this.insertStatement = db.prepare(`
      INSERT INTO notices (to_uin, kind, from_uin, reason, created_at)
      VALUES (:to, :kind, :from, :reason, :createdAt) RETURNING id`);
    this.byIdStatement = db.prepare(`${SELECT} WHERE n.id = :id`);
    this.unresolvedByIdStatement = db.prepare(
      `${SELECT} WHERE n.id = :id AND n.to_uin = :to AND n.resolved_at IS NULL`,
    );
    this.listStatement = db.prepare(`${SELECT} WHERE n.to_uin = :to AND n.resolved_at IS NULL ORDER BY n.id`);
    this.resolveStatement = db.prepare('UPDATE notices SET resolved_at = :at WHERE id = :id AND resolved_at IS NULL');
    this.resolvePendingStatement = db.prepare(`
      UPDATE notices SET resolved_at = :at
      WHERE to_uin = :to AND from_uin = :from AND kind = :kind AND resolved_at IS NULL`);
  }

  create(notice: NewNotice): NoticeRecord {
    const inserted = required(
      this.insertStatement.get({
        to: notice.toUin,
        kind: notice.kind,
        from: notice.fromUin,
        reason: notice.reason,
        createdAt: notice.createdAt,
      }),
      'the new notice',
    );
    return toNotice(required(this.byIdStatement.get({ id: integer(inserted, 'id') }), 'the new notice'));
  }

  findUnresolved(id: number, toUin: Uin): NoticeRecord | null {
    const row = this.unresolvedByIdStatement.get({ id, to: toUin });
    return row === undefined ? null : toNotice(row);
  }

  listUnresolved(toUin: Uin): NoticeRecord[] {
    return this.listStatement.all({ to: toUin }).map(toNotice);
  }

  resolve(id: number, at: string): void {
    this.resolveStatement.run({ id, at });
  }

  resolvePending(toUin: Uin, fromUin: Uin, kind: NoticeKind, at: string): number {
    return Number(this.resolvePendingStatement.run({ to: toUin, from: fromUin, kind, at }).changes);
  }
}
