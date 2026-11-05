/**
 * Tracks open connections and the single live connection per UIN.
 * Implements `Notifier`: events reach a user only through the live connection.
 */
import type { ServerEvent, Uin } from '@openicq/protocol';
import type { Notifier } from '../../domain/ports.ts';
import type { ClientConnection } from './connection.ts';

export class ConnectionRegistry implements Notifier {
  private readonly open = new Set<ClientConnection>();
  private readonly live = new Map<Uin, ClientConnection>();

  track(connection: ClientConnection): void {
    this.open.add(connection);
  }

  /** Makes `connection` the live one for its UIN. Returns the connection it replaces, if any. */
  activate(connection: ClientConnection): ClientConnection | null {
    const previous = this.live.get(connection.uin);
    this.live.set(connection.uin, connection);
    return previous !== undefined && previous !== connection ? previous : null;
  }

  /** Forgets the connection. True when it was the live one, so its user just went offline. */
  release(connection: ClientConnection): boolean {
    this.open.delete(connection);
    if (this.live.get(connection.uin) !== connection) return false;
    this.live.delete(connection.uin);
    return true;
  }

  notify(uin: Uin, event: ServerEvent): void {
    this.live.get(uin)?.sendEvent(event);
  }

  all(): ClientConnection[] {
    return [...this.open];
  }
}
