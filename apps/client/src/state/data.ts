/**
 * Pure transitions of the server data: snapshot, history pages, push events,
 * optimistic sending. Every function returns a new state and never mutates.
 */
import type { Chat, Id, Message, ReadMark, ServerEvent, SessionSnapshot, Uin, User } from './protocolTypes';
import { emptyHistory, type ChatHistory, type DataState, type OutgoingMessage } from './types';

type Rec<T> = Readonly<Record<number, T>>;

function without<T>(record: Rec<T>, key: number): Rec<T> {
  if (!(key in record)) return record;
  return Object.fromEntries(Object.entries(record).filter(([id]) => Number(id) !== key)) as Record<number, T>;
}

export function mergeUsers(users: Rec<User>, incoming: readonly User[]): Rec<User> {
  if (incoming.length === 0) return users;
  const next: Record<number, User> = { ...users };
  for (const user of incoming) next[user.uin] = user;
  return next;
}

/** Inserts or replaces a message, keeping ascending id order. */
export function insertMessage(messages: readonly Message[], message: Message): Message[] {
  const index = messages.findIndex((m) => m.id >= message.id);
  if (index === -1) return [...messages, message];
  if (messages[index]?.id === message.id) return messages.map((m, i) => (i === index ? message : m));
  return [...messages.slice(0, index), message, ...messages.slice(index)];
}

/** The newest page replaces everything (ids are global, so a gap cannot be detected); older pages extend the top. */
function mergePage(existing: readonly Message[], page: readonly Message[], mode: 'latest' | 'older'): Message[] {
  if (mode === 'latest') return [...page].sort((a, b) => a.id - b.id);
  const ids = new Set(page.map((m) => m.id));
  return [...existing.filter((m) => !ids.has(m.id)), ...page].sort((a, b) => a.id - b.id);
}

export function applySnapshot(state: DataState, snapshot: SessionSnapshot): DataState {
  const chats: Record<number, Chat> = {};
  for (const chat of snapshot.chats) chats[chat.id] = chat;
  const histories: Record<number, ChatHistory> = {};
  // Histories survive a reconnect as stale pages; the open chat reloads and merges.
  for (const [id, history] of Object.entries(state.histories)) {
    if (chats[Number(id)]) histories[Number(id)] = { ...history, loaded: false, loading: false };
  }
  return {
    ...state,
    me: snapshot.me,
    settings: snapshot.settings,
    users: mergeUsers({}, snapshot.users),
    contacts: snapshot.contacts,
    chats,
    histories,
    typing: {},
    // The server lists pinned chats first, in pin order (rows carry no pin position).
    pinOrder: snapshot.chats.filter((c) => c.pinned).map((c) => c.id),
  };
}

function withPin(order: readonly Id[], chat: Chat): readonly Id[] {
  const has = order.includes(chat.id);
  if (chat.pinned === has) return order;
  return chat.pinned ? [...order, chat.id] : order.filter((id) => id !== chat.id);
}

export interface HistoryPage {
  messages: Message[];
  users: User[];
  readMarks: ReadMark[];
  hasMore: boolean;
}

export function setHistoryLoading(state: DataState, chatId: Id, loading: boolean): DataState {
  const history = state.histories[chatId] ?? emptyHistory;
  return { ...state, histories: { ...state.histories, [chatId]: { ...history, loading } } };
}

export function applyHistory(state: DataState, chatId: Id, page: HistoryPage, mode: 'latest' | 'older'): DataState {
  const history = state.histories[chatId] ?? emptyHistory;
  const messages = mergePage(history.messages, page.messages, mode);
  const hasMore = page.hasMore;
  const marks: Record<number, ReadMark> = { ...(state.readMarks[chatId] ?? {}) };
  for (const mark of page.readMarks) marks[mark.uin] = mark;
  return {
    ...state,
    users: mergeUsers(state.users, page.users),
    histories: { ...state.histories, [chatId]: { messages, hasMore, loading: false, loaded: true } },
    readMarks: { ...state.readMarks, [chatId]: marks },
    outbox: confirmFromMessages(state.outbox, chatId, page.messages),
  };
}

function confirmFromMessages(outbox: Rec<readonly OutgoingMessage[]>, chatId: Id, messages: readonly Message[]) {
  const pending = outbox[chatId];
  if (!pending || pending.length === 0) return outbox;
  const echoed = new Set(messages.map((m) => m.clientId).filter((id): id is string => id !== null));
  const rest = pending.filter((p) => !echoed.has(p.clientId));
  return rest.length === pending.length ? outbox : { ...outbox, [chatId]: rest };
}

/** A confirmed message from a request result or an event: the pending copy goes, the real one stays. */
export function upsertMessage(state: DataState, message: Message): DataState {
  const history = state.histories[message.chatId];
  const histories = history
    ? { ...state.histories, [message.chatId]: { ...history, messages: insertMessage(history.messages, message) } }
    : state.histories;
  const chat = state.chats[message.chatId];
  const isNewest = chat && (chat.lastMessage === null || chat.lastMessage.id <= message.id);
  // The acting socket gets no `message` event for its own send, so the row moves up here.
  const updatedAt = chat && Date.parse(message.sentAt) > Date.parse(chat.updatedAt) ? message.sentAt : chat?.updatedAt;
  const chats =
    chat && isNewest ? { ...state.chats, [chat.id]: { ...chat, lastMessage: message, updatedAt: updatedAt ?? chat.updatedAt } } : state.chats;
  return { ...state, histories, chats, outbox: confirmFromMessages(state.outbox, message.chatId, [message]) };
}

export function addOutgoing(state: DataState, outgoing: OutgoingMessage): DataState {
  const list = state.outbox[outgoing.chatId] ?? [];
  return { ...state, outbox: { ...state.outbox, [outgoing.chatId]: [...list, outgoing] } };
}

export function setOutgoingState(state: DataState, chatId: Id, clientId: string, next: OutgoingMessage['state']): DataState {
  const list = state.outbox[chatId];
  if (!list?.some((o) => o.clientId === clientId)) return state;
  return { ...state, outbox: { ...state.outbox, [chatId]: list.map((o) => (o.clientId === clientId ? { ...o, state: next } : o)) } };
}

export function dropOutgoing(state: DataState, chatId: Id, clientId: string): DataState {
  const list = state.outbox[chatId];
  if (!list) return state;
  return { ...state, outbox: { ...state.outbox, [chatId]: list.filter((o) => o.clientId !== clientId) } };
}

export function upsertChat(state: DataState, chat: Chat, users: readonly User[] = []): DataState {
  return {
    ...state,
    chats: { ...state.chats, [chat.id]: chat },
    users: mergeUsers(state.users, users),
    pinOrder: withPin(state.pinOrder, chat),
  };
}

export function patchChat(state: DataState, chatId: Id, patch: Partial<Chat>): DataState {
  const chat = state.chats[chatId];
  if (!chat) return state;
  const next = { ...chat, ...patch };
  return { ...state, chats: { ...state.chats, [chatId]: next }, pinOrder: withPin(state.pinOrder, next) };
}

export function removeChat(state: DataState, chatId: Id): DataState {
  return {
    ...state,
    chats: without(state.chats, chatId),
    histories: without(state.histories, chatId),
    outbox: without(state.outbox, chatId),
    readMarks: without(state.readMarks, chatId),
    typing: without(state.typing, chatId),
    pinOrder: state.pinOrder.filter((id) => id !== chatId),
  };
}

/**
 * "Read up to": unread goes to zero when the newest message is covered; otherwise
 * it is counted again from the loaded history when that history reaches back far enough.
 */
export function markChatRead(state: DataState, chatId: Id, messageId: Id): DataState {
  const chat = state.chats[chatId];
  if (!chat) return state;
  const lastReadId = Math.max(chat.lastReadId, messageId);
  const coversNewest = chat.lastMessage === null || lastReadId >= chat.lastMessage.id;
  let unread = coversNewest ? 0 : chat.unread;
  const history = state.histories[chatId];
  const me = state.me?.uin;
  if (!coversNewest && history?.loaded && (!history.hasMore || (history.messages[0]?.id ?? Infinity) <= lastReadId)) {
    unread = history.messages.filter((m) => m.id > lastReadId && m.sender !== me && !m.deleted).length;
  }
  return patchChat(state, chatId, { lastReadId, markedUnread: false, unread });
}

export function removeMessages(state: DataState, chatId: Id, ids: readonly Id[]): DataState {
  const drop = new Set(ids);
  const history = state.histories[chatId];
  const histories = history
    ? { ...state.histories, [chatId]: { ...history, messages: history.messages.filter((m) => !drop.has(m.id)) } }
    : state.histories;
  const chat = state.chats[chatId];
  let chats = state.chats;
  const loaded = histories[chatId];
  // Without the loaded history the new last message is unknown: keep the row until the server's chat.updated.
  if (chat?.lastMessage && drop.has(chat.lastMessage.id) && loaded?.loaded) {
    const remaining = loaded.messages.at(-1);
    if (remaining || !loaded.hasMore) chats = { ...chats, [chatId]: { ...chat, lastMessage: remaining ?? null } };
  }
  return { ...state, histories, chats };
}

/** Clear history: everything currently loaded disappears for this viewer. */
export function clearChat(state: DataState, chatId: Id): DataState {
  const history = state.histories[chatId];
  const histories = history ? { ...state.histories, [chatId]: { ...history, messages: [], hasMore: false } } : state.histories;
  return patchChat({ ...state, histories }, chatId, { lastMessage: null, unread: 0, markedUnread: false });
}

export function setTyping(state: DataState, chatId: Id, uin: Uin, typing: boolean): DataState {
  const list = state.typing[chatId] ?? [];
  const has = list.includes(uin);
  if (typing === has) return state;
  const next = typing ? [...list, uin] : list.filter((u) => u !== uin);
  return { ...state, typing: next.length ? { ...state.typing, [chatId]: next } : without(state.typing, chatId) };
}

function moveMark(state: DataState, chatId: Id, uin: Uin, field: 'lastReadId' | 'lastDeliveredId', messageId: Id): DataState {
  const marks = state.readMarks[chatId] ?? {};
  const current = marks[uin] ?? { uin, lastReadId: 0, lastDeliveredId: 0 };
  const mark: ReadMark = { ...current, [field]: Math.max(current[field], messageId) };
  // Reading implies receiving.
  if (field === 'lastReadId') mark.lastDeliveredId = Math.max(mark.lastDeliveredId, messageId);
  return { ...state, readMarks: { ...state.readMarks, [chatId]: { ...marks, [uin]: mark } } };
}

function applyRead(state: DataState, chatId: Id, uin: Uin, messageId: Id): DataState {
  if (state.me && uin === state.me.uin) return markChatRead(state, chatId, messageId);
  const chat = state.chats[chatId];
  let next = moveMark(state, chatId, uin, 'lastReadId', messageId);
  if (chat && chat.type === 'direct' && chat.peer === uin) {
    next = patchChat(next, chatId, {
      peerReadId: Math.max(chat.peerReadId, messageId),
      peerDeliveredId: Math.max(chat.peerDeliveredId, messageId),
    });
  }
  return next;
}

function applyDelivered(state: DataState, chatId: Id, uin: Uin, messageId: Id): DataState {
  const chat = state.chats[chatId];
  let next = moveMark(state, chatId, uin, 'lastDeliveredId', messageId);
  if (chat && chat.type === 'direct' && chat.peer === uin) {
    next = patchChat(next, chatId, { peerDeliveredId: Math.max(chat.peerDeliveredId, messageId) });
  }
  return next;
}

function setContacts(state: DataState, contacts: readonly Uin[]): DataState {
  const set = new Set(contacts);
  const users: Record<number, User> = {};
  for (const user of Object.values(state.users)) users[user.uin] = { ...user, isContact: set.has(user.uin) };
  return { ...state, contacts, users };
}

export function applyEvent(state: DataState, event: ServerEvent): DataState {
  switch (event.type) {
    case 'message': {
      const withChat = upsertChat(state, event.chat, event.users);
      return setTyping(upsertMessage(withChat, event.message), event.message.chatId, event.message.sender, false);
    }
    case 'message.updated':
      return upsertMessage(state, event.message);
    case 'messages.removed':
      return removeMessages(state, event.chatId, event.messageIds);
    case 'chat.updated':
      return upsertChat(state, event.chat, event.users);
    case 'chat.removed':
      return removeChat(state, event.chatId);
    case 'read':
      return applyRead(state, event.chatId, event.uin, event.messageId);
    case 'delivered':
      return applyDelivered(state, event.chatId, event.uin, event.messageId);
    case 'typing':
      return state.me && event.uin === state.me.uin ? state : setTyping(state, event.chatId, event.uin, true);
    case 'presence': {
      const user = state.users[event.uin];
      return user ? { ...state, users: { ...state.users, [event.uin]: { ...user, presence: event.presence } } } : state;
    }
    case 'user.updated': {
      const users = mergeUsers(state.users, [event.user]);
      // My own UIN: the profile changed on another device (there is no me.updated).
      if (!state.me || event.user.uin !== state.me.uin) return { ...state, users };
      const { nickname, firstName, lastName, about, avatarFileId } = event.user;
      return { ...state, users, me: { ...state.me, nickname, firstName, lastName, about, avatarFileId } };
    }
    case 'contacts.changed':
      return setContacts(state, event.contacts);
    case 'session.closed':
      return state;
  }
}
