/** Private settings (security, preferences, away messages) and the ignore list. */
import type { Settings, SettingsUpdate, Uin } from '@openicq/protocol';
import { DomainError } from '../domain/errors.ts';
import type { Clock } from '../domain/ports.ts';
import type { IgnoreRepository, UserRepository } from '../domain/repositories.ts';
import { toSettings } from './mappers.ts';
import type { PresenceService } from './presence-service.ts';
import { mergeDefined, requireUser } from './support.ts';

export interface SettingsServiceDeps {
  readonly users: UserRepository;
  readonly ignores: IgnoreRepository;
  readonly presence: PresenceService;
  readonly clock: Clock;
}

export class SettingsService {
  private readonly users: UserRepository;
  private readonly ignores: IgnoreRepository;
  private readonly presence: PresenceService;
  private readonly clock: Clock;

  constructor(deps: SettingsServiceDeps) {
    this.users = deps.users;
    this.ignores = deps.ignores;
    this.presence = deps.presence;
    this.clock = deps.clock;
  }

  get(uin: Uin): Settings {
    return toSettings(requireUser(this.users, uin));
  }

  /** Top-level flags are replaced; preferences and away messages are merged key by key. */
  update(uin: Uin, update: SettingsUpdate): Settings {
    const current = requireUser(this.users, uin);
    const updated = this.users.updateSettings(uin, {
      authRequired: update.authRequired ?? current.authRequired,
      webAware: update.webAware ?? current.webAware,
      hideEmail: update.hideEmail ?? current.hideEmail,
      preferences: mergeDefined(current.preferences, update.preferences ?? {}),
      awayMessages: mergeDefined(current.awayMessages, update.awayMessages ?? {}),
    });
    return toSettings(updated);
  }

  listIgnored(owner: Uin): Uin[] {
    return this.ignores.list(owner);
  }

  /** The ignored user sees the owner go offline at once, if the owner is in their list. */
  ignore(owner: Uin, uin: Uin): void {
    if (uin === owner) throw new DomainError('bad_request', 'You cannot ignore yourself.');
    requireUser(this.users, uin);
    const at = this.clock.now().toISOString();
    this.presence.refreshView(uin, owner, () => this.ignores.add(owner, uin, at));
  }

  unignore(owner: Uin, uin: Uin): void {
    this.presence.refreshView(uin, owner, () => {
      this.ignores.remove(owner, uin);
    });
  }
}
