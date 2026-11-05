/**
 * Everything the ICQ windows ask the server for. Each command sends one typed
 * request, applies the result to the store, and reports a failure in an ICQ
 * error dialog. A failed command resolves to null (or false) after reporting.
 */
import type {
  ProfileUpdate,
  RequestInput,
  RequestResult,
  RequestType,
  SearchQuery,
  SettingsUpdate,
  Uin,
} from '@openicq/protocol';
import type { IcqConnection } from '../net/IcqConnection';
import {
  addAutoResponse,
  addMessages,
  applyHistoryPage,
  conversationOf,
  removeContact,
  removeNotice,
  setIgnored,
  upsertContact,
} from '../state/chat';
import type { AppStore } from '../state/store';

export class IcqCommands {
  readonly #connection: IcqConnection;
  readonly #store: AppStore;

  constructor(connection: IcqConnection, store: AppStore) {
    this.#connection = connection;
    this.#store = store;
  }

  /** `urgent` is "Send Urgent" to an Occupied user; otherwise Occupied/DND users get it silently. */
  async sendMessage(to: Uin, text: string, urgent = false): Promise<RequestResult<'message.send'> | null> {
    const result = await this.#call('Send Message', 'message.send', { to, text, urgent });
    if (!result) return null;
    this.#chat((chat) => {
      const withMessage = addMessages(chat, to, [result.message]);
      return result.autoResponse ? addAutoResponse(withMessage, to, result.message.id, result.autoResponse) : withMessage;
    });
    return result;
  }

  /** Loads the newest page, or the page before the oldest loaded message when `older`. */
  async loadHistory(uin: Uin, older: boolean): Promise<boolean> {
    const oldest = conversationOf(this.#store.getState().chat, uin).messages[0];
    const input: RequestInput<'history.get'> = older && oldest ? { uin, beforeId: oldest.id } : { uin };
    const result = await this.#call('Message History', 'history.get', input);
    if (!result) return false;
    this.#chat((chat) => applyHistoryPage(chat, uin, result.messages, result.hasMore));
    return true;
  }

  getAwayMessage(uin: Uin): Promise<RequestResult<'away.get'> | null> {
    return this.#call('Away Message', 'away.get', { uin });
  }

  async addContact(uin: Uin, nickname: string | undefined, reason: string): Promise<boolean> {
    const input: RequestInput<'contact.add'> = nickname ? { uin, nickname, reason } : { uin, reason };
    const result = await this.#call('Add User', 'contact.add', input);
    if (!result) return false;
    this.#chat((chat) => upsertContact(chat, result.contact));
    return true;
  }

  async removeContact(uin: Uin): Promise<boolean> {
    const result = await this.#call('Delete User', 'contact.remove', { uin });
    if (!result) return false;
    this.#chat((chat) => removeContact(chat, uin));
    return true;
  }

  async renameContact(uin: Uin, nickname: string): Promise<boolean> {
    const result = await this.#call('Rename', 'contact.rename', { uin, nickname });
    if (!result) return false;
    this.#chat((chat) => upsertContact(chat, result.contact));
    return true;
  }

  async requestAuth(uin: Uin, reason: string): Promise<boolean> {
    return (await this.#call('Authorization Request', 'auth.request', { uin, reason })) !== null;
  }

  async respondAuth(noticeId: number, grant: boolean, reason: string): Promise<boolean> {
    const result = await this.#call('Authorization', 'auth.respond', { noticeId, grant, reason });
    if (!result) return false;
    this.#chat((chat) => removeNotice(chat, noticeId));
    return true;
  }

  async dismissNotice(noticeId: number): Promise<boolean> {
    const result = await this.#call('System Notice', 'notice.dismiss', { noticeId });
    if (!result) return false;
    this.#chat((chat) => removeNotice(chat, noticeId));
    return true;
  }

  async search(query: SearchQuery): Promise<RequestResult<'search.users'>['results'] | null> {
    const result = await this.#call('Find User', 'search.users', query);
    return result ? result.results : null;
  }

  async getProfile(uin: Uin): Promise<RequestResult<'profile.get'>['profile'] | null> {
    const result = await this.#call('User Details', 'profile.get', { uin });
    return result ? result.profile : null;
  }

  async updateProfile(update: ProfileUpdate): Promise<boolean> {
    const result = await this.#call('My Details', 'profile.update', update);
    if (!result) return false;
    this.#store.getState().setSelf(result.profile);
    return true;
  }

  async updateSettings(update: SettingsUpdate): Promise<boolean> {
    const result = await this.#call('Preferences', 'settings.update', update);
    if (!result) return false;
    this.#store.getState().setSettings(result.settings);
    return true;
  }

  async setIgnored(uin: Uin, ignored: boolean): Promise<boolean> {
    const result = ignored
      ? await this.#call('Ignore List', 'ignore.add', { uin })
      : await this.#call('Ignore List', 'ignore.remove', { uin });
    if (!result) return false;
    this.#chat((chat) => setIgnored(chat, uin, ignored));
    return true;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<boolean> {
    return (await this.#call('Change Password', 'password.change', { currentPassword, newPassword })) !== null;
  }

  #chat(change: Parameters<ReturnType<AppStore['getState']>['updateChat']>[0]): void {
    this.#store.getState().updateChat(change);
  }

  async #call<T extends RequestType>(title: string, type: T, input: RequestInput<T>): Promise<RequestResult<T> | null> {
    try {
      return await this.#connection.request(type, input);
    } catch (error) {
      this.#store.getState().reportError(error, title);
      return null;
    }
  }
}
