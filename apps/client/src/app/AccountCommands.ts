/**
 * Contacts, search, my profile, nickname check, password, privacy setting
 * and the session list. Each call reports its failure and returns null/false.
 */
import type { Attachment, ProfileUpdate, SessionEntry, User } from '@openicq/protocol';
import { isIcqError } from '../net/errors';
import { mergeUsers } from '../state/data';
import type { AppStore } from '../state/store';
import type { Api, Connection } from './ports';

export type NicknameCheck = 'available' | 'taken' | 'invalid' | 'error';

export interface AccountCommandDeps {
  api: Api;
  connection: Connection;
  store: AppStore;
}

export class AccountCommands {
  readonly #api: Api;
  readonly #connection: Connection;
  readonly #store: AppStore;

  constructor(deps: AccountCommandDeps) {
    this.#api = deps.api;
    this.#connection = deps.connection;
    this.#store = deps.store;
  }

  #report(error: unknown): void {
    this.#store.getState().reportError(error);
  }

  #remember(users: readonly User[]): void {
    this.#store.getState().updateData((data) => ({ ...data, users: mergeUsers(data.users, users) }));
  }

  /** By nickname, ICQ#, email or name. Server results are remembered so rows can be drawn. */
  async search(query: string): Promise<User[] | null> {
    try {
      const { users } = await this.#connection.request('user.search', { query });
      this.#remember(users);
      return users;
    } catch (error) {
      this.#report(error);
      return null;
    }
  }

  async getUser(uin: number): Promise<User | null> {
    try {
      const { user } = await this.#connection.request('user.get', { uin });
      this.#remember([user]);
      return user;
    } catch (error) {
      this.#report(error);
      return null;
    }
  }

  async addContact(uin: number): Promise<User | null> {
    try {
      const { user } = await this.#connection.request('contact.add', { uin });
      this.#store.getState().updateData((data) => ({
        ...data,
        users: mergeUsers(data.users, [user]),
        contacts: data.contacts.includes(uin) ? data.contacts : [...data.contacts, uin],
      }));
      return user;
    } catch (error) {
      this.#report(error);
      return null;
    }
  }

  async removeContact(uin: number): Promise<boolean> {
    try {
      await this.#connection.request('contact.remove', { uin });
      this.#store.getState().updateData((data) => {
        const user = data.users[uin];
        return {
          ...data,
          contacts: data.contacts.filter((u) => u !== uin),
          users: user ? mergeUsers(data.users, [{ ...user, isContact: false }]) : data.users,
        };
      });
      return true;
    } catch (error) {
      this.#report(error);
      return false;
    }
  }

  async updateProfile(change: ProfileUpdate): Promise<boolean> {
    try {
      const { me } = await this.#connection.request('profile.update', change);
      this.#store.getState().updateData((data) => ({ ...data, me }));
      return true;
    } catch (error) {
      this.#report(error);
      return false;
    }
  }

  /** Uploads an avatar file and returns its attachment, or null after reporting. */
  async uploadAvatar(file: File): Promise<Attachment | null> {
    try {
      return await this.#api.upload(file, file.name, 'avatar');
    } catch (error) {
      this.#report(error);
      return null;
    }
  }

  /** The live nickname check; errors become 'error' for the field to show. */
  async checkNickname(nickname: string): Promise<NicknameCheck> {
    try {
      const result = await this.#connection.request('nickname.check', { nickname });
      if (result.available) return 'available';
      return result.reason === 'taken' ? 'taken' : 'invalid';
    } catch {
      return 'error';
    }
  }

  /** Returns 'wrong' when the old password does not match. */
  async changePassword(oldPassword: string, newPassword: string): Promise<'ok' | 'wrong' | 'error'> {
    try {
      await this.#connection.request('password.change', { oldPassword, newPassword });
      return 'ok';
    } catch (error) {
      if (isIcqError(error) && (error.code === 'forbidden' || error.code === 'unauthorized')) return 'wrong';
      this.#report(error);
      return 'error';
    }
  }

  async setGroupInvites(groupInvites: 'everybody' | 'contacts' | 'nobody'): Promise<boolean> {
    try {
      const { settings } = await this.#connection.request('settings.update', { groupInvites });
      this.#store.getState().updateData((data) => ({ ...data, settings }));
      return true;
    } catch (error) {
      this.#report(error);
      return false;
    }
  }

  async listSessions(): Promise<SessionEntry[] | null> {
    try {
      const { sessions } = await this.#connection.request('sessions.list', {});
      return sessions;
    } catch (error) {
      this.#report(error);
      return null;
    }
  }

  async closeSession(target: { sessionId: number } | { others: true }): Promise<boolean> {
    try {
      await this.#connection.request('sessions.close', target);
      return true;
    } catch (error) {
      this.#report(error);
      return false;
    }
  }
}
