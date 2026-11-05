/** Builds the Fastify instance: HTTP routes, the WebSocket gateway and cross-cutting hooks. */
import { MAX_FRAME_BYTES, WS_PATH } from '@openicq/protocol';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyWebsocket from '@fastify/websocket';
import { fastify, type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { DEFAULT_FILE_SWEEP, FileSweeper, type FileSweepSchedule } from '../application/file-sweeper.ts';
import type { Clock } from '../domain/ports.ts';
import { registerAuthRoutes } from './http/auth-routes.ts';
import { registerErrorHandler } from './http/errors.ts';
import { registerFileRoutes } from './http/file-routes.ts';
import { registerSecurityHeaders } from './http/security-headers.ts';
import { registerClientAssets, registerHealthRoute } from './http/static-routes.ts';
import { OriginPolicy } from './origin-policy.ts';
import { SlidingWindowRateLimiter } from './rate-limiter.ts';
import { ConnectionLifecycle } from './ws/connection-lifecycle.ts';
import type { ConnectionRegistry } from './ws/connection-registry.ts';
import { HEARTBEAT_INTERVAL_MS, WebSocketGateway } from './ws/gateway.ts';
import { createRequestHandlers, type ApplicationServices } from './ws/handlers.ts';
import { RequestRouter } from './ws/request-router.ts';

/** JSON bodies only; uploads stream through the multipart parser instead. */
const BODY_LIMIT_BYTES = 16 * 1024;
export const LOGIN_LIMIT = { attempts: 10, windowMs: 5 * 60 * 1000 } as const;
export const REGISTER_LIMIT = { attempts: 5, windowMs: 60 * 60 * 1000 } as const;
/** Plan rule 14: 30 uploads a minute per user. */
export const UPLOAD_LIMIT = { attempts: 30, windowMs: 60 * 1000 } as const;

export interface TransportConfig {
  readonly allowedOrigins: readonly string[];
  readonly cookieSecure: boolean;
  readonly clientDistDir: string;
  readonly logLevel: string;
  readonly maxFileBytes: number;
}

/** Where log lines go instead of stdout. */
export interface LogStream {
  write(line: string): void;
}

export interface AppDependencies {
  readonly config: TransportConfig;
  /** Builds the services once the server logger exists (it receives failures nobody else sees). */
  readonly createServices: (log: FastifyBaseLogger) => ApplicationServices;
  readonly connections: ConnectionRegistry;
  readonly clock: Clock;
  /** Throws when the storage is unusable. */
  readonly healthCheck: () => void;
  /** Releases resources (the database) once the server has closed. */
  readonly onClose: () => void;
  /** WebSocket heartbeat interval; defaults to 30 seconds. */
  readonly heartbeatMs?: number;
  /** Unused-file sweep; defaults to every 10 minutes for files older than an hour. */
  readonly fileSweep?: FileSweepSchedule;
  /** Log destination; defaults to stdout. */
  readonly logStream?: LogStream;
}

export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const level = deps.config.logLevel;
  const logger = deps.logStream === undefined ? { level } : { level, stream: deps.logStream };
  const app = fastify({ logger, bodyLimit: BODY_LIMIT_BYTES });
  const services = deps.createServices(app.log);
  const sweeper = new FileSweeper(services.files, app.log, deps.fileSweep ?? DEFAULT_FILE_SWEEP);
  const now = () => deps.clock.now().getTime();
  const origins = new OriginPolicy(deps.config.allowedOrigins);
  const lifecycle = new ConnectionLifecycle(deps.connections, services.presence);
  const gateway = new WebSocketGateway({
    auth: services.auth,
    connections: deps.connections,
    lifecycle,
    router: new RequestRouter(createRequestHandlers(services, lifecycle, deps.clock)),
    origins,
    log: app.log,
    heartbeatMs: deps.heartbeatMs ?? HEARTBEAT_INTERVAL_MS,
  });

  registerSecurityHeaders(app);
  registerErrorHandler(app);
  await app.register(fastifyCookie);
  await app.register(fastifyMultipart, { throwFileSizeLimit: false, limits: { files: 1, fields: 8, parts: 9 } });
  await app.register(fastifyWebsocket, {
    options: { maxPayload: MAX_FRAME_BYTES },
    errorHandler: (error, socket, request) => {
      request.log.warn({ err: error }, 'websocket error');
      socket.terminate();
    },
    preClose: (done) => {
      gateway.shutdown();
      app.websocketServer.close((error) => {
        if (error) app.log.warn({ err: error }, 'websocket server close reported an error');
        done();
      });
    },
  });

  app.get(WS_PATH, { websocket: true }, (socket, request) => gateway.accept(socket, request));
  registerAuthRoutes(app, {
    auth: services.auth,
    lifecycle,
    origins,
    cookieSecure: deps.config.cookieSecure,
    loginLimiter: new SlidingWindowRateLimiter(LOGIN_LIMIT.attempts, LOGIN_LIMIT.windowMs, now),
    registerLimiter: new SlidingWindowRateLimiter(REGISTER_LIMIT.attempts, REGISTER_LIMIT.windowMs, now),
  });
  registerFileRoutes(app, {
    auth: services.auth,
    files: services.files,
    origins,
    uploadLimiter: new SlidingWindowRateLimiter(UPLOAD_LIMIT.attempts, UPLOAD_LIMIT.windowMs, now),
    maxFileBytes: deps.config.maxFileBytes,
  });
  registerHealthRoute(app, deps.healthCheck, deps.clock);
  await registerClientAssets(app, deps.config.clientDistDir);

  app.addHook('onReady', (done) => {
    gateway.start();
    sweeper.start();
    done();
  });
  app.addHook('onClose', async () => {
    gateway.stop();
    // A sweep in progress finishes first: it still needs the database.
    await sweeper.stop();
    deps.onClose();
  });
  return app;
}
