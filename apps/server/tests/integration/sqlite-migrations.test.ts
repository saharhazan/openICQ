import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/infrastructure/sqlite/database.ts';
import { LegacyDatabaseError, MIGRATIONS, ensureUinStart, runMigrations } from '../../src/infrastructure/sqlite/migrations.ts';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'openicq-db-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('migrations', () => {
  it('creates the schema once and is a no-op on the next start', () => {
    const path = join(dir, 'nested', 'openicq.db');
    const first = openDatabase(path);
    expect(runMigrations(first)).toEqual(MIGRATIONS.map((migration) => migration.version));
    first.close();
    const second = openDatabase(path);
    expect(runMigrations(second)).toEqual([]);
    const tables = second
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((row) => row.name);
    expect(tables).toEqual([
      'blocks',
      'chat_members',
      'chats',
      'contacts',
      'files',
      'join_requests',
      'message_files',
      'message_hidden',
      'messages',
      'openicq_migrations',
      'reactions',
      'sessions',
      'users',
    ]);
    expect(second.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
    second.close();
  });

  it('starts UINs at UIN_START and never moves them back', () => {
    const db = openDatabase(join(dir, 'uin.db'));
    runMigrations(db);
    ensureUinStart(db, 200000);
    ensureUinStart(db, 100000);
    const insert = db.prepare(
      "INSERT INTO users (first_name, password_hash, created_at) VALUES ('A', 'x', '2026-01-01T00:00:00.000Z') RETURNING uin",
    );
    expect(insert.get()).toEqual({ uin: 200000 });
    db.close();
  });

  it('refuses a database created by the ICQ 2001b server', () => {
    const db = openDatabase(join(dir, 'legacy.db'));
    db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
    expect(() => runMigrations(db)).toThrow(LegacyDatabaseError);
    db.close();
  });

  it('enforces unique nicknames and one direct chat per pair', () => {
    const db = openDatabase(join(dir, 'constraints.db'));
    runMigrations(db);
    const user = db.prepare(
      "INSERT INTO users (first_name, nickname, password_hash, created_at) VALUES ('A', :nickname, 'x', 'now') RETURNING uin",
    );
    const first = user.get({ nickname: 'same' });
    expect(() => user.get({ nickname: 'same' })).toThrow(/UNIQUE/);
    const second = user.get({ nickname: null });
    const chat = db.prepare(
      "INSERT INTO chats (type, pair_low, pair_high, created_at, updated_at) VALUES ('direct', :low, :high, 'now', 'now')",
    );
    chat.run({ low: first?.uin ?? 0, high: second?.uin ?? 0 });
    expect(() => chat.run({ low: first?.uin ?? 0, high: second?.uin ?? 0 })).toThrow(/UNIQUE/);
    db.close();
  });
});
