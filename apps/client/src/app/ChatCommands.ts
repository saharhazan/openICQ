/**
 * What the chat list and the conversation ask the server: history, sending
 * (optimistic, matched by clientId), editing, deleting, reactions, forwarding,
 * read marks, typing and the chat row actions. Failures are reported as toasts.
 */
import type { Message, Reaction, ReplyPreview } from '@openicq/protocol';
import {
  addOutgoing,
  applyHistory,
  clearChat,
  dropOutgoing,
  markChatRead,
  mergeUsers,
  patchChat,
  removeChat,
  removeMessages,
  setHistoryLoading,
  setOutgoingState,
  upsertChat,
  upsertMessage,
} from '../state/data';
import { isIcqError } from '../net/errors';
import { newestMessageId } from '../state/selectors';
import type { AppStore } from '../state/store';
import type { LocalAttachment, OutgoingMessage } from '../state/types';
import { S } from '../strings';
import { toLocalAttachment } from './attachments';
import type { Api, Connection } from './ports';

/** At most one typing notice per chat in this interval while the user keeps typing. */
export const TYPING_INTERVAL_MS = 3_000;
/** The server accepts one typing notice per chat in this interval (plus a margin for clock jitter). */
export const SERVER_TYPING_INTERVAL_MS = 2_100;

export interface OutgoingSound {
  outgoing(): void;
}

export interface ChatCommandDeps {
  api: Api;
  connection: Connection;
  store: AppStore;
  sound: OutgoingSound;
  now?: () => number;
}

interface Retry {
  text: string;
  files: File[];
  replyTo: ReplyPreview | null;
}

export function replyPreviewOf(message: Message): ReplyPreview {
  return {
    messageId: message.id,
    sender: message.sender,
    text: message.text.slice(0, 200),
    hasAttachments: message.attachments.length > 0,
    deleted: message.deleted,
  };
}

let clientCounter = 0;
function newClientId(now: number): string {
  clientCounter += 1;
  return `${now.toString(36)}-${clientCounter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class ChatCommands {
  readonly #api: Api;
  readonly #connection: Connection;
  readonly #store: AppStore;
  readonly #sound: OutgoingSound;
  readonly #now: () => number;
  readonly #retries = new Map<string, Retry>();
  readonly #lastTyping = new Map<number, number>();
  readonly #reading = new Map<number, number>();

  constructor(deps: ChatCommandDeps) {
    this.#api = deps.api;
    this.#connection = deps.connection;
    this.#store = deps.store;
    this.#sound = deps.sound;
    this.#now = deps.now ?? Date.now;
  }

  /** Loads a page; false after a failure (reported), so callers can stop retrying on their own. */
  async loadHistory(chatId: number, mode: 'latest' | 'older'): Promise<boolean> {
    const state = this.#store.getState();
    const history = state.data.histories[chatId];
    if (history?.loading) return true;
    if (mode === 'older' && (!history || !history.hasMore)) return true;
    const beforeId = mode === 'older' ? history?.messages[0]?.id : undefined;
    state.updateData((data) => setHistoryLoading(data, chatId, true));
    try {
      const page = await this.#connection.request('chat.history', beforeId === undefined ? { chatId } : { chatId, beforeId });
      this.#store.getState().updateData((data) => applyHistory(data, chatId, page, mode));
      return true;
    } catch (error) {
      this.#store.getState().updateData((data) => setHistoryLoading(data, chatId, false));
      this.#store.getState().reportError(error);
      return false;
    }
  }

  /** After a reconnect: the open chat's newest page again. */
  reloadOpenChat(): void {
    const chatId = this.#store.getState().selectedChatId;
    if (chatId !== null) void this.loadHistory(chatId, 'latest');
  }

  /** Opens (or creates) the direct chat with a user and shows it. */
  async openDirect(uin: number): Promise<void> {
    const existing = Object.values(this.#store.getState().data.chats).find((c) => c.type === 'direct' && c.peer === uin);
    if (existing) {
      this.#store.getState().openChat(existing.id);
      return;
    }
    try {
      const { chat, users } = await this.#connection.request('chat.direct', { uin });
      const state = this.#store.getState();
      state.updateData((data) => upsertChat(data, chat, users));
      state.openChat(chat.id);
    } catch (error) {
      this.#store.getState().reportError(error);
    }
  }

  /**
   * Sends a message: drawn at once as pending, files uploaded first, then
   * message.send; the result replaces the pending copy. `previews` reuses the
   * previews a dialog already built; `clientId` is kept by a retry.
   */
  async send(
    chatId: number,
    text: string,
    files: File[] = [],
    replyTo: ReplyPreview | null = null,
    options: { clientId?: string; previews?: LocalAttachment[] } = {},
  ): Promise<void> {
    const id = options.clientId ?? newClientId(this.#now());
    const report = (error: Error) => this.#store.getState().reportError(error);
    const attachments =
      options.previews && options.previews.length === files.length
        ? options.previews
        : await Promise.all(files.map((file) => toLocalAttachment(file, report)));
    const outgoing: OutgoingMessage = {
      clientId: id,
      chatId,
      text,
      replyTo,
      attachments,
      createdAt: this.#now(),
      state: files.length > 0 ? 'uploading' : 'pending',
    };
    this.#retries.set(id, { text, files, replyTo });
    this.#store.getState().updateData((data) => addOutgoing(data, outgoing));
    try {
      const fileIds: number[] = [];
      for (const file of files) fileIds.push((await this.#api.upload(file, file.name, 'attachment')).fileId);
      this.#store.getState().updateData((data) => setOutgoingState(data, chatId, id, 'pending'));
      const input = { chatId, clientId: id, text, attachmentFileIds: fileIds };
      const { message } = await this.#connection.request('message.send', replyTo ? { ...input, replyToId: replyTo.messageId } : input);
      this.#retries.delete(id);
      this.#store.getState().updateData((data) => upsertMessage(data, message));
      // The message cleared "is typing" on the other side, so the next keystroke may announce again,
      // but no sooner than the server accepts it: a refused notice would hide typing for a whole interval.
      const last = this.#lastTyping.get(chatId);
      if (last !== undefined) this.#lastTyping.set(chatId, last - (TYPING_INTERVAL_MS - SERVER_TYPING_INTERVAL_MS));
      this.#sound.outgoing();
    } catch (error) {
      this.#store.getState().updateData((data) => setOutgoingState(data, chatId, id, 'failed'));
      this.#store.getState().reportError(error);
    }
  }

  /** Sends a failed message again with the same client id. */
  async retry(chatId: number, clientId: string): Promise<void> {
    const retry = this.#retries.get(clientId);
    this.#store.getState().updateData((data) => dropOutgoing(data, chatId, clientId));
    if (retry) await this.send(chatId, retry.text, retry.files, retry.replyTo, { clientId });
  }

  async edit(messageId: number, text: string): Promise<boolean> {
    try {
      const { message } = await this.#connection.request('message.edit', { messageId, text });
      this.#store.getState().updateData((data) => upsertMessage(data, message));
      return true;
    } catch (error) {
      this.#store.getState().reportError(error);
      return false;
    }
  }

  async deleteMessages(chatId: number, messageIds: number[], forAll: boolean): Promise<void> {
    try {
      await this.#connection.request('message.delete', { chatId, messageIds, forAll });
      this.#store.getState().updateData((data) => {
        if (!forAll) return removeMessages(data, chatId, messageIds);
        const history = data.histories[chatId];
        const drop = new Set(messageIds);
        return (history?.messages ?? [])
          .filter((m) => drop.has(m.id))
          .reduce((next, m) => upsertMessage(next, { ...m, deleted: true, text: '', attachments: [], reactions: [] }), data);
      });
    } catch (error) {
      this.#store.getState().reportError(error);
    }
  }

  async react(messageId: number, reaction: Reaction | null): Promise<void> {
    try {
      const { message } = await this.#connection.request('message.react', { messageId, reaction });
      this.#store.getState().updateData((data) => upsertMessage(data, message));
    } catch (error) {
      this.#store.getState().reportError(new Error(reaction ? S.reactions.addError : S.reactions.removeError, { cause: error }));
    }
  }

  async forward(fromChatId: number, messageIds: number[], toChatId: number): Promise<boolean> {
    try {
      const { messages } = await this.#connection.request('message.forward', { fromChatId, messageIds, toChatId });
      const state = this.#store.getState();
      state.updateData((data) => messages.reduce(upsertMessage, data));
      state.toast(S.messageSent);
      return true;
    } catch (error) {
      this.#store.getState().reportError(error);
      return false;
    }
  }

  /** Marks the chat read up to the newest known message; skips when nothing changed. */
  async markRead(chatId: number): Promise<void> {
    const state = this.#store.getState();
    const chat = state.data.chats[chatId];
    if (!chat || !this.#connection.isOpen) return;
    const newest = newestMessageId(state.data, chat);
    if (newest === 0 || (newest <= chat.lastReadId && !chat.markedUnread && chat.unread === 0)) return;
    if ((this.#reading.get(chatId) ?? 0) >= newest) return;
    this.#reading.set(chatId, newest);
    state.updateData((data) => markChatRead(data, chatId, newest));
    try {
      await this.#connection.request('chat.read', { chatId, messageId: newest });
    } catch (error) {
      this.#store.getState().reportError(error);
    } finally {
      if (this.#reading.get(chatId) === newest) this.#reading.delete(chatId);
    }
  }

  async markUnread(chatId: number): Promise<void> {
    this.#store.getState().updateData((data) => patchChat(data, chatId, { markedUnread: true }));
    try {
      await this.#connection.request('chat.markUnread', { chatId });
    } catch (error) {
      this.#store.getState().updateData((data) => patchChat(data, chatId, { markedUnread: false }));
      this.#store.getState().reportError(error);
    }
  }

  /** "Read all" from the pencil menu. */
  async readAll(): Promise<void> {
    const chats = Object.values(this.#store.getState().data.chats).filter((c) => c.unread > 0 || c.markedUnread);
    await Promise.all(chats.map((chat) => this.markRead(chat.id)));
  }

  async update(chatId: number, change: { pinned?: boolean; muted?: boolean }): Promise<void> {
    try {
      const { chat } = await this.#connection.request('chat.update', { chatId, ...change });
      this.#store.getState().updateData((data) => upsertChat(data, chat));
    } catch (error) {
      this.#store.getState().reportError(error);
    }
  }

  async clear(chatId: number): Promise<void> {
    try {
      await this.#connection.request('chat.clear', { chatId });
      this.#store.getState().updateData((data) => clearChat(data, chatId));
    } catch (error) {
      this.#store.getState().reportError(error);
    }
  }

  /** "Hide" a direct chat, "Leave and delete" a group. */
  async remove(chatId: number): Promise<void> {
    try {
      await this.#connection.request('chat.remove', { chatId });
      const state = this.#store.getState();
      if (state.selectedChatId === chatId) state.openChat(null);
      state.updateData((data) => removeChat(data, chatId));
    } catch (error) {
      this.#store.getState().reportError(error);
    }
  }

  async block(uin: number, blocked: boolean): Promise<void> {
    try {
      const { user } = await this.#connection.request('user.block', { uin, blocked });
      this.#store.getState().updateData((data) => ({ ...data, users: mergeUsers(data.users, [user]) }));
    } catch (error) {
      this.#store.getState().reportError(error);
    }
  }

  /** Called on input; sends at most one typing notice per interval. Failures only cost the indicator. */
  typing(chatId: number): void {
    const now = this.#now();
    if (now - (this.#lastTyping.get(chatId) ?? Number.NEGATIVE_INFINITY) < TYPING_INTERVAL_MS) return;
    if (!this.#connection.isOpen) return;
    this.#lastTyping.set(chatId, now);
    this.#connection.request('typing', { chatId }).catch((error: unknown) => {
      // rate_limited is harmless here (two devices typing at once); anything else is shown.
      if (!(isIcqError(error) && error.code === 'rate_limited')) this.#store.getState().reportError(error);
    });
  }
}
