/**
 * WebSocket gateway: authenticates the upgrade, wires socket events to the
 * router and the connection lifecycle, and runs the heartbeat.
 */
import { CLOSE_CODES, SESSION_COOKIE, type ServerFrame } from '@openicq/protocol';
import type { FastifyBaseLogger, FastifyRequest } from 'fastify';
import type { RawData, WebSocket } from 'ws';
import type { AuthService } from '../../application/auth-service.ts';
import type { OriginPolicy } from '../origin-policy.ts';
import { ClientConnection } from './connection.ts';
import type { ConnectionLifecycle } from './connection-lifecycle.ts';
import type { ConnectionRegistry } from './connection-registry.ts';
import { errorFrame, type RequestRouter } from './request-router.ts';

export const HEARTBEAT_INTERVAL_MS = 30_000;

export interface GatewayDeps {
  readonly auth: AuthService;
  readonly connections: ConnectionRegistry;
  readonly lifecycle: ConnectionLifecycle;
  readonly router: RequestRouter;
  readonly origins: OriginPolicy;
  readonly log: FastifyBaseLogger;
  readonly heartbeatMs: number;
}

function rawDataToString(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}

export class WebSocketGateway {
  private readonly deps: GatewayDeps;
  private timer: NodeJS.Timeout | null = null;

  constructor(deps: GatewayDeps) {
    this.deps = deps;
  }

  accept(socket: WebSocket, request: FastifyRequest): void {
    const origin = request.headers.origin;
    if (!this.deps.origins.isAllowed(origin)) {
      request.log.warn({ origin }, 'websocket origin rejected');
      socket.close(CLOSE_CODES.unauthorized, 'Origin not allowed');
      return;
    }
    const session = this.deps.auth.authenticate(request.cookies[SESSION_COOKIE]);
    if (session === null) {
      request.log.info('websocket rejected, no valid session');
      socket.close(CLOSE_CODES.unauthorized, 'Not signed in');
      return;
    }
    const connection = new ClientConnection({
      socket,
      uin: session.uin,
      tokenHash: session.tokenHash,
      log: request.log.child({ uin: session.uin }),
    });
    this.deps.connections.track(connection);
    socket.on('message', (data, isBinary) => this.onMessage(connection, data, isBinary));
    socket.on('pong', () => connection.markAlive());
    socket.once('close', (code) => {
      connection.log.info({ code }, 'websocket closed');
      this.deps.lifecycle.release(connection);
    });
    connection.log.info('websocket connected');
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.heartbeat(), this.deps.heartbeatMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  shutdown(): void {
    this.stop();
    this.deps.lifecycle.shutdown();
  }

  private onMessage(connection: ClientConnection, data: RawData, isBinary: boolean): void {
    if (isBinary) {
      const frame: ServerFrame = errorFrame(null, 'bad_request', 'Binary frames are not supported.');
      connection.send(frame);
      return;
    }
    this.deps.router.handle(connection, rawDataToString(data)).catch((error: unknown) => {
      connection.log.error({ err: error }, 'websocket frame handling failed');
    });
  }

  private heartbeat(): void {
    for (const connection of this.deps.connections.all()) {
      try {
        if (!connection.ping()) {
          connection.log.info('terminating unresponsive websocket');
          connection.terminate();
        } else if (this.deps.auth.resume(connection.tokenHash) === null) {
          connection.log.info('session ended, closing websocket');
          connection.close(CLOSE_CODES.unauthorized, 'Session expired');
        }
      } catch (error) {
        this.deps.log.error({ err: error, uin: connection.uin }, 'heartbeat failed');
      }
    }
  }
}
