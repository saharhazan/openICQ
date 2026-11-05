/**
 * Group helpers shared by the dialogs and the sidebar: role labels, who may
 * do what to a member (sidebar/GroupProfile.cpp), the invite link message
 * and the clipboard.
 */
import type { Chat, MemberRole, User } from '@openicq/protocol';
import type { Services } from '../../app/services';
import { inviteLink } from '../../app/GroupCommands';
import { displayName } from '../../state/selectors';
import { S, fmt } from '../../strings';

/** popup_window "Join the group %1": the text sent with an invite link. */
export const JOIN_THE_GROUP = 'Join the group %1';

/** Creator, Admin, Read Only; nothing for plain members (contact_list/ContactListItemDelegate.cpp). */
export function roleLabel(role: MemberRole): string | null {
  switch (role) {
    case 'creator':
      return S.groups.creator;
    case 'admin':
      return S.groups.admin;
    case 'readonly':
      return S.groups.readOnly;
    case 'member':
      return null;
  }
}

export function isAdminRole(role: MemberRole): boolean {
  return role === 'creator' || role === 'admin';
}

export type MemberAction = 'assignAdmin' | 'revokeAdmin' | 'banToWrite' | 'allowToWrite' | 'delete' | 'profile';

/**
 * The member menu for a viewer: only the creator assigns or revokes admins;
 * admins ban, allow and delete plain members; nobody acts on the creator or on themselves.
 */
export function memberActions(viewer: MemberRole, target: MemberRole, isSelf: boolean): MemberAction[] {
  if (isSelf || !isAdminRole(viewer) || target === 'creator') return ['profile'];
  const actions: MemberAction[] = [];
  if (viewer === 'creator') actions.push(target === 'admin' ? 'revokeAdmin' : 'assignAdmin');
  if (target === 'member') actions.push('banToWrite');
  if (target === 'readonly') actions.push('allowToWrite');
  if (target !== 'admin' || viewer === 'creator') actions.push('delete');
  actions.push('profile');
  return actions;
}

/** Members first by rank (creator, admins, members, read only), then by name. */
export function sortMembers<T extends { uin: number; role: MemberRole }>(members: readonly T[], name: (uin: number) => string): T[] {
  const rank: Record<MemberRole, number> = { creator: 0, admin: 1, member: 2, readonly: 3 };
  return [...members].sort((a, b) => rank[a.role] - rank[b.role] || name(a.uin).localeCompare(name(b.uin)));
}

/** Contacts that can be invited: known users in the contact list, not blocked, minus the excluded ones. */
export function pickableContacts(users: Readonly<Record<number, User>>, contacts: readonly number[], exclude: ReadonlySet<number>): User[] {
  return contacts
    .map((uin) => users[uin])
    .filter((user): user is User => user !== undefined && !user.blocked && !exclude.has(user.uin))
    .sort((a, b) => displayName(a).localeCompare(displayName(b)));
}

export function groupInviteLink(chat: Chat | undefined): string | null {
  const token = chat?.group?.inviteToken;
  return token ? inviteLink(window.location.origin, token) : null;
}

/** Writes to the clipboard; reports a failure instead of pretending success. */
export async function copyText(services: Pick<Services, 'store'>, text: string, done: string): Promise<boolean> {
  const state = services.store.getState();
  try {
    if (!navigator.clipboard) throw new Error('The clipboard is not available in this browser.');
    await navigator.clipboard.writeText(text);
    state.toast(done);
    return true;
  } catch (error) {
    state.reportError(error);
    return false;
  }
}

function directChatId(services: Pick<Services, 'store'>, uin: number): number | null {
  const chat = Object.values(services.store.getState().data.chats).find((c) => c.type === 'direct' && c.peer === uin);
  return chat ? chat.id : null;
}

/**
 * "Send them invite link": a direct message with the group link to each user
 * the server refused to add. Opens (or creates) each direct chat on the way.
 */
export async function sendInviteLinks(services: Pick<Services, 'store' | 'chats'>, groupChatId: number, uins: readonly number[]): Promise<boolean> {
  const link = groupInviteLink(services.store.getState().data.chats[groupChatId]);
  if (!link) {
    services.store.getState().reportError(new Error(S.dialogs.errorOccurred));
    return false;
  }
  const text = fmt(JOIN_THE_GROUP, link);
  for (const uin of uins) {
    let chatId = directChatId(services, uin);
    if (chatId === null) {
      await services.chats.openDirect(uin);
      chatId = directChatId(services, uin);
    }
    if (chatId === null) continue;
    await services.chats.send(chatId, text);
  }
  return true;
}

export function namesOf(users: Readonly<Record<number, User>>, uins: readonly number[]): string {
  return uins.map((uin) => displayName(users[uin], uin)).join(', ');
}
