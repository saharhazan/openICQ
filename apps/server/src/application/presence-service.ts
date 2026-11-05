/**
 * Presence (plan rule 3): online while at least one connection is started,
 * `lastSeen` set when the last one closes. Changes go to everyone who shares a
 * direct chat or a group with the user and to everyone who saved them as a
 * contact, except the users they blocked (who always see them offline).
 */
import type { Presence } from '@openicq/protocol';
import type { Clock, Notifier } from '../domain/ports.ts';
import type { BlockRepository, ChatRepository, ContactRepository, UserRepository } from '../domain/repositories.ts';
import type { Uin } from '../domain/vocabulary.ts';
import { requireUser, unique } from './support.ts';

export interface PresenceServiceDeps {
  readonly users: UserRepository;
  readonly chats: ChatRepository;
  readonly contacts: ContactRepository;
  readonly blocks: BlockRepository;
  readonly notifier: Notifier;
  readonly clock: Clock;
}

export class PresenceService {
  private readonly users: UserRepository;
  private readonly chats: ChatRepository;
  private readonly contacts: ContactRepository;
  private readonly blocks: BlockRepository;
  private readonly notifier: Notifier;
  private readonly clock: Clock;

  constructor(deps: PresenceServiceDeps) {
    this.users = deps.users;
    this.chats = deps.chats;
    this.contacts = deps.contacts;
    this.blocks = deps.blocks;
    this.notifier = deps.notifier;
    this.clock = deps.clock;
  }

  /** The first connection of the user started. */
  cameOnline(uin: Uin): void {
    const user = requireUser(this.users, uin);
    this.publish(uin, { online: true, lastSeen: user.lastSeenAt });
  }

  /** The last connection of the user closed. */
  wentOffline(uin: Uin): void {
    const at = this.clock.now().toISOString();
    this.users.touchLastSeen(uin, at);
    this.publish(uin, { online: false, lastSeen: at });
  }

  /** Who is told about the user's presence and profile changes. */
  audience(uin: Uin): Uin[] {
    const blocked = new Set(this.blocks.list(uin));
    return unique([...this.chats.listCoMembers(uin), ...this.contacts.ownersOf(uin)]).filter(
      (viewer) => viewer !== uin && !blocked.has(viewer),
    );
  }

  private publish(uin: Uin, presence: Presence): void {
    for (const viewer of this.audience(uin)) this.notifier.notify(viewer, { type: 'presence', uin, presence });
  }
}
