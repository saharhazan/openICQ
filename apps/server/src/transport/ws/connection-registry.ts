/**
 * Tracks open connections and the started ones per user (plan rule 2: many
 * sessions and sockets per user). Implements `Notifier` and `PresenceRegistry`:
 * events reach every started connection of a user, and a user is online while
 * at least one connection is started.
 */
import type { ServerEvent } from '@openicq/protocol';
import type { ConnectionId, Notifier, PresenceRegistry } from '../../domain/ports.ts';
import type { Uin } from '../../domain/vocabulary.ts';
import type { ClientConnection } from './connection.ts';

export class ConnectionRegistry implements Notifier, PresenceRegistry {
  private readonly open = new Set<ClientConnection>();
  private readonly started = new Map<Uin, Set<ClientConnection>>();
  private nextId = 1;

  newConnectionId(): ConnectionId {
    const id = `c${this.nextId}`;
    this.nextId += 1;
    return id;
  }

  track(connection: ClientConnection): void {
    this.open.add(connection);
  }

  /** Marks the connection started. True when it is the user's first one, so they just came online. */
  activate(connection: ClientConnection): boolean {
    connection.markStarted();
    const mine = this.started.get(connection.uin) ?? new Set<ClientConnection>();
    const first = mine.size === 0;
    mine.add(connection);
    this.started.set(connection.uin, mine);
    return first;
  }

  /** Forgets the connection. True when it was the user's last started one, so they just went offline. */
  release(connection: ClientConnection): boolean {
    this.open.delete(connection);
    const mine = this.started.get(connection.uin);
    if (mine === undefined || !mine.delete(connection)) return false;
    if (mine.size > 0) return false;
    this.started.delete(connection.uin);
    return true;
  }

  notify(uin: Uin, event: ServerEvent, except: ConnectionId | null = null): number {
    let reached = 0;
    for (const connection of this.started.get(uin) ?? []) {
      if (connection.id === except || !connection.isOpen) continue;
      connection.sendEvent(event);
      reached += 1;
    }
    return reached;
  }

  isOnline(uin: Uin): boolean {
    return (this.started.get(uin)?.size ?? 0) > 0;
  }

  all(): ClientConnection[] {
    return [...this.open];
  }

  /** Open connections signed in with any of the sessions. */
  ofSessions(sessionIds: readonly number[]): ClientConnection[] {
    const wanted = new Set(sessionIds);
    return this.all().filter((connection) => wanted.has(connection.sessionId));
  }
}
