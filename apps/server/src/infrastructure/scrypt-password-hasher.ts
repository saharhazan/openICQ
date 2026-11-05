/**
 * scrypt password hashing with a random per-user salt. Stored format:
 * `scrypt$N$r$p$salt$hash` (salt and hash in base64), so parameters can be raised later.
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import type { PasswordHasher } from '../domain/ports.ts';

const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const DEFAULT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { ...options, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

function parse(stored: string): { options: ScryptOptions; salt: Buffer; key: Buffer } {
  const [scheme, n, r, p, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || n === undefined || r === undefined || p === undefined || !salt || !key) {
    throw new Error('Stored password hash has an unknown format');
  }
  return {
    options: { N: Number(n), r: Number(r), p: Number(p) },
    salt: Buffer.from(salt, 'base64'),
    key: Buffer.from(key, 'base64'),
  };
}

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const key = await derive(password, salt, DEFAULT_PARAMS);
    const { N, r, p } = DEFAULT_PARAMS;
    return ['scrypt', N, r, p, salt.toString('base64'), key.toString('base64')].join('$');
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const { options, salt, key } = parse(stored);
    const candidate = await derive(password, salt, options);
    return candidate.length === key.length && timingSafeEqual(candidate, key);
  }
}
