/** Grouping and ordering of the Contact List window, as pure functions. */
import type { Status, Uin } from '@openicq/protocol';
import { type ChatState, unreadCount } from './chat';

export interface ContactRow {
  uin: Uin;
  nickname: string;
  status: Status;
  awaitingAuth: boolean;
  unread: number;
  inList: boolean;
}

export type SectionId = 'online' | 'offline' | 'awaiting' | 'notInList';

export interface ContactSection {
  id: SectionId;
  title: string;
  rows: ContactRow[];
}

/** Order inside a section: the status menu order, then the nickname. */
const STATUS_RANK: Record<Status, number> = {
  ffc: 0,
  online: 1,
  away: 2,
  na: 3,
  occupied: 4,
  dnd: 5,
  invisible: 6,
  offline: 7,
};

export function compareRows(a: ContactRow, b: ContactRow): number {
  const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (byStatus !== 0) return byStatus;
  const byName = a.nickname.localeCompare(b.nickname, 'en', { sensitivity: 'base' });
  return byName !== 0 ? byName : a.uin - b.uin;
}

/** Section captions of the original BCContactListBox (icq.exe read-only data). */
export const SECTION_TITLES: Record<SectionId, string> = {
  online: 'Online',
  offline: 'Offline',
  awaiting: 'Awaiting Authorization',
  notInList: 'Not In List',
};

/**
 * Online and Offline always exist (like the original list). "Awaiting
 * Authorization" holds contacts that have not authorized us yet, and
 * "Not In List" only appears while someone outside the list has written.
 */
export function groupContacts(state: ChatState): ContactSection[] {
  const rows: ContactRow[] = state.contacts.map((c) => ({
    uin: c.uin,
    nickname: c.nickname,
    status: c.status,
    awaitingAuth: c.awaitingAuth,
    unread: unreadCount(state, c.uin),
    inList: true,
  }));
  const authorized = rows.filter((r) => !r.awaitingAuth);
  const online = authorized.filter((r) => r.status !== 'offline').sort(compareRows);
  const offline = authorized.filter((r) => r.status === 'offline').sort(compareRows);
  const awaiting = rows.filter((r) => r.awaitingAuth).sort(compareRows);
  const sections: ContactSection[] = [
    { id: 'online', title: SECTION_TITLES.online, rows: online },
    { id: 'offline', title: SECTION_TITLES.offline, rows: offline },
  ];
  if (awaiting.length > 0) sections.push({ id: 'awaiting', title: SECTION_TITLES.awaiting, rows: awaiting });
  const notInList: ContactRow[] = state.notInList
    .filter((entry) => !state.contacts.some((c) => c.uin === entry.uin))
    .map((entry) => ({
      uin: entry.uin,
      nickname: entry.nickname,
      status: 'offline' as const,
      awaitingAuth: false,
      unread: unreadCount(state, entry.uin),
      inList: false,
    }))
    .sort(compareRows);
  if (notInList.length > 0) sections.push({ id: 'notInList', title: SECTION_TITLES.notInList, rows: notInList });
  return sections;
}

/** Total of unread messages from everyone, for the tray flower. */
export function totalUnread(state: ChatState): number {
  let total = 0;
  for (const key of Object.keys(state.conversations)) total += unreadCount(state, Number(key));
  return total;
}
