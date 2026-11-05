/**
 * Contact list and authorization: adding and removing contacts, the
 * authorization request and response flow, and system notices.
 */
import type { Contact, NoticeKind, SystemNotice, Uin } from '@openicq/protocol';
import type { ContactRecord, NoticeRecord } from '../domain/entities.ts';
import { DomainError } from '../domain/errors.ts';
import type { Clock, Notifier, TransactionRunner } from '../domain/ports.ts';
import type { ContactRepository, IgnoreRepository, NoticeRepository, UserRepository } from '../domain/repositories.ts';
import { toContact, toNotice } from './mappers.ts';
import { requireUser } from './support.ts';
import type { VisibilityResolver } from './visibility-resolver.ts';

export interface ContactServiceDeps {
  readonly users: UserRepository;
  readonly contacts: ContactRepository;
  readonly notices: NoticeRepository;
  readonly ignores: IgnoreRepository;
  readonly notifier: Notifier;
  readonly clock: Clock;
  readonly transactions: TransactionRunner;
  readonly visibility: VisibilityResolver;
}

export interface AddContactInput {
  readonly uin: Uin;
  readonly nickname?: string | undefined;
  readonly reason: string;
}

const NOT_IN_LIST = 'This user is not in your contact list.';

export class ContactService {
  private readonly users: UserRepository;
  private readonly contacts: ContactRepository;
  private readonly notices: NoticeRepository;
  private readonly ignores: IgnoreRepository;
  private readonly notifier: Notifier;
  private readonly clock: Clock;
  private readonly transactions: TransactionRunner;
  private readonly visibility: VisibilityResolver;

  constructor(deps: ContactServiceDeps) {
    this.users = deps.users;
    this.contacts = deps.contacts;
    this.notices = deps.notices;
    this.ignores = deps.ignores;
    this.notifier = deps.notifier;
    this.clock = deps.clock;
    this.transactions = deps.transactions;
    this.visibility = deps.visibility;
  }

  list(owner: Uin): Contact[] {
    return this.contacts.listActive(owner).map((entry) => this.present(entry));
  }

  listNotices(owner: Uin): SystemNotice[] {
    return this.notices.listUnresolved(owner).map(toNotice);
  }

  add(owner: Uin, input: AddContactInput): Contact {
    if (input.uin === owner) throw new DomainError('bad_request', 'You cannot add yourself to your contact list.');
    const target = requireUser(this.users, input.uin);
    if (this.contacts.findActive(owner, target.uin) !== null) {
      throw new DomainError('conflict', 'This user is already in your contact list.');
    }
    const alias = input.nickname !== undefined && input.nickname !== '' ? input.nickname : target.nickname;
    const createdAt = this.now();
    const { entry, notice } = this.transactions.run(() => ({
      entry: this.contacts.upsertActive({
        ownerUin: owner,
        contactUin: target.uin,
        nickname: alias,
        authorized: !target.authRequired,
        createdAt,
      }),
      notice: target.authRequired
        ? this.createNotice(target.uin, owner, 'auth_request', input.reason, createdAt)
        : this.createNotice(target.uin, owner, 'added_you', '', createdAt),
    }));
    this.deliver(notice);
    return this.present(entry);
  }

  /** Soft delete; an authorization request still waiting at the contact is withdrawn. */
  remove(owner: Uin, uin: Uin): void {
    const at = this.now();
    const removed = this.transactions.run(() => {
      if (!this.contacts.remove(owner, uin, at)) return false;
      this.notices.resolvePending(uin, owner, 'auth_request', at);
      return true;
    });
    if (!removed) throw new DomainError('not_found', NOT_IN_LIST);
  }

  rename(owner: Uin, uin: Uin, nickname: string): Contact {
    const entry = this.contacts.rename(owner, uin, nickname);
    if (entry === null) throw new DomainError('not_found', NOT_IN_LIST);
    return this.present(entry);
  }

  /** Sends the authorization request again for a contact that still awaits it. */
  requestAuth(owner: Uin, uin: Uin, reason: string): void {
    const entry = this.contacts.findActive(owner, uin);
    if (entry === null || entry.authorized) {
      throw new DomainError('bad_request', 'This contact is not waiting for authorization.');
    }
    const createdAt = this.now();
    const notice = this.transactions.run(() => this.createNotice(uin, owner, 'auth_request', reason, createdAt));
    this.deliver(notice);
  }

  respondAuth(owner: Uin, noticeId: number, grant: boolean, reason: string): void {
    const request = this.notices.findUnresolved(noticeId, owner);
    if (request === null || request.kind !== 'auth_request') {
      throw new DomainError('not_found', 'This authorization request no longer exists.');
    }
    const at = this.now();
    const { updated, reply } = this.transactions.run(() => {
      this.notices.resolve(request.id, at);
      if (!grant) {
        return { updated: null, reply: this.createNotice(request.fromUin, owner, 'auth_denied', reason, at) };
      }
      // A requester who removed the contact meanwhile has nothing to be authorized for.
      const authorized = this.contacts.authorize(request.fromUin, owner);
      return {
        updated: authorized,
        reply: authorized === null ? null : this.createNotice(request.fromUin, owner, 'auth_granted', reason, at),
      };
    });
    if (updated !== null) {
      this.notifier.notify(updated.ownerUin, { type: 'contact.updated', contact: this.present(updated) });
    }
    this.deliver(reply);
  }

  dismissNotice(owner: Uin, noticeId: number): void {
    const notice = this.notices.findUnresolved(noticeId, owner);
    if (notice === null) throw new DomainError('not_found', 'This notice no longer exists.');
    this.notices.resolve(notice.id, this.now());
  }

  private present(entry: ContactRecord): Contact {
    return toContact(entry, this.visibility.statusOfEntry(entry));
  }

  /**
   * Stores a notice for `to`, superseding an unresolved one of the same kind
   * from the same sender, so repeated adds never pile up. Returns null when
   * `to` ignores the sender: the ignore list drops everything from that user, like messages.
   */
  private createNotice(to: Uin, from: Uin, kind: NoticeKind, reason: string, at: string): NoticeRecord | null {
    if (this.ignores.isIgnoring(to, from)) return null;
    this.notices.resolvePending(to, from, kind, at);
    return this.notices.create({ toUin: to, fromUin: from, kind, reason, createdAt: at });
  }

  private deliver(notice: NoticeRecord | null): void {
    if (notice === null) return;
    this.notifier.notify(notice.toUin, { type: 'notice', notice: toNotice(notice) });
  }

  private now(): string {
    return this.clock.now().toISOString();
  }
}
