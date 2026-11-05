/** Group requests: create, settings, members and roles, invite link, join requests, joining by link. */
import type { GroupPreview, Member, RequestInput, User } from '@openicq/protocol';
import { mergeUsers, patchChat, upsertChat } from '../state/data';
import type { AppStore } from '../state/store';
import type { Connection } from './ports';

export type CreateGroupInput = RequestInput<'group.create'>;
export type GroupUpdate = Omit<RequestInput<'group.update'>, 'chatId'>;

export interface CreatedGroup {
  chatId: number;
  /** Members whose "Who can add me to groups" refused; they need the invite link. */
  refused: number[];
}

export interface JoinRequest {
  uin: number;
  requestedAt: string;
}

export class GroupCommands {
  readonly #connection: Connection;
  readonly #store: AppStore;

  constructor(deps: { connection: Connection; store: AppStore }) {
    this.#connection = deps.connection;
    this.#store = deps.store;
  }

  #report(error: unknown): void {
    this.#store.getState().reportError(error);
  }

  #remember(users: readonly User[]): void {
    this.#store.getState().updateData((data) => ({ ...data, users: mergeUsers(data.users, users) }));
  }

  /** Creates the group without members, then adds them, so the refused ones are known. */
  async create(input: CreateGroupInput): Promise<CreatedGroup | null> {
    try {
      const { memberUins = [], ...rest } = input;
      const { chat, users } = await this.#connection.request('group.create', { ...rest, memberUins: [] });
      this.#store.getState().updateData((data) => upsertChat(data, chat, users));
      let refused: number[] = [];
      if (memberUins.length > 0) {
        const result = await this.#connection.request('group.addMembers', { chatId: chat.id, uins: memberUins });
        refused = result.refused;
      }
      return { chatId: chat.id, refused };
    } catch (error) {
      this.#report(error);
      return null;
    }
  }

  async update(chatId: number, change: GroupUpdate): Promise<boolean> {
    try {
      const { chat } = await this.#connection.request('group.update', { chatId, ...change });
      this.#store.getState().updateData((data) => upsertChat(data, chat));
      return true;
    } catch (error) {
      this.#report(error);
      return false;
    }
  }

  async members(chatId: number): Promise<Member[] | null> {
    try {
      const { members, users } = await this.#connection.request('group.members', { chatId });
      this.#remember(users);
      return members;
    } catch (error) {
      this.#report(error);
      return null;
    }
  }

  async addMembers(chatId: number, uins: number[]): Promise<{ added: number[]; refused: number[] } | null> {
    try {
      return await this.#connection.request('group.addMembers', { chatId, uins });
    } catch (error) {
      this.#report(error);
      return null;
    }
  }

  async removeMember(chatId: number, uin: number): Promise<boolean> {
    try {
      await this.#connection.request('group.removeMember', { chatId, uin });
      return true;
    } catch (error) {
      this.#report(error);
      return false;
    }
  }

  async setRole(chatId: number, uin: number, role: 'admin' | 'member' | 'readonly'): Promise<boolean> {
    try {
      await this.#connection.request('group.setRole', { chatId, uin, role });
      return true;
    } catch (error) {
      this.#report(error);
      return false;
    }
  }

  async regenerateLink(chatId: number): Promise<string | null> {
    try {
      const { inviteToken } = await this.#connection.request('group.regenerateLink', { chatId });
      this.#store.getState().updateData((data) => {
        const group = data.chats[chatId]?.group;
        return group ? patchChat(data, chatId, { group: { ...group, inviteToken } }) : data;
      });
      return inviteToken;
    } catch (error) {
      this.#report(error);
      return null;
    }
  }

  /** What an invite link opens. Null with the failure reported (a bad or old link). */
  async preview(inviteToken: string): Promise<GroupPreview | null> {
    try {
      const { group } = await this.#connection.request('group.preview', { inviteToken });
      return group;
    } catch (error) {
      this.#report(error);
      return null;
    }
  }

  async join(inviteToken: string): Promise<'member' | 'pending' | null> {
    try {
      const { state, chat } = await this.#connection.request('group.join', { inviteToken });
      if (chat) {
        const store = this.#store.getState();
        store.updateData((data) => upsertChat(data, chat));
        store.openChat(chat.id);
      }
      return state;
    } catch (error) {
      this.#report(error);
      return null;
    }
  }

  async requests(chatId: number): Promise<JoinRequest[] | null> {
    try {
      const { requests, users } = await this.#connection.request('group.requests', { chatId });
      this.#remember(users);
      return requests;
    } catch (error) {
      this.#report(error);
      return null;
    }
  }

  async resolveRequest(chatId: number, uin: number, approve: boolean): Promise<boolean> {
    try {
      await this.#connection.request('group.resolveRequest', { chatId, uin, approve });
      return true;
    } catch (error) {
      this.#report(error);
      return false;
    }
  }
}

/** The shareable invite link, opened by the client at #/join/<token>. */
export function inviteLink(origin: string, token: string): string {
  return `${origin}/#/join/${token}`;
}

/** Reads a join token from a location hash such as "#/join/AbC_12-x". */
export function joinTokenFromHash(hash: string): string | null {
  const match = /^#\/join\/([A-Za-z0-9_-]{8,64})$/.exec(hash);
  return match?.[1] ?? null;
}
