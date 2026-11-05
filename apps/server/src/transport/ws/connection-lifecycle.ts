/**
 * Connection lifecycle: which connection is live for a UIN, and what happens
 * when one is replaced, signed out, released or closed for shutdown.
 * Presence is published here, the moment a user really goes offline.
 */
import { CLOSE_CODES, type Uin } from '@openicq/protocol';
import type { PresenceService } from '../../application/presence-service.ts';
import type { ClientConnection } from './connection.ts';
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

  /** Makes the connection live. The one it replaces is kicked without an offline step, so watchers see no flicker. */
  activate(connection: ClientConnection): void {
    this.connections.activate(connection)?.kick('other_location', CLOSE_CODES.otherLocation);
    connection.markStarted();
  }

  /** Forgets the connection and publishes the disconnect if it was the live one. Safe to call twice. */
  release(connection: ClientConnection): void {
    if (!this.connections.release(connection)) return;
    try {
      this.presence.disconnect(connection.uin);
    } catch (error) {
      connection.log.error({ err: error }, 'failed to publish disconnect');
    }
  }

  /** Sign-out: every connection of the revoked session is kicked and goes offline at once. */
  endSession(tokenHash: string): void {
    this.signOutWhere((connection) => connection.tokenHash === tokenHash);
  }

  /** Password change: every other session of the user is kicked. */
  endOtherSessions(uin: Uin, keepTokenHash: string): void {
    this.signOutWhere((connection) => connection.uin === uin && connection.tokenHash !== keepTokenHash);
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

  private signOutWhere(matches: (connection: ClientConnection) => boolean): void {
    for (const connection of this.connections.all()) {
      if (!matches(connection)) continue;
      connection.kick('signed_out', CLOSE_CODES.signedOut);
      this.release(connection);
    }
  }
}
