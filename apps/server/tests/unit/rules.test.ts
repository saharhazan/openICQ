import { describe, expect, it } from 'vitest';
import {
  canDeleteForAll,
  canRemoveMember,
  canWrite,
  groupInviteAllowed,
  isAdminRole,
  orderedPair,
  peerOf,
  pickSuccessor,
  roleChangeRefusal,
} from '../../src/domain/rules.ts';
import { member } from './mocks.ts';

describe('group roles', () => {
  it('creator and admins run the group; read-only members cannot write', () => {
    expect(['creator', 'admin', 'member', 'readonly'].map((role) => isAdminRole(role as 'member'))).toEqual([true, true, false, false]);
    expect(canWrite('readonly')).toBe(false);
    expect(canWrite('member')).toBe(true);
  });

  it('only the creator assigns or revokes admins', () => {
    expect(roleChangeRefusal('creator', 'member', 'admin')).toBeNull();
    expect(roleChangeRefusal('creator', 'admin', 'member')).toBeNull();
    expect(roleChangeRefusal('admin', 'member', 'admin')).toMatch(/creator/);
    expect(roleChangeRefusal('admin', 'admin', 'readonly')).toMatch(/creator/);
  });

  it('admins switch members between member and read only; members cannot', () => {
    expect(roleChangeRefusal('admin', 'member', 'readonly')).toBeNull();
    expect(roleChangeRefusal('admin', 'readonly', 'member')).toBeNull();
    expect(roleChangeRefusal('member', 'readonly', 'member')).toMatch(/admins/);
  });

  it('nobody changes the creator', () => {
    expect(roleChangeRefusal('creator', 'creator', 'member')).toMatch(/creator/);
  });

  it('the creator removes anyone but themselves; admins remove members and read-only members', () => {
    expect(canRemoveMember('creator', 'admin')).toBe(true);
    expect(canRemoveMember('creator', 'creator')).toBe(false);
    expect(canRemoveMember('admin', 'readonly')).toBe(true);
    expect(canRemoveMember('admin', 'admin')).toBe(false);
    expect(canRemoveMember('member', 'member')).toBe(false);
  });
});

describe('delete for all', () => {
  it('allows your own messages anywhere and others only to group admins', () => {
    expect(canDeleteForAll('direct', 'member', true)).toBe(true);
    expect(canDeleteForAll('direct', 'member', false)).toBe(false);
    expect(canDeleteForAll('group', 'admin', false)).toBe(true);
    expect(canDeleteForAll('group', 'creator', false)).toBe(true);
    expect(canDeleteForAll('group', 'member', false)).toBe(false);
  });
});

describe('ownership transfer', () => {
  it('picks the most senior admin, else the most senior member, else nobody', () => {
    const members = [member(1, 101), member(1, 102, { role: 'admin' }), member(1, 103, { role: 'admin' })];
    expect(pickSuccessor(members)?.uin).toBe(102);
    expect(pickSuccessor([member(1, 104, { role: 'readonly' }), member(1, 105)])?.uin).toBe(104);
    expect(pickSuccessor([])).toBeNull();
  });
});

describe('who can add me to groups', () => {
  it('follows everybody, contacts and nobody', () => {
    expect(groupInviteAllowed('everybody', false)).toBe(true);
    expect(groupInviteAllowed('contacts', true)).toBe(true);
    expect(groupInviteAllowed('contacts', false)).toBe(false);
    expect(groupInviteAllowed('nobody', true)).toBe(false);
  });
});

describe('direct chat pairs', () => {
  it('orders the pair and finds the peer', () => {
    expect(orderedPair(200, 100)).toEqual([100, 200]);
    expect(peerOf([100, 200], 100)).toBe(200);
    expect(peerOf([100, 200], 200)).toBe(100);
  });
});
