/**
 * The conversation and contact part of the client state, with pure transitions.
 * Every server event goes through applyServerEvent; nothing here touches the network.
 */
import type {
  AutoResponse,
  ChatMessage,
  Contact,
  NotInListEntry,
  ServerEvent,
  SessionSnapshot,
  SystemNotice,
  Uin,
} from '@openicq/protocol';

export interface Conversation {
  /** Sorted by id, oldest first, without duplicates. */
  messages: ChatMessage[];
  /** True once the newest history page was fetched. */
  historyLoaded: boolean;
  /** True while older history pages exist on the server. */
  hasMoreHistory: boolean;
  /** Auto-responses received after sending to someone who is away (not stored on the server). */
  autoResponses: AutoResponseNote[];
}

export interface AutoResponseNote extends AutoResponse {
  /** The own message that triggered it. */
  afterMessageId: number;
}

export type KickReason = 'other_location' | 'signed_out';

export interface ChatState {
  selfUin: Uin | null;
  contacts: Contact[];
  notInList: NotInListEntry[];
  conversations: Partial<Record<Uin, Conversation>>;
  notices: SystemNotice[];
  ignored: Uin[];
  kicked: KickReason | null;
}

export const initialChatState: ChatState = {
  selfUin: null,
  contacts: [],
  notInList: [],
  conversations: {},
  notices: [],
  ignored: [],
  kicked: null,
};

const EMPTY_CONVERSATION: Conversation = { messages: [], historyLoaded: false, hasMoreHistory: true, autoResponses: [] };

/** The other party of a message, seen from the signed-in user. */
export function peerOf(message: ChatMessage, selfUin: Uin | null): Uin {
  return message.from === selfUin ? message.to : message.from;
}

export function conversationOf(state: ChatState, uin: Uin): Conversation {
  return state.conversations[uin] ?? EMPTY_CONVERSATION;
}

export function unreadCount(state: ChatState, uin: Uin): number {
  return conversationOf(state, uin).messages.filter((m) => m.from === uin && !m.read).length;
}

export function findContact(state: ChatState, uin: Uin): Contact | undefined {
  return state.contacts.find((contact) => contact.uin === uin);
}

/** Merges messages into a sorted, de-duplicated list. Later copies of the same id win. */
export function mergeMessages(existing: readonly ChatMessage[], incoming: readonly ChatMessage[]): ChatMessage[] {
  const byId = new Map<number, ChatMessage>();
  for (const message of existing) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

function withConversation(state: ChatState, uin: Uin, update: (conversation: Conversation) => Conversation): ChatState {
  return { ...state, conversations: { ...state.conversations, [uin]: update(conversationOf(state, uin)) } };
}

export function addMessages(state: ChatState, peer: Uin, messages: readonly ChatMessage[]): ChatState {
  return withConversation(state, peer, (c) => ({ ...c, messages: mergeMessages(c.messages, messages) }));
}

/** Stores a page from history.get. */
export function applyHistoryPage(state: ChatState, peer: Uin, messages: readonly ChatMessage[], hasMore: boolean): ChatState {
  return withConversation(state, peer, (c) => ({
    ...c,
    messages: mergeMessages(c.messages, messages),
    historyLoaded: true,
    hasMoreHistory: hasMore,
  }));
}

export function addAutoResponse(state: ChatState, peer: Uin, afterMessageId: number, response: AutoResponse): ChatState {
  return withConversation(state, peer, (c) => ({
    ...c,
    autoResponses: [...c.autoResponses, { ...response, afterMessageId }],
  }));
}

/** Local effect of message.markRead: every message from the peer becomes read. */
export function markConversationRead(state: ChatState, peer: Uin): ChatState {
  const conversation = state.conversations[peer];
  if (!conversation || !conversation.messages.some((m) => m.from === peer && !m.read)) return state;
  return withConversation(state, peer, (c) => ({
    ...c,
    messages: c.messages.map((m) => (m.from === peer && !m.read ? { ...m, read: true } : m)),
  }));
}

/** Marks only the given messages from the peer as read (the ones the server was asked about). */
export function markMessagesRead(state: ChatState, peer: Uin, ids: readonly number[]): ChatState {
  const wanted = new Set(ids);
  const conversation = state.conversations[peer];
  if (!conversation || !conversation.messages.some((m) => wanted.has(m.id) && !m.read)) return state;
  return withConversation(state, peer, (c) => ({
    ...c,
    messages: c.messages.map((m) => (wanted.has(m.id) && !m.read ? { ...m, read: true } : m)),
  }));
}

export function upsertContact(state: ChatState, contact: Contact): ChatState {
  const exists = state.contacts.some((c) => c.uin === contact.uin);
  return {
    ...state,
    contacts: exists ? state.contacts.map((c) => (c.uin === contact.uin ? contact : c)) : [...state.contacts, contact],
    notInList: state.notInList.filter((entry) => entry.uin !== contact.uin),
  };
}

export function removeContact(state: ChatState, uin: Uin): ChatState {
  const removed = findContact(state, uin);
  if (!removed) return state;
  const contacts = state.contacts.filter((c) => c.uin !== uin);
  // Unread messages from a removed contact stay reachable under "Not In List".
  const keepAsNotInList = unreadCount(state, uin) > 0 && !state.notInList.some((e) => e.uin === uin);
  const notInList = keepAsNotInList ? [...state.notInList, { uin, nickname: removed.nickname }] : state.notInList;
  return { ...state, contacts, notInList };
}

export function removeNotice(state: ChatState, noticeId: number): ChatState {
  return { ...state, notices: state.notices.filter((n) => n.id !== noticeId) };
}

/** Going offline: the list stays visible but nobody is shown as online any more. */
export function allContactsOffline(state: ChatState): ChatState {
  if (state.contacts.every((c) => c.status === 'offline')) return state;
  return { ...state, contacts: state.contacts.map((c) => (c.status === 'offline' ? c : { ...c, status: 'offline' })) };
}

export function setIgnored(state: ChatState, uin: Uin, ignored: boolean): ChatState {
  const without = state.ignored.filter((u) => u !== uin);
  return { ...state, ignored: ignored ? [...without, uin] : without };
}

/** Rebuilds the state from session.start. Loaded history survives a reconnect. */
export function applySnapshot(state: ChatState, snapshot: SessionSnapshot): ChatState {
  const sameUser = state.selfUin === snapshot.self.uin;
  let next: ChatState = {
    selfUin: snapshot.self.uin,
    contacts: snapshot.contacts,
    notInList: snapshot.notInList,
    conversations: sameUser ? state.conversations : {},
    notices: snapshot.notices,
    ignored: snapshot.ignored,
    kicked: null,
  };
  const unreadByPeer = new Map<Uin, ChatMessage[]>();
  for (const message of snapshot.unread) {
    const peer = peerOf(message, snapshot.self.uin);
    unreadByPeer.set(peer, [...(unreadByPeer.get(peer) ?? []), message]);
  }
  for (const [peer, messages] of unreadByPeer) next = addMessages(next, peer, messages);
  return next;
}

function applyIncomingMessage(state: ChatState, message: ChatMessage): ChatState {
  const peer = peerOf(message, state.selfUin);
  let next = addMessages(state, peer, [message]);
  const known = findContact(next, peer) || next.notInList.some((e) => e.uin === peer);
  if (!known && message.from === peer) {
    next = { ...next, notInList: [...next.notInList, { uin: peer, nickname: String(peer) }] };
  }
  return next;
}

/** The single entry point for server push events. Pure: same input, same output. */
export function applyServerEvent(state: ChatState, event: ServerEvent): ChatState {
  switch (event.type) {
    case 'presence': {
      const contact = findContact(state, event.uin);
      if (!contact || contact.status === event.status) return state;
      return upsertContact(state, { ...contact, status: event.status });
    }
    case 'message':
      return applyIncomingMessage(state, event.message);
    case 'notice':
      if (state.notices.some((n) => n.id === event.notice.id)) return state;
      return { ...state, notices: [...state.notices, event.notice] };
    case 'contact.updated':
      return upsertContact(state, event.contact);
    case 'contact.removed':
      return removeContact(state, event.uin);
    case 'session.kicked':
      return { ...allContactsOffline(state), kicked: event.reason };
  }
}
