/**
 * Pure group and chat rules (docs/architecture/icq-new-plan.md, server rules 4, 7 and 11).
 * Kept free of storage so the permission matrix is tested in isolation.
 */
import type { MemberRecord } from './entities.ts';
import type { AssignableRole, ChatType, GroupInvitePolicy, MemberRole, Uin } from './vocabulary.ts';

const ROLE_RANK: Readonly<Record<MemberRole, number>> = { creator: 0, admin: 1, member: 2, readonly: 3 };

/** Creator and admins run the group. */
export function isAdminRole(role: MemberRole): boolean {
  return role === 'creator' || role === 'admin';
}

/** "Ban to write": read-only members cannot send. */
export function canWrite(role: MemberRole): boolean {
  return role !== 'readonly';
}

/** Order of the member list: creator, admins, members, read-only, each by seniority. */
export function compareRoles(a: MemberRole, b: MemberRole): number {
  return ROLE_RANK[a] - ROLE_RANK[b];
}

/**
 * Why `actor` may not give `target` the role `next`, or null when allowed.
 * Only the creator assigns or revokes admins; admins switch members between
 * member and read-only; nobody changes the creator.
 */
export function roleChangeRefusal(actor: MemberRole, target: MemberRole, next: AssignableRole): string | null {
  if (target === 'creator') return "The creator's role cannot be changed.";
  if (next === 'admin' || target === 'admin') {
    return actor === 'creator' ? null : 'Only the creator can assign or revoke admins.';
  }
  return isAdminRole(actor) ? null : 'Only admins can change member roles.';
}

/** The creator removes anyone; admins remove members and read-only members. */
export function canRemoveMember(actor: MemberRole, target: MemberRole): boolean {
  if (actor === 'creator') return target !== 'creator';
  return actor === 'admin' && (target === 'member' || target === 'readonly');
}

/** "Delete for all": your own messages, or anyone's for the group's creator and admins. */
export function canDeleteForAll(chatType: ChatType, actorRole: MemberRole, isOwn: boolean): boolean {
  if (isOwn) return true;
  return chatType === 'group' && isAdminRole(actorRole);
}

/**
 * Who becomes creator when the creator leaves: the most senior admin, or the
 * most senior member when there is no admin. `remaining` is in seniority order.
 */
export function pickSuccessor(remaining: readonly MemberRecord[]): MemberRecord | null {
  return remaining.find((member) => member.role === 'admin') ?? remaining[0] ?? null;
}

/** "Who can add me to groups": `inviterIsContact` means the invitee saved the inviter as a contact. */
export function groupInviteAllowed(policy: GroupInvitePolicy, inviterIsContact: boolean): boolean {
  if (policy === 'everybody') return true;
  if (policy === 'contacts') return inviterIsContact;
  return false;
}

/** The two members of a direct chat, lower UIN first. */
export function orderedPair(a: Uin, b: Uin): readonly [Uin, Uin] {
  return a < b ? [a, b] : [b, a];
}

/** The other member of a direct chat. */
export function peerOf(pair: readonly [Uin, Uin], viewer: Uin): Uin {
  return pair[0] === viewer ? pair[1] : pair[0];
}
