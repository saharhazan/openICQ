/** Gathers the facts for the pure visibility rule from the live registry and the repositories. */
import type { Status, Uin } from '@openicq/protocol';
import type { ContactRecord } from '../domain/entities.ts';
import type { PresenceRegistry } from '../domain/ports.ts';
import type { ContactRepository, IgnoreRepository } from '../domain/repositories.ts';
import { visibleStatus } from '../domain/visibility.ts';

export interface VisibilityResolverDeps {
  readonly presence: PresenceRegistry;
  readonly contacts: ContactRepository;
  readonly ignores: IgnoreRepository;
}

export class VisibilityResolver {
  private readonly presence: PresenceRegistry;
  private readonly contacts: ContactRepository;
  private readonly ignores: IgnoreRepository;

  constructor(deps: VisibilityResolverDeps) {
    this.presence = deps.presence;
    this.contacts = deps.contacts;
    this.ignores = deps.ignores;
  }

  /** The status `viewer` sees for `target`, whether or not the target is in the viewer's list. */
  statusFor(viewer: Uin, target: Uin): Status {
    const entry = this.contacts.findActive(viewer, target);
    return this.resolve(viewer, target, entry !== null && !entry.authorized);
  }

  /**
   * The public "Web Aware" status: independent of authorization (it is public by
   * the owner's choice), but still hidden from users the target ignores.
   */
  publicStatusFor(viewer: Uin, target: Uin): Status {
    return this.resolve(viewer, target, false);
  }

  /** The status the owner of `entry` sees for its contact. */
  statusOfEntry(entry: ContactRecord): Status {
    return this.resolve(entry.ownerUin, entry.contactUin, !entry.authorized);
  }

  private resolve(viewer: Uin, target: Uin, awaitingAuth: boolean): Status {
    return visibleStatus(
      { awaitingAuth },
      { status: this.presence.statusOf(target), ignoresViewer: this.ignores.isIgnoring(target, viewer) },
    );
  }
}
