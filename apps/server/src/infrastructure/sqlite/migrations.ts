/**
 * Numbered schema migrations for the ICQ New model. Each runs in its own
 * transaction and is recorded in `openicq_migrations`; a migration is never
 * edited once released, a new one is added.
 *
 * The ICQ 2001b server recorded its migrations in `schema_migrations`. Such a
 * database is refused with a clear message instead of being altered.
 */
import type { DatabaseSync } from 'node:sqlite';
import { integer } from './rows.ts';

interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

const MIGRATIONS_TABLE = 'openicq_migrations';
const LEGACY_MIGRATIONS_TABLE = 'schema_migrations';

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'icq new schema',
    sql: `
      CREATE TABLE users (
        uin INTEGER PRIMARY KEY AUTOINCREMENT,
        nickname TEXT UNIQUE,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL DEFAULT '',
        about TEXT NOT NULL DEFAULT '',
        email TEXT UNIQUE,
        avatar_file_id INTEGER REFERENCES files (id),
        password_hash TEXT NOT NULL,
        group_invites TEXT NOT NULL DEFAULT 'everybody' CHECK (group_invites IN ('everybody', 'contacts', 'nobody')),
        created_at TEXT NOT NULL,
        last_seen_at TEXT,
        CHECK (nickname IS NULL OR nickname = lower(nickname)),
        CHECK (email IS NULL OR email = lower(email))
      );
      CREATE INDEX users_name ON users (first_name, last_name);

      CREATE TABLE sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash TEXT NOT NULL UNIQUE,
        uin INTEGER NOT NULL REFERENCES users (uin),
        device TEXT NOT NULL,
        persistent INTEGER NOT NULL CHECK (persistent IN (0, 1)),
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX sessions_uin ON sessions (uin);
      CREATE INDEX sessions_expires_at ON sessions (expires_at);

      CREATE TABLE files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_uin INTEGER NOT NULL REFERENCES users (uin),
        purpose TEXT NOT NULL CHECK (purpose IN ('attachment', 'avatar')),
        storage_name TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        mime TEXT NOT NULL,
        size INTEGER NOT NULL CHECK (size >= 0),
        kind TEXT NOT NULL CHECK (kind IN ('image', 'file')),
        width INTEGER CHECK (width IS NULL OR width > 0),
        height INTEGER CHECK (height IS NULL OR height > 0),
        created_at TEXT NOT NULL
      );
      CREATE INDEX files_owner ON files (owner_uin);

      CREATE TABLE chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK (type IN ('direct', 'group', 'favorites')),
        pair_low INTEGER REFERENCES users (uin),
        pair_high INTEGER REFERENCES users (uin),
        title TEXT NOT NULL DEFAULT '',
        about TEXT NOT NULL DEFAULT '',
        rules TEXT NOT NULL DEFAULT '',
        avatar_file_id INTEGER REFERENCES files (id),
        join_with_approval INTEGER NOT NULL DEFAULT 0 CHECK (join_with_approval IN (0, 1)),
        is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0, 1)),
        invite_token TEXT UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (pair_low, pair_high),
        CHECK ((type = 'group') = (pair_low IS NULL AND pair_high IS NULL)),
        CHECK (type <> 'direct' OR pair_low < pair_high),
        CHECK (type <> 'favorites' OR pair_low = pair_high)
      );

      CREATE TABLE chat_members (
        chat_id INTEGER NOT NULL REFERENCES chats (id),
        uin INTEGER NOT NULL REFERENCES users (uin),
        role TEXT NOT NULL CHECK (role IN ('creator', 'admin', 'member', 'readonly')),
        joined_at TEXT NOT NULL,
        last_read_id INTEGER NOT NULL DEFAULT 0,
        last_delivered_id INTEGER NOT NULL DEFAULT 0,
        cleared_before_id INTEGER NOT NULL DEFAULT 0,
        pin_order INTEGER,
        muted INTEGER NOT NULL DEFAULT 0 CHECK (muted IN (0, 1)),
        marked_unread INTEGER NOT NULL DEFAULT 0 CHECK (marked_unread IN (0, 1)),
        hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
        PRIMARY KEY (chat_id, uin)
      );
      CREATE INDEX chat_members_uin ON chat_members (uin, hidden);

      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL REFERENCES chats (id),
        sender_uin INTEGER NOT NULL REFERENCES users (uin),
        client_id TEXT,
        text TEXT NOT NULL DEFAULT '',
        event_type TEXT,
        event_target INTEGER REFERENCES users (uin),
        event_value TEXT,
        reply_to_id INTEGER REFERENCES messages (id),
        forwarded_from INTEGER REFERENCES users (uin),
        edited_at TEXT,
        deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
        sent_at TEXT NOT NULL
      );
      CREATE INDEX messages_chat ON messages (chat_id, id);

      CREATE TABLE message_files (
        message_id INTEGER NOT NULL REFERENCES messages (id),
        file_id INTEGER NOT NULL REFERENCES files (id),
        position INTEGER NOT NULL,
        PRIMARY KEY (message_id, file_id)
      );
      CREATE INDEX message_files_file ON message_files (file_id);

      CREATE TABLE message_hidden (
        uin INTEGER NOT NULL REFERENCES users (uin),
        message_id INTEGER NOT NULL REFERENCES messages (id),
        PRIMARY KEY (uin, message_id)
      );

      CREATE TABLE reactions (
        message_id INTEGER NOT NULL REFERENCES messages (id),
        uin INTEGER NOT NULL REFERENCES users (uin),
        reaction TEXT NOT NULL CHECK (reaction IN ('like', 'super', 'funny', 'oops', 'sad', 'scandalous')),
        created_at TEXT NOT NULL,
        PRIMARY KEY (message_id, uin)
      );

      CREATE TABLE contacts (
        owner_uin INTEGER NOT NULL REFERENCES users (uin),
        contact_uin INTEGER NOT NULL REFERENCES users (uin),
        created_at TEXT NOT NULL,
        PRIMARY KEY (owner_uin, contact_uin),
        CHECK (owner_uin <> contact_uin)
      );
      CREATE INDEX contacts_contact_uin ON contacts (contact_uin);

      CREATE TABLE blocks (
        owner_uin INTEGER NOT NULL REFERENCES users (uin),
        blocked_uin INTEGER NOT NULL REFERENCES users (uin),
        created_at TEXT NOT NULL,
        PRIMARY KEY (owner_uin, blocked_uin),
        CHECK (owner_uin <> blocked_uin)
      );
      CREATE INDEX blocks_blocked_uin ON blocks (blocked_uin);

      CREATE TABLE join_requests (
        chat_id INTEGER NOT NULL REFERENCES chats (id),
        uin INTEGER NOT NULL REFERENCES users (uin),
        requested_at TEXT NOT NULL,
        PRIMARY KEY (chat_id, uin)
      );
    `,
  },
];

export class LegacyDatabaseError extends Error {
  constructor() {
    super(
      'This database was created by the ICQ 2001b server and cannot be upgraded to the ICQ New schema. ' +
        'Move the file away (or delete it) and start again, or point DATABASE_PATH at a new file.',
    );
    this.name = 'LegacyDatabaseError';
  }
}

function tableExists(db: DatabaseSync, name: string): boolean {
  return db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = :name").get({ name }) !== undefined;
}

/** Applies every pending migration in order. Returns the versions applied now. */
export function runMigrations(db: DatabaseSync): number[] {
  if (!tableExists(db, MIGRATIONS_TABLE) && tableExists(db, LEGACY_MIGRATIONS_TABLE)) throw new LegacyDatabaseError();
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);
  const applied = new Set(
    db.prepare(`SELECT version FROM ${MIGRATIONS_TABLE}`).all().map((row) => integer(row, 'version')),
  );
  const record = db.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (version, name, applied_at) VALUES (:version, :name, :at)`);
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
