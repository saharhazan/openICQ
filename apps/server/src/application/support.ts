/** Small helpers shared by the application services. */
import type { Uin } from '@openicq/protocol';
import type { UserRecord } from '../domain/entities.ts';
import { DomainError } from '../domain/errors.ts';
import type { UserRepository } from '../domain/repositories.ts';

export function unknownUser(uin: Uin): DomainError {
  return new DomainError('not_found', `No ICQ user has the UIN ${uin}.`);
}

export function requireUser(users: UserRepository, uin: Uin): UserRecord {
  const user = users.findByUin(uin);
  if (user === null) throw unknownUser(uin);
  return user;
}

/** Returns a copy of `base` with every defined value of `patch` applied. */
export function mergeDefined<T extends object>(base: T, patch: Partial<T>): T {
  const result = { ...base };
  // Object.keys loses the key type; every key comes from `patch`, a Partial<T>, so it is a key of T.
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const value = patch[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}
