/** Starts a live session: announces presence and assembles the snapshot. */
import type { SessionSnapshot, SettableStatus, Uin } from '@openicq/protocol';
import type { Clock } from '../domain/ports.ts';
import type { UserRepository } from '../domain/repositories.ts';
import type { ContactService } from './contact-service.ts';
import { toProfile, toSettings } from './mappers.ts';
import type { MessagingService } from './messaging-service.ts';
import type { PresenceService } from './presence-service.ts';
import type { SettingsService } from './settings-service.ts';
import { requireUser } from './support.ts';

export interface SessionServiceDeps {
  readonly users: UserRepository;
  readonly presence: PresenceService;
  readonly contacts: ContactService;
  readonly messaging: MessagingService;
  readonly settings: SettingsService;
  readonly clock: Clock;
}

export class SessionService {
  private readonly users: UserRepository;
  private readonly presence: PresenceService;
  private readonly contacts: ContactService;
  private readonly messaging: MessagingService;
  private readonly settings: SettingsService;
  private readonly clock: Clock;

  constructor(deps: SessionServiceDeps) {
    this.users = deps.users;
    this.presence = deps.presence;
    this.contacts = deps.contacts;
    this.messaging = deps.messaging;
    this.settings = deps.settings;
    this.clock = deps.clock;
  }

  start(uin: Uin, status: SettableStatus): SessionSnapshot {
    const user = requireUser(this.users, uin);
    this.presence.connect(uin, status);
    const unread = this.messaging.unread(uin);
    return {
      self: toProfile(user, uin),
      settings: toSettings(user),
      status,
      contacts: this.contacts.list(uin),
      notices: this.contacts.listNotices(uin),
      unread,
      notInList: this.messaging.notInList(uin, unread),
      ignored: this.settings.listIgnored(uin),
      serverTime: this.clock.now().toISOString(),
    };
  }
}
