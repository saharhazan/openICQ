/**
 * Live presence. Every change is published to the connected watchers of the
 * user, each with the status as visible to that watcher, and only when it
 * actually changed for them.
 */
import { hasStatusMessage, type SettableStatus, type Status, type Uin } from '@openicq/protocol';
import type { ContactRecord } from '../domain/entities.ts';
import type { Clock, Notifier, PresenceRegistry } from '../domain/ports.ts';
import type { ContactRepository, UserRepository } from '../domain/repositories.ts';
import { requireUser } from './support.ts';
import type { VisibilityResolver } from './visibility-resolver.ts';

export interface PresenceServiceDeps {
  readonly presence: PresenceRegistry;
  readonly contacts: ContactRepository;
  readonly users: UserRepository;
  readonly notifier: Notifier;
  readonly clock: Clock;
  readonly visibility: VisibilityResolver;
}

export class PresenceService {
  private readonly presence: PresenceRegistry;
  private readonly contacts: ContactRepository;
  private readonly users: UserRepository;
  private readonly notifier: Notifier;
  private readonly clock: Clock;
  private readonly visibility: VisibilityResolver;

  constructor(deps: PresenceServiceDeps) {
    this.presence = deps.presence;
    this.contacts = deps.contacts;
    this.users = deps.users;
    this.notifier = deps.notifier;
    this.clock = deps.clock;
    this.visibility = deps.visibility;
  }

  isConnected(uin: Uin): boolean {
    return this.presence.statusOf(uin) !== null;
  }

  connect(uin: Uin, status: SettableStatus): void {
    this.publish(uin, () => this.presence.set(uin, status));
  }

  /** Sets the status; a message given with a status that carries one (away-like or FFC) is stored for it. */
  setStatus(uin: Uin, status: SettableStatus, awayMessage?: string): Status {
    if (awayMessage !== undefined && hasStatusMessage(status)) {
      const user = requireUser(this.users, uin);
      this.users.updateSettings(uin, { ...user, awayMessages: { ...user.awayMessages, [status]: awayMessage } });
    }
    this.publish(uin, () => this.presence.set(uin, status));
    return status;
  }

  disconnect(uin: Uin): void {
    this.publish(uin, () => this.presence.remove(uin));
    this.users.touchLastSeen(uin, this.clock.now().toISOString());
  }

  /**
   * Runs `change` (for example an ignore list edit) and tells `viewer` about
   * the new status of `target` if the change altered what the viewer sees.
   */
  refreshView(viewer: Uin, target: Uin, change: () => void): void {
    const entry = this.contacts.findActive(viewer, target);
    if (entry === null || !this.isConnected(viewer)) {
      change();
      return;
    }
    const before = this.visibility.statusOfEntry(entry);
    change();
    this.notifyIfChanged(entry, before);
  }

  private publish(target: Uin, change: () => void): void {
    const watchers = this.contacts.listWatchers(target).filter((entry) => this.isConnected(entry.ownerUin));
    const before = watchers.map((entry) => this.visibility.statusOfEntry(entry));
    change();
    watchers.forEach((entry, index) => this.notifyIfChanged(entry, before[index]));
  }

  private notifyIfChanged(entry: ContactRecord, before: Status | undefined): void {
    const after = this.visibility.statusOfEntry(entry);
    if (after === before) return;
    this.notifier.notify(entry.ownerUin, { type: 'presence', uin: entry.contactUin, status: after });
  }
}
