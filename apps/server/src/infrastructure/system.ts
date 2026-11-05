/** Small infrastructure adapters: the system clock, session tokens and the in-memory presence registry. */
import { createHash, randomBytes } from 'node:crypto';
import type { SettableStatus, Uin } from '@openicq/protocol';
import type { Clock, IssuedToken, PresenceRegistry, SessionTokens } from '../domain/ports.ts';

const TOKEN_BYTES = 32;

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Random 32-byte tokens; only their SHA-256 is stored. */
export class RandomSessionTokens implements SessionTokens {
  issue(): IssuedToken {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    return { token, tokenHash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

/** Presence of a single server process. A multi-server setup would back this port with Redis. */
export class InMemoryPresenceRegistry implements PresenceRegistry {
  private readonly statuses = new Map<Uin, SettableStatus>();

  statusOf(uin: Uin): SettableStatus | null {
    return this.statuses.get(uin) ?? null;
  }

  set(uin: Uin, status: SettableStatus): void {
    this.statuses.set(uin, status);
  }

  remove(uin: Uin): void {
    this.statuses.delete(uin);
  }
}
