/** Small infrastructure adapters: the system clock, session tokens and invite link tokens. */
import { createHash, randomBytes } from 'node:crypto';
import type { Clock, InviteTokens, IssuedToken, SessionTokens } from '../domain/ports.ts';

const SESSION_TOKEN_BYTES = 32;
const INVITE_TOKEN_BYTES = 16;

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Random 32-byte tokens; only their SHA-256 is stored. */
export class RandomSessionTokens implements SessionTokens {
  issue(): IssuedToken {
    const token = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
    return { token, tokenHash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

/** Invite links: 16 random bytes in base64url (22 characters). */
export class RandomInviteTokens implements InviteTokens {
  issue(): string {
    return randomBytes(INVITE_TOKEN_BYTES).toString('base64url');
  }
}
