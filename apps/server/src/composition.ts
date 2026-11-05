/**
 * Wires every dependency: database, repositories, services and transport.
 * Used by `main.ts` and by the integration tests, so both run the same graph.
 */
import type { FastifyInstance } from 'fastify';
import { AuthService } from './application/auth-service.ts';
import { ContactService } from './application/contact-service.ts';
import { DirectoryService } from './application/directory-service.ts';
import { MessagingService } from './application/messaging-service.ts';
import { PresenceService } from './application/presence-service.ts';
import { SessionService } from './application/session-service.ts';
import { SettingsService } from './application/settings-service.ts';
import { VisibilityResolver } from './application/visibility-resolver.ts';
import type { Config } from './config.ts';
import type { Clock } from './domain/ports.ts';
import { ScryptPasswordHasher } from './infrastructure/scrypt-password-hasher.ts';
import { SqliteContactRepository } from './infrastructure/sqlite/contact-repository.ts';
import { SqliteTransactionRunner, openDatabase } from './infrastructure/sqlite/database.ts';
import { SqliteIgnoreRepository } from './infrastructure/sqlite/ignore-repository.ts';
import { SqliteMessageRepository } from './infrastructure/sqlite/message-repository.ts';
import { ensureUinStart, runMigrations } from './infrastructure/sqlite/migrations.ts';
import { SqliteNoticeRepository } from './infrastructure/sqlite/notice-repository.ts';
import { SqliteSessionRepository } from './infrastructure/sqlite/session-repository.ts';
import { SqliteUserRepository } from './infrastructure/sqlite/user-repository.ts';
import { InMemoryPresenceRegistry, RandomSessionTokens, SystemClock } from './infrastructure/system.ts';
import { buildApp } from './transport/app.ts';
import { ConnectionRegistry } from './transport/ws/connection-registry.ts';

export interface ComposeOptions {
  /** Replaces the system clock (tests). */
  readonly clock?: Clock;
  /** Replaces the 30-second WebSocket heartbeat interval (tests). */
  readonly heartbeatMs?: number;
}

export async function composeApp(config: Config, options: ComposeOptions = {}): Promise<FastifyInstance> {
  const db = openDatabase(config.databasePath);
  try {
    const migrationsApplied = runMigrations(db);
    ensureUinStart(db, config.uinStart);

    const clock = options.clock ?? new SystemClock();
    const users = new SqliteUserRepository(db);
    const contacts = new SqliteContactRepository(db);
    const ignores = new SqliteIgnoreRepository(db);
    const presence = new InMemoryPresenceRegistry();
    const connections = new ConnectionRegistry();
    const notifier = connections;
    const visibility = new VisibilityResolver({ presence, contacts, ignores });

    const presenceService = new PresenceService({ presence, contacts, users, notifier, clock, visibility });
    const contactService = new ContactService({
      users,
      contacts,
      notices: new SqliteNoticeRepository(db),
      ignores,
      notifier,
      clock,
      transactions: new SqliteTransactionRunner(db),
      visibility,
    });
    const messagingService = new MessagingService({
      users,
      messages: new SqliteMessageRepository(db),
      contacts,
      ignores,
      notifier,
      clock,
      visibility,
    });
    const settingsService = new SettingsService({ users, ignores, presence: presenceService, clock });
    const services = {
      auth: new AuthService({
        users,
        sessions: new SqliteSessionRepository(db),
        hasher: new ScryptPasswordHasher(),
        tokens: new RandomSessionTokens(),
        clock,
      }),
      session: new SessionService({
        users,
        presence: presenceService,
        contacts: contactService,
        messaging: messagingService,
        settings: settingsService,
        clock,
      }),
      presence: presenceService,
      contacts: contactService,
      messaging: messagingService,
      directory: new DirectoryService({ users, visibility }),
      settings: settingsService,
    };

    const healthQuery = db.prepare('SELECT 1 AS ok');
    const app = await buildApp({
      config,
      services,
      connections,
      clock,
      healthCheck: () => {
        healthQuery.get();
      },
      onClose: () => db.close(),
      ...(options.heartbeatMs === undefined ? {} : { heartbeatMs: options.heartbeatMs }),
    });
    app.log.info({ databasePath: config.databasePath, migrationsApplied }, 'database ready');
    return app;
  } catch (error) {
    if (db.isOpen) db.close();
    throw error;
  }
}
