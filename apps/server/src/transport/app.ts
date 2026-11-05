/** Builds the Fastify instance: HTTP routes, the WebSocket gateway and cross-cutting hooks. */
import { MAX_FRAME_BYTES, WS_PATH } from '@openicq/protocol';
import fastifyCookie from '@fastify/cookie';
import fastifyWebsocket from '@fastify/websocket';
import { fastify, type FastifyInstance } from 'fastify';
import type { Clock } from '../domain/ports.ts';
import { registerAuthRoutes } from './http/auth-routes.ts';
import { registerErrorHandler } from './http/errors.ts';
import { registerSecurityHeaders } from './http/security-headers.ts';
import { registerClientAssets, registerHealthRoute } from './http/static-routes.ts';
import { OriginPolicy } from './origin-policy.ts';
import { SlidingWindowRateLimiter } from './rate-limiter.ts';
import { ConnectionLifecycle } from './ws/connection-lifecycle.ts';
import type { ConnectionRegistry } from './ws/connection-registry.ts';
import { HEARTBEAT_INTERVAL_MS, WebSocketGateway } from './ws/gateway.ts';
import { createRequestHandlers, type ApplicationServices } from './ws/handlers.ts';
import { RequestRouter } from './ws/request-router.ts';

const BODY_LIMIT_BYTES = 16 * 1024;
const LOGIN_LIMIT = { attempts: 10, windowMs: 5 * 60 * 1000 } as const;
const REGISTER_LIMIT = { attempts: 5, windowMs: 60 * 60 * 1000 } as const;

export interface TransportConfig {
  readonly allowedOrigins: readonly string[];
  readonly cookieSecure: boolean;
  readonly clientDistDir: string;
  readonly logLevel: string;
}

export interface AppDependencies {
  readonly config: TransportConfig;
  readonly services: ApplicationServices;
  readonly connections: ConnectionRegistry;
  readonly clock: Clock;
  /** Throws when the storage is unusable. */
  readonly healthCheck: () => void;
  /** Releases resources (the database) once the server has closed. */
  readonly onClose: () => void;
  /** WebSocket heartbeat interval; defaults to 30 seconds. */
  readonly heartbeatMs?: number;
}

export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const app = fastify({ logger: { level: deps.config.logLevel }, bodyLimit: BODY_LIMIT_BYTES });
  const now = () => deps.clock.now().getTime();
  const origins = new OriginPolicy(deps.config.allowedOrigins);
  const lifecycle = new ConnectionLifecycle(deps.connections, deps.services.presence);
  const gateway = new WebSocketGateway({
    auth: deps.services.auth,
    connections: deps.connections,
    lifecycle,
    router: new RequestRouter(createRequestHandlers(deps.services, lifecycle, deps.clock)),
    origins,
    log: app.log,
    heartbeatMs: deps.heartbeatMs ?? HEARTBEAT_INTERVAL_MS,
  });

  registerSecurityHeaders(app);
  registerErrorHandler(app);
  await app.register(fastifyCookie);
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
    auth: deps.services.auth,
    lifecycle,
    origins,
    cookieSecure: deps.config.cookieSecure,
    loginLimiter: new SlidingWindowRateLimiter(LOGIN_LIMIT.attempts, LOGIN_LIMIT.windowMs, now),
    registerLimiter: new SlidingWindowRateLimiter(REGISTER_LIMIT.attempts, REGISTER_LIMIT.windowMs, now),
  });
  registerHealthRoute(app, deps.healthCheck, deps.clock);
  await registerClientAssets(app, deps.config.clientDistDir);

  app.addHook('onReady', (done) => {
    gateway.start();
    done();
  });
  app.addHook('onClose', (_instance, done) => {
    gateway.stop();
    deps.onClose();
    done();
  });
  return app;
}
