/**
 * Connection lifecycle: starting a connection, releasing it, closing the
 * connections of ended sessions and closing everything at shutdown.
 * Presence is published here, when a user's first connection starts and when the last one closes.
 */
import { CLOSE_CODES } from '@openicq/protocol';
import type { PresenceService } from '../../application/presence-service.ts';
import type { ClientConnection, SessionClosedReason } from './connection.ts';
import type { ConnectionRegistry } from './connection-registry.ts';

/** Standard "going away" close code. */
const CLOSE_GOING_AWAY = 1001;
/** Peers that do not answer the close frame within this time are cut off at shutdown. */
const SHUTDOWN_GRACE_MS = 2000;

export class ConnectionLifecycle {
  private readonly connections: ConnectionRegistry;
  private readonly presence: PresenceService;

  constructor(connections: ConnectionRegistry, presence: PresenceService) {
    this.connections = connections;
    this.presence = presence;
  }

  /** Starts the connection; a new sign-in never disconnects anyone (plan rule 2). Safe to call twice. */
  activate(connection: ClientConnection): void {
    if (connection.started) return;
    if (this.connections.activate(connection)) this.presence.cameOnline(connection.uin);
  }

  /** Forgets the connection and publishes the disconnect if it was the user's last. Safe to call twice. */
  release(connection: ClientConnection): void {
    if (!this.connections.release(connection)) return;
    try {
      this.presence.wentOffline(connection.uin);
    } catch (error) {
      connection.log.error({ err: error }, 'failed to publish going offline');
    }
  }

  /**
   * Sessions that were revoked: their connections get `session.closed` and are
   * closed with 4002 (closed from "Session List") or 4003 (signed out).
   */
  closeSessions(sessionIds: readonly number[], reason: SessionClosedReason): void {
    const code = reason === 'signed_out' ? CLOSE_CODES.signedOut : CLOSE_CODES.sessionClosed;
    for (const connection of this.connections.ofSessions(sessionIds)) {
      connection.endSession(reason, code);
      this.release(connection);
    }
  }

  /** Server shutdown: publishes every disconnect while the database is open, then closes the sockets. */
  shutdown(): void {
    const open = this.connections.all();
    for (const connection of open) {
      this.release(connection);
      connection.close(CLOSE_GOING_AWAY, 'Server shutting down');
    }
    if (open.length === 0) return;
    const timer = setTimeout(() => {
      for (const connection of open) connection.terminate();
    }, SHUTDOWN_GRACE_MS);
    timer.unref();
  }
}
