/**
 * Numbered schema migrations. Each runs in its own transaction and is recorded
 * in `schema_migrations`; a migration is never edited once released, a new one is added.
 */
import type { DatabaseSync } from 'node:sqlite';
import { integer } from './rows.ts';

interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    sql: `
      CREATE TABLE users (
        uin INTEGER PRIMARY KEY AUTOINCREMENT,
        nickname TEXT NOT NULL,
        first_name TEXT NOT NULL DEFAULT '',
        last_name TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        gender TEXT NOT NULL DEFAULT 'unspecified' CHECK (gender IN ('unspecified', 'female', 'male')),
        age INTEGER CHECK (age IS NULL OR age BETWEEN 0 AND 150),
        country TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        homepage TEXT NOT NULL DEFAULT '',
        about TEXT NOT NULL DEFAULT '',
        password_hash TEXT NOT NULL,
        auth_required INTEGER NOT NULL CHECK (auth_required IN (0, 1)),
        web_aware INTEGER NOT NULL CHECK (web_aware IN (0, 1)),
        hide_email INTEGER NOT NULL CHECK (hide_email IN (0, 1)),
        preferences_json TEXT NOT NULL,
        away_messages_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT
      );
      CREATE INDEX users_email_lower ON users (lower(email));
      CREATE INDEX users_nickname_lower ON users (lower(nickname));

      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        uin INTEGER NOT NULL REFERENCES users (uin),
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_used_at TEXT NOT NULL,
        remember INTEGER NOT NULL CHECK (remember IN (0, 1))
      );
      CREATE INDEX sessions_uin ON sessions (uin);
      CREATE INDEX sessions_expires_at ON sessions (expires_at);

      CREATE TABLE contacts (
        owner_uin INTEGER NOT NULL REFERENCES users (uin),
        contact_uin INTEGER NOT NULL REFERENCES users (uin),
        nickname TEXT NOT NULL,
        authorized INTEGER NOT NULL CHECK (authorized IN (0, 1)),
        created_at TEXT NOT NULL,
        removed_at TEXT,
        PRIMARY KEY (owner_uin, contact_uin),
        CHECK (owner_uin <> contact_uin)
      );
      CREATE INDEX contacts_contact_uin ON contacts (contact_uin, removed_at);

      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_uin INTEGER NOT NULL REFERENCES users (uin),
        to_uin INTEGER NOT NULL REFERENCES users (uin),
        text TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('normal', 'auto')),
        sent_at TEXT NOT NULL,
        delivered_offline INTEGER NOT NULL CHECK (delivered_offline IN (0, 1)),
        read_at TEXT,
        recipient_hidden INTEGER NOT NULL DEFAULT 0 CHECK (recipient_hidden IN (0, 1))
      );
      CREATE INDEX messages_pair ON messages (from_uin, to_uin, id);
      CREATE INDEX messages_to_uin ON messages (to_uin, from_uin, id);
      CREATE INDEX messages_unread ON messages (to_uin, id) WHERE read_at IS NULL AND recipient_hidden = 0;

      CREATE TABLE notices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        to_uin INTEGER NOT NULL REFERENCES users (uin),
        kind TEXT NOT NULL CHECK (kind IN ('auth_request', 'auth_granted', 'auth_denied', 'added_you')),
        from_uin INTEGER NOT NULL REFERENCES users (uin),
        reason TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        resolved_at TEXT
      );
      CREATE INDEX notices_to_uin ON notices (to_uin, resolved_at, id);
      CREATE INDEX notices_from_uin ON notices (from_uin);

      CREATE TABLE ignores (
        owner_uin INTEGER NOT NULL REFERENCES users (uin),
        ignored_uin INTEGER NOT NULL REFERENCES users (uin),
        created_at TEXT NOT NULL,
        PRIMARY KEY (owner_uin, ignored_uin)
      );
      CREATE INDEX ignores_ignored_uin ON ignores (ignored_uin);
    `,
  },
  {
    version: 2,
    name: 'urgent messages',
    sql: `ALTER TABLE messages ADD COLUMN urgent INTEGER NOT NULL DEFAULT 0 CHECK (urgent IN (0, 1));`,
  },
];

/** Applies every pending migration in order. Returns the versions applied now. */
export function runMigrations(db: DatabaseSync): number[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);
  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((row) => integer(row, 'version')),
  );
  const record = db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (:version, :name, :at)');
  const now: number[] = [];
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migration.sql);
      record.run({ version: migration.version, name: migration.name, at: new Date().toISOString() });
      db.exec('COMMIT');
    } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK');
      throw new Error(`Migration ${migration.version} (${migration.name}) failed`, { cause: error });
    }
    now.push(migration.version);
  }
  return now;
}

/** Makes sure the next UIN handed out is at least `uinStart` (sequential, like the original). */
export function ensureUinStart(db: DatabaseSync, uinStart: number): void {
  const seq = uinStart - 1;
  db.prepare(
    `INSERT INTO sqlite_sequence (name, seq)
     SELECT 'users', :seq WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'users')`,
  ).run({ seq });
  db.prepare("UPDATE sqlite_sequence SET seq = :seq WHERE name = 'users' AND seq < :seq").run({ seq });
}
