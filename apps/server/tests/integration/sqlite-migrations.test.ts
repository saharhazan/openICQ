import { describe, expect, it } from 'vitest';
import { DEFAULT_AWAY_MESSAGES, DEFAULT_PREFERENCES } from '../../src/domain/defaults.ts';
import { openDatabase } from '../../src/infrastructure/sqlite/database.ts';
import { SqliteMessageRepository } from '../../src/infrastructure/sqlite/message-repository.ts';
import { MIGRATIONS, ensureUinStart, runMigrations } from '../../src/infrastructure/sqlite/migrations.ts';
import { SqliteUserRepository } from '../../src/infrastructure/sqlite/user-repository.ts';

/** A database as the first release left it: schema version 1 with one user and one message. */
function versionOneDatabase() {
  const db = openDatabase(':memory:');
  const first = MIGRATIONS[0];
  if (first === undefined) throw new Error('migration 1 is missing');
  db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
  db.exec(first.sql);
  db.prepare("INSERT INTO schema_migrations VALUES (1, 'initial schema', '2026-11-01T00:00:00.000Z')").run();
  ensureUinStart(db, 100000);
  const oldAwayMessages = JSON.stringify({ away: 'Old away', na: 'Old na', occupied: 'Old occupied', dnd: 'Old dnd' });
  const oldPreferences = JSON.stringify({ soundsEnabled: false, popupIncoming: false, autoAwayMinutes: 5 });
  for (const nickname of ['Alice', 'Bob']) {
    db.prepare(
      `INSERT INTO users (nickname, password_hash, auth_required, web_aware, hide_email, preferences_json, away_messages_json, created_at)
       VALUES (:nickname, 'scrypt$x', 0, 0, 0, :preferences, :away, '2026-11-01T00:00:00.000Z')`,
    ).run({ nickname, preferences: oldPreferences, away: oldAwayMessages });
  }
  db.prepare(
    `INSERT INTO messages (from_uin, to_uin, text, kind, sent_at, delivered_offline)
     VALUES (100000, 100001, 'from before the upgrade', 'normal', '2026-11-01T00:00:00.000Z', 1)`,
  ).run();
  return db;
}

describe('schema migrations', () => {
  it('upgrade a version 1 database in place: old messages read as not urgent', () => {
    const db = versionOneDatabase();
    try {
      expect(runMigrations(db)).toEqual([2]);
      expect(runMigrations(db)).toEqual([]);
      const messages = new SqliteMessageRepository(db);
      expect(messages.listUnread(100001)).toEqual([expect.objectContaining({ text: 'from before the upgrade', urgent: false })]);
    } finally {
      db.close();
    }
  });

  it('read stored settings without newer keys by merging them over the defaults', () => {
    const db = versionOneDatabase();
    try {
      runMigrations(db);
      const alice = new SqliteUserRepository(db).findByUin(100000);
      expect(alice?.awayMessages).toEqual({
        away: 'Old away',
        na: 'Old na',
        occupied: 'Old occupied',
        dnd: 'Old dnd',
        ffc: DEFAULT_AWAY_MESSAGES.ffc,
      });
      expect(alice?.preferences).toEqual({ ...DEFAULT_PREFERENCES, soundsEnabled: false, autoAwayMinutes: 5 });
    } finally {
      db.close();
    }
  });
});
