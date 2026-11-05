import type { Uin } from '@openicq/protocol';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { IgnoreRepository } from '../../domain/repositories.ts';
import { integer } from './rows.ts';

export class SqliteIgnoreRepository implements IgnoreRepository {
  private readonly addStatement: StatementSync;
  private readonly removeStatement: StatementSync;
  private readonly existsStatement: StatementSync;
  private readonly listStatement: StatementSync;

  constructor(db: DatabaseSync) {
    this.addStatement = db.prepare(`
      INSERT INTO ignores (owner_uin, ignored_uin, created_at) VALUES (:owner, :ignored, :at)
      ON CONFLICT (owner_uin, ignored_uin) DO NOTHING`);
    this.removeStatement = db.prepare('DELETE FROM ignores WHERE owner_uin = :owner AND ignored_uin = :ignored');
    this.existsStatement = db.prepare(
      'SELECT 1 AS found FROM ignores WHERE owner_uin = :owner AND ignored_uin = :ignored',
    );
    this.listStatement = db.prepare('SELECT ignored_uin FROM ignores WHERE owner_uin = :owner ORDER BY created_at, ignored_uin');
  }

  add(ownerUin: Uin, ignoredUin: Uin, at: string): void {
    this.addStatement.run({ owner: ownerUin, ignored: ignoredUin, at });
  }

  remove(ownerUin: Uin, ignoredUin: Uin): boolean {
    return Number(this.removeStatement.run({ owner: ownerUin, ignored: ignoredUin }).changes) > 0;
  }

  isIgnoring(ownerUin: Uin, ignoredUin: Uin): boolean {
    return this.existsStatement.get({ owner: ownerUin, ignored: ignoredUin }) !== undefined;
  }

  list(ownerUin: Uin): Uin[] {
    return this.listStatement.all({ owner: ownerUin }).map((row) => integer(row, 'ignored_uin'));
  }
}
