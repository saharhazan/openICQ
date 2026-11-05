/** Opens the SQLite database with the pragmas the server relies on. */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { TransactionRunner } from '../../domain/ports.ts';

export const MEMORY_DATABASE = ':memory:';
const BUSY_TIMEOUT_MS = 5000;
/** The data directory holds password and session hashes: owner only. */
export const DATA_DIRECTORY_MODE = 0o700;

export function openDatabase(path: string): DatabaseSync {
  if (path !== MEMORY_DATABASE) mkdirSync(dirname(path), { recursive: true, mode: DATA_DIRECTORY_MODE });
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: true, timeout: BUSY_TIMEOUT_MS });
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

export class SqliteTransactionRunner implements TransactionRunner {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  run<T>(work: () => T): T {
    if (this.db.isTransaction) return work();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
