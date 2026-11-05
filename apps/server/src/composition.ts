/**
 * Wires every dependency: database, repositories, services and transport.
 * Used by `main.ts`, the desktop app (`embedded.ts`) and the integration tests, so all run the same graph.
 */
import type { FastifyInstance } from 'fastify';
import { AuthService } from './application/auth-service.ts';
import { ChatEvents } from './application/chat-events.ts';
import { ChatService } from './application/chat-service.ts';
import { FileService } from './application/file-service.ts';
import type { FileSweepSchedule } from './application/file-sweeper.ts';
import { GroupMembershipService } from './application/group-membership-service.ts';
import { GroupService } from './application/group-service.ts';
import { MessageService } from './application/message-service.ts';
import { PresenceService } from './application/presence-service.ts';
import { SessionService } from './application/session-service.ts';
import { UserService } from './application/user-service.ts';
import { ViewBuilder } from './application/views.ts';
import type { Config } from './config.ts';
import type { Clock, ErrorLog, InviteTokens } from './domain/ports.ts';
import { DiskFileStorage } from './infrastructure/disk-file-storage.ts';
import { ImageSizeProbe } from './infrastructure/image-probe.ts';
import { ScryptPasswordHasher } from './infrastructure/scrypt-password-hasher.ts';
import { SqliteChatRepository } from './infrastructure/sqlite/chat-repository.ts';
import { SqliteTransactionRunner, openDatabase } from './infrastructure/sqlite/database.ts';
import { SqliteFileRepository } from './infrastructure/sqlite/file-repository.ts';
import { SqliteMessageRepository } from './infrastructure/sqlite/message-repository.ts';
import { ensureUinStart, runMigrations } from './infrastructure/sqlite/migrations.ts';
import { SqliteSessionRepository } from './infrastructure/sqlite/session-repository.ts';
import {
  SqliteBlockRepository,
  SqliteContactRepository,
  SqliteJoinRequestRepository,
} from './infrastructure/sqlite/social-repositories.ts';
import { SqliteUserRepository } from './infrastructure/sqlite/user-repository.ts';
import { RandomInviteTokens, RandomSessionTokens, SystemClock } from './infrastructure/system.ts';
import { buildApp, type LogStream } from './transport/app.ts';
import type { ApplicationServices } from './transport/ws/handlers.ts';
import { ConnectionRegistry } from './transport/ws/connection-registry.ts';

export interface ComposeOptions {
  /** Replaces the system clock (tests). */
  readonly clock?: Clock;
  /** Replaces the 30-second WebSocket heartbeat interval (tests). */
  readonly heartbeatMs?: number;
  /** Replaces the random invite link tokens (tests). */
  readonly inviteTokens?: InviteTokens;
  /** Replaces the unused-file sweep (every 10 minutes, files older than an hour) (tests). */
  readonly fileSweep?: FileSweepSchedule;
  /** Receives the server log lines instead of stdout (tests). */
  readonly logStream?: LogStream;
}

interface ServiceGraphInput {
  readonly config: Config;
  readonly db: ReturnType<typeof openDatabase>;
  readonly clock: Clock;
  readonly connections: ConnectionRegistry;
  readonly inviteTokens: InviteTokens;
  readonly log: ErrorLog;
}

function buildServices(input: ServiceGraphInput): ApplicationServices {
  const { config, db, clock, connections, inviteTokens, log } = input;
  const transactions = new SqliteTransactionRunner(db);
  const repositories = {
    users: new SqliteUserRepository(db),
    chats: new SqliteChatRepository(db),
    messages: new SqliteMessageRepository(db),
    files: new SqliteFileRepository(db),
    contacts: new SqliteContactRepository(db),
    blocks: new SqliteBlockRepository(db),
    requests: new SqliteJoinRequestRepository(db),
  };
  const { users, chats, messages, files, contacts, blocks, requests } = repositories;
  const views = new ViewBuilder({ ...repositories, presence: connections });
  const events = new ChatEvents({ chats, messages, blocks, views, notifier: connections });
  const presence = new PresenceService({ users, chats, contacts, blocks, notifier: connections, clock });
  const groups = new GroupService({ users, chats, messages, files, contacts, blocks, views, events, inviteTokens, transactions, clock });
  const fileService = new FileService({
    files,
    storage: new DiskFileStorage(config.filesDir),
    probe: new ImageSizeProbe(),
    clock,
    log,
    maxBytes: config.maxFileBytes,
    maxUserBytes: config.maxUserStorageBytes,
    maxTotalBytes: config.maxTotalStorageBytes,
  });
  return {
    auth: new AuthService({
      users,
      sessions: new SqliteSessionRepository(db),
      chats,
      hasher: new ScryptPasswordHasher(),
      tokens: new RandomSessionTokens(),
      transactions,
      clock,
    }),
    session: new SessionService({ users, chats, messages, contacts, views, events, clock }),
    presence,
    chats: new ChatService({ users, chats, messages, blocks, views, events, groups, transactions, clock }),
    messages: new MessageService({ chats, messages, files, blocks, views, events, fileCleanup: fileService, transactions, clock }),
    groups,
    membership: new GroupMembershipService({ users, chats, messages, contacts, blocks, requests, views, events, groups, transactions, clock }),
    users: new UserService({ users, files, contacts, blocks, views, events, presence, clock }),
    files: fileService,
  };
}

export async function composeApp(config: Config, options: ComposeOptions = {}): Promise<FastifyInstance> {
  const db = openDatabase(config.databasePath);
  try {
    const migrationsApplied = runMigrations(db);
    ensureUinStart(db, config.uinStart);
    const clock = options.clock ?? new SystemClock();
    const connections = new ConnectionRegistry();
    const inviteTokens = options.inviteTokens ?? new RandomInviteTokens();
    const healthQuery = db.prepare('SELECT 1 AS ok');
    const app = await buildApp({
      config,
      createServices: (log) => buildServices({ config, db, clock, connections, inviteTokens, log }),
      connections,
      clock,
      healthCheck: () => {
        healthQuery.get();
      },
      onClose: () => db.close(),
      ...(options.heartbeatMs === undefined ? {} : { heartbeatMs: options.heartbeatMs }),
      ...(options.fileSweep === undefined ? {} : { fileSweep: options.fileSweep }),
      ...(options.logStream === undefined ? {} : { logStream: options.logStream }),
    });
    app.log.info(
      { databasePath: config.databasePath, filesDir: config.filesDir, migrationsApplied },
      'database and file storage ready',
    );
    return app;
  } catch (error) {
    if (db.isOpen) db.close();
    throw error;
  }
}
