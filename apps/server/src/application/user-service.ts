/**
 * People: search (plan rule 13), profiles, nicknames, contacts, blocks and
 * the server-side account settings.
 */
import {
  LIMITS,
  nicknameSchema,
  type AccountSettings,
  type GroupInvitePolicy,
  type Me,
  type ProfileUpdate,
  type RequestResult,
  type User,
} from '@openicq/protocol';
import type { UserRecord } from '../domain/entities.ts';
import { DomainError } from '../domain/errors.ts';
import type { Clock } from '../domain/ports.ts';
import type { BlockRepository, ContactRepository, FileRepository, UserRepository } from '../domain/repositories.ts';
import type { Uin } from '../domain/vocabulary.ts';
import type { ChatEvents } from './chat-events.ts';
import type { PresenceService } from './presence-service.ts';
import { MESSAGES, requireAvatarFile, requireUser, type Actor } from './support.ts';
import type { ViewBuilder } from './views.ts';

const DIGITS = /^\d+$/;

export interface UserServiceDeps {
  readonly users: UserRepository;
  readonly files: FileRepository;
  readonly contacts: ContactRepository;
  readonly blocks: BlockRepository;
  readonly views: ViewBuilder;
  readonly events: ChatEvents;
  readonly presence: PresenceService;
  readonly clock: Clock;
}

export class UserService {
  private readonly deps: UserServiceDeps;

  constructor(deps: UserServiceDeps) {
    this.deps = deps;
  }

  /**
   * Exact ICQ number, nickname prefix or part of the name; at most 50, the viewer excluded.
   * Never by email, so search cannot tell whether an address has an account.
   */
  search(viewer: Uin, query: string): User[] {
    const trimmed = query.trim();
    const uin = DIGITS.test(trimmed) ? Number(trimmed) : null;
    const records = this.deps.users.search(
      {
        uin: uin !== null && Number.isSafeInteger(uin) ? uin : null,
        nicknamePrefix: trimmed.toLowerCase(),
        nameFragment: trimmed,
        excludeUin: viewer,
      },
      LIMITS.searchResults,
    );
    return records.map((record) => this.deps.views.user(viewer, record));
  }

  get(viewer: Uin, uin: Uin): User {
    return this.deps.views.user(viewer, requireUser(this.deps.users, uin));
  }

  /** Blocking stops direct messages both ways and hides the blocker's presence from the blocked user. */
  block(actor: Actor, uin: Uin, blocked: boolean): User {
    const { users, blocks, views, events, clock } = this.deps;
    if (uin === actor.uin) throw new DomainError('bad_request', 'You cannot block yourself.');
    const target = requireUser(users, uin);
    const changed = blocked ? !blocks.isBlocking(actor.uin, uin) : blocks.remove(actor.uin, uin);
    if (blocked && changed) blocks.add(actor.uin, uin, clock.now().toISOString());
    const user = views.user(actor.uin, target);
    if (!changed) return user;
    events.toUser(actor.uin, { type: 'user.updated', user }, actor.connectionId);
    const me = requireUser(users, actor.uin);
    events.toUser(uin, { type: 'presence', uin: actor.uin, presence: views.presence(uin, me) });
    return user;
  }

  addContact(actor: Actor, uin: Uin): User {
    const { users, contacts, views, clock } = this.deps;
    if (uin === actor.uin) throw new DomainError('bad_request', 'You cannot add yourself to your contacts.');
    const target = requireUser(users, uin);
    if (!contacts.has(actor.uin, uin)) {
      contacts.add(actor.uin, uin, clock.now().toISOString());
      this.contactsChanged(actor);
    }
    return views.user(actor.uin, target);
  }

  removeContact(actor: Actor, uin: Uin): void {
    if (!this.deps.contacts.remove(actor.uin, uin)) throw new DomainError('not_found', 'This user is not in your contacts.');
    this.contactsChanged(actor);
  }

  /** Changes reach everyone who sees the user, and the user's other devices (as `user.updated` with their own UIN). */
  updateProfile(actor: Actor, update: ProfileUpdate): Me {
    const { users, files, views, events, presence } = this.deps;
    const current = requireUser(users, actor.uin);
    if (update.nickname !== undefined && update.nickname !== null && update.nickname !== current.nickname) {
      const owner = users.findByNickname(update.nickname);
      if (owner !== null && owner.uin !== actor.uin) throw new DomainError('conflict', MESSAGES.nicknameTaken);
    }
    if (update.avatarFileId !== undefined && update.avatarFileId !== null && update.avatarFileId !== current.avatarFileId) {
      requireAvatarFile(files, actor.uin, update.avatarFileId);
    }
    const updated = users.updateProfile(actor.uin, {
      nickname: update.nickname === undefined ? current.nickname : update.nickname,
      firstName: update.firstName ?? current.firstName,
      lastName: update.lastName ?? current.lastName,
      about: update.about ?? current.about,
      avatarFileId: update.avatarFileId === undefined ? current.avatarFileId : update.avatarFileId,
    });
    if (this.profileChanged(current, updated)) {
      events.toUser(actor.uin, { type: 'user.updated', user: views.user(actor.uin, updated) }, actor.connectionId);
      for (const viewer of presence.audience(actor.uin)) {
        events.toUser(viewer, { type: 'user.updated', user: views.user(viewer, updated) });
      }
    }
    return views.me(updated);
  }

  checkNickname(uin: Uin, nickname: string): RequestResult<'nickname.check'> {
    const parsed = nicknameSchema.safeParse(nickname);
    if (!parsed.success) return { available: false, reason: 'invalid' };
    const owner = this.deps.users.findByNickname(parsed.data);
    if (owner !== null && owner.uin !== uin) return { available: false, reason: 'taken' };
    return { available: true, reason: null };
  }

  updateSettings(uin: Uin, groupInvites: GroupInvitePolicy | undefined): AccountSettings {
    const current = requireUser(this.deps.users, uin);
    if (groupInvites === undefined || groupInvites === current.groupInvites) return { groupInvites: current.groupInvites };
    return { groupInvites: this.deps.users.updateGroupInvites(uin, groupInvites).groupInvites };
  }

  private contactsChanged(actor: Actor): void {
    this.deps.events.toUser(actor.uin, { type: 'contacts.changed', contacts: this.deps.contacts.list(actor.uin) }, actor.connectionId);
  }

  private profileChanged(before: UserRecord, after: UserRecord): boolean {
    return (
      before.nickname !== after.nickname ||
      before.firstName !== after.firstName ||
      before.lastName !== after.lastName ||
      before.about !== after.about ||
      before.avatarFileId !== after.avatarFileId
    );
  }
}
