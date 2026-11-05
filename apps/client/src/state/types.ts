/** The client's model of the server data, plus what only exists on this side (pending messages). */
import type { AccountSettings, AttachmentKind, Chat, Id, Me, Message, ReadMark, ReplyPreview, Uin, User } from './protocolTypes';

export type { AccountSettings, Chat, Id, Me, Message, ReadMark, ReplyPreview, Uin, User };

/** A file picked for sending, shown in the pending bubble until the server echo arrives. */
export interface LocalAttachment {
  name: string;
  size: number;
  kind: AttachmentKind;
  /** A data: URL for images (the CSP allows data: images, not blob:). */
  previewUrl: string | null;
  width: number | null;
  height: number | null;
}

/** A message on its way: drawn at once, matched to the server copy by `clientId`. */
export interface OutgoingMessage {
  clientId: string;
  chatId: Id;
  text: string;
  replyTo: ReplyPreview | null;
  attachments: LocalAttachment[];
  /** Epoch ms; the clock appears only after 500 ms. */
  createdAt: number;
  state: 'uploading' | 'pending' | 'failed';
}

export interface ChatHistory {
  /** Ascending by id. */
  messages: Message[];
  hasMore: boolean;
  loading: boolean;
  /** False until the first page arrived, and again after a reconnect (stale). */
  loaded: boolean;
}

export interface DataState {
  me: Me | null;
  settings: AccountSettings | null;
  users: Readonly<Record<number, User>>;
  contacts: readonly Uin[];
  chats: Readonly<Record<number, Chat>>;
  histories: Readonly<Record<number, ChatHistory>>;
  outbox: Readonly<Record<number, readonly OutgoingMessage[]>>;
  /** Group chats: each member's read and delivery marks, from chat.history and events. */
  readMarks: Readonly<Record<number, Readonly<Record<number, ReadMark>>>>;
  /** Who is typing in each chat right now. */
  typing: Readonly<Record<number, readonly Uin[]>>;
  /** Pinned chat ids in pin order: the snapshot's order, newly pinned chats at the end. */
  pinOrder: readonly Id[];
}

export const initialDataState: DataState = {
  me: null,
  settings: null,
  users: {},
  contacts: [],
  chats: {},
  histories: {},
  outbox: {},
  readMarks: {},
  typing: {},
  pinOrder: [],
};

export const emptyHistory: ChatHistory = { messages: [], hasMore: true, loading: false, loaded: false };
