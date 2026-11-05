import { describe, expect, it } from 'vitest';
import { user } from '../../../tests/fixtures';
import { memberActions, pickableContacts, roleLabel, sortMembers } from './groupHelpers';

describe('group helpers', () => {
  it('labels Creator, Admin and Read Only, and nothing for members', () => {
    expect(roleLabel('creator')).toBe('Creator');
    expect(roleLabel('admin')).toBe('Admin');
    expect(roleLabel('readonly')).toBe('Read Only');
    expect(roleLabel('member')).toBeNull();
  });

  it('lets only the creator assign and revoke admins', () => {
    expect(memberActions('creator', 'member', false)).toEqual(['assignAdmin', 'banToWrite', 'delete', 'profile']);
    expect(memberActions('creator', 'admin', false)).toEqual(['revokeAdmin', 'delete', 'profile']);
    expect(memberActions('admin', 'member', false)).toEqual(['banToWrite', 'delete', 'profile']);
    expect(memberActions('admin', 'readonly', false)).toEqual(['allowToWrite', 'delete', 'profile']);
  });

  it('gives no actions on the creator, on oneself, on other admins for admins, or to plain members', () => {
    expect(memberActions('admin', 'creator', false)).toEqual(['profile']);
    expect(memberActions('creator', 'creator', true)).toEqual(['profile']);
    expect(memberActions('admin', 'admin', false)).toEqual(['profile']);
    expect(memberActions('member', 'member', false)).toEqual(['profile']);
    expect(memberActions('readonly', 'member', false)).toEqual(['profile']);
  });

  it('sorts members by rank, then by name', () => {
    const names: Record<number, string> = { 1: 'Zed', 2: 'Amy', 3: 'Bob', 4: 'Cid' };
    const sorted = sortMembers(
      [
        { uin: 3, role: 'member' as const },
        { uin: 4, role: 'readonly' as const },
        { uin: 2, role: 'admin' as const },
        { uin: 1, role: 'creator' as const },
      ],
      (uin) => names[uin] ?? '',
    );
    expect(sorted.map((m) => m.uin)).toEqual([1, 2, 3, 4]);
  });

  it('offers known, unblocked contacts that are not excluded, by name', () => {
    const users = { 1: user(1, 'Ben'), 2: user(2, 'Anna'), 3: user(3, 'Cara', { blocked: true }), 4: user(4, 'Dan') };
    const picked = pickableContacts(users, [1, 2, 3, 4, 5], new Set([4]));
    expect(picked.map((u) => u.firstName)).toEqual(['Anna', 'Ben']);
  });
});
