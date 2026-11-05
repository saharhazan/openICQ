/** Derived views of the data: names, chat titles, the ordered chat list, previews and counters. */
import { S } from '../strings';
import { chatEventText, type EventNames } from './chatEventText';
import type { Chat, Me, Message, Uin, User } from './protocolTypes';
import type { DataState } from './types';

type Person = Pick<User, 'uin' | 'firstName' | 'lastName' | 'nickname'>;

/** "First Last", else the nickname, else the ICQ#. */
export function displayName(person: Person | null | undefined, uin?: Uin): string {
  if (!person) return uin === undefined ? '' : String(uin);
  const full = `${person.firstName} ${person.lastName}`.trim();
  return full || person.nickname || String(person.uin);
}

export function userName(state: Pick<DataState, 'users' | 'me'>, uin: Uin): string {
  if (state.me && uin === state.me.uin) return displayName(state.me);
  return displayName(state.users[uin], uin);
}

export function eventNames(state: Pick<DataState, 'users' | 'me'>): EventNames {
  return { me: state.me?.uin ?? 0, name: (uin) => userName(state, uin) };
}

export function chatTitle(state: Pick<DataState, 'users' | 'me'>, chat: Chat): string {
  if (chat.type === 'favorites') return S.recents.favorites;
  if (chat.type === 'group') return chat.title;
  return chat.peer === null ? chat.title : userName(state, chat.peer);
}

/** The avatar file of a chat row: the group's own, or the peer's. */
export function chatAvatarFileId(state: Pick<DataState, 'users' | 'me'>, chat: Chat): number | null {
  if (chat.type === 'direct' && chat.peer !== null) return state.users[chat.peer]?.avatarFileId ?? chat.avatarFileId;
  if (chat.type === 'favorites') return state.me?.avatarFileId ?? null;
  return chat.avatarFileId;
}

/** The colour seed of a chat's letter avatar: the peer's ICQ#, or the chat id. */
export function chatAvatarSeed(state: Pick<DataState, 'me'>, chat: Chat): number {
  if (chat.type === 'direct' && chat.peer !== null) return chat.peer;
  if (chat.type === 'favorites') return state.me?.uin ?? chat.id;
  return chat.id;
}

export interface ChatSections {
  pinned: Chat[];
  recents: Chat[];
}

function byActivity(a: Chat, b: Chat): number {
  const diff = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  return diff !== 0 ? diff : b.id - a.id;
}

/** PINNED in pin order (the server's order, newly pinned last), then RECENTS newest first. */
export function chatSections(chats: Readonly<Record<number, Chat>>, pinOrder: readonly number[]): ChatSections {
  const all = Object.values(chats);
  const position = (chat: Chat) => {
    const index = pinOrder.indexOf(chat.id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  const pinned = all.filter((c) => c.pinned).sort((a, b) => position(a) - position(b) || byActivity(a, b));
  const recents = all.filter((c) => !c.pinned).sort(byActivity);
  return { pinned, recents };
}

/** A chat counts as unread with unread messages or after "Mark as unread". */
export function isUnread(chat: Chat): boolean {
  return chat.unread > 0 || chat.markedUnread;
}

/** The window title and dock counter: unread messages of chats that are not muted. */
export function totalUnread(chats: Readonly<Record<number, Chat>>): number {
  let total = 0;
  for (const chat of Object.values(chats)) {
    if (chat.muted) continue;
    total += chat.unread > 0 ? chat.unread : chat.markedUnread ? 1 : 0;
  }
  return total;
}

/** One line for a message: its text, "Photo", "File", the service text, or the tombstone. */
export function messageSummary(state: Pick<DataState, 'users' | 'me'>, message: Message): string {
  if (message.deleted) return S.history.messageDeleted;
  if (message.event) return chatEventText(message.event, eventNames(state));
  const text = message.text.replace(/\s+/g, ' ').trim();
  if (text) return text;
  const first = message.attachments[0];
  if (!first) return '';
  if (first.kind === 'image') return S.recents.photo;
  return first.mime.startsWith('video/') ? S.recents.video : S.recents.file;
}

export interface Preview {
  /** "Me", "Anna", "Draft"; shown before a colon. */
  prefix: string | null;
  text: string;
  isDraft: boolean;
}

/** The second line of a chat row (RecentItemDelegate: sender prefix in groups, drafts first). */
export function chatPreview(state: Pick<DataState, 'users' | 'me'>, chat: Chat, draft: string): Preview {
  const draftText = draft.replace(/\s+/g, ' ').trim();
  if (draftText) return { prefix: S.recents.draft, text: draftText, isDraft: true };
  const message = chat.lastMessage;
  if (!message) return { prefix: null, text: '', isDraft: false };
  const text = messageSummary(state, message);
  if (chat.type !== 'group' || message.event || message.deleted) return { prefix: null, text, isDraft: false };
  const mine = state.me !== null && message.sender === state.me.uin;
  const sender = mine ? S.recents.me : (userName(state, message.sender).split(' ')[0] ?? '');
  return { prefix: sender, text, isDraft: false };
}

/** "Anna is typing...", "Anna, Ben are typing..." in a row; plain "is typing..." in direct chats. */
export function typingLine(state: Pick<DataState, 'users' | 'me'>, chat: Chat, typing: readonly Uin[]): string | null {
  if (typing.length === 0) return null;
  if (chat.type === 'direct') return S.recents.typing;
  const names = typing.map((uin) => userName(state, uin).split(' ')[0] ?? '').join(', ');
  return `${names} ${typing.length === 1 ? S.recents.typing : S.recents.areTyping}`;
}

export function isMine(me: Me | null, message: Pick<Message, 'sender'>): boolean {
  return me !== null && message.sender === me.uin;
}

/** The newest message id of a chat as far as this client knows. */
export function newestMessageId(state: Pick<DataState, 'histories'>, chat: Chat): number {
  const loaded = state.histories[chat.id]?.messages.at(-1)?.id ?? 0;
  return Math.max(loaded, chat.lastMessage?.id ?? 0);
}

/** Substring search over chat titles for the left column search. */
export function matchChats(state: Pick<DataState, 'users' | 'me' | 'chats'>, query: string): Chat[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return Object.values(state.chats)
    .filter((chat) => {
      const title = chatTitle(state, chat).toLowerCase();
      if (title.includes(q)) return true;
      const peer = chat.peer === null ? undefined : state.users[chat.peer];
      return peer !== undefined && ((peer.nickname ?? '').includes(q) || String(peer.uin) === q);
    })
    .sort(byActivity);
}
