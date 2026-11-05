import { beforeEach, describe, expect, it } from 'vitest';
import type { NewNotice, NoticeRecord } from '../../src/domain/entities.ts';
import { DomainError } from '../../src/domain/errors.ts';
import { ContactService } from '../../src/application/contact-service.ts';
import { VisibilityResolver } from '../../src/application/visibility-resolver.ts';
import {
  contactEntry,
  fixedClock,
  immediateTransactions,
  mockContacts,
  mockIgnores,
  mockNotices,
  mockNotifier,
  mockUsers,
  presenceOf,
  user,
  usersById,
} from './mocks.ts';

const OWNER = 100001;
const TARGET = 100002;

function storedNotice(notice: NewNotice, id = 7): NoticeRecord {
  return { ...notice, id, fromNickname: `User${notice.fromUin}`, resolvedAt: null };
}

describe('ContactService', () => {
  let users: ReturnType<typeof mockUsers>;
  let contacts: ReturnType<typeof mockContacts>;
  let notices: ReturnType<typeof mockNotices>;
  let ignores: ReturnType<typeof mockIgnores>;
  let notifier: ReturnType<typeof mockNotifier>;
  let service: ContactService;

  beforeEach(() => {
    users = mockUsers();
    contacts = mockContacts();
    notices = mockNotices();
    ignores = mockIgnores();
    notifier = mockNotifier();
    ignores.isIgnoring.mockReturnValue(false);
    notices.create.mockImplementation((notice) => storedNotice(notice));
    notices.resolvePending.mockReturnValue(0);
    contacts.upsertActive.mockImplementation((entry) => ({ ...entry }));
    const presence = presenceOf({ [TARGET]: 'online' });
    service = new ContactService({
      users,
      contacts,
      notices,
      ignores,
      notifier,
      clock: fixedClock(),
      transactions: immediateTransactions,
      visibility: new VisibilityResolver({ presence, contacts, ignores }),
    });
  });

  describe('add', () => {
    it('adds an authorized contact and sends "added_you" when no authorization is required', () => {
      users.findByUin.mockImplementation(usersById(user(TARGET, { nickname: 'Bob', authRequired: false })));
      contacts.findActive.mockReturnValue(null);

      const contact = service.add(OWNER, { uin: TARGET, reason: '' });

      expect(contact).toEqual({ uin: TARGET, nickname: 'Bob', status: 'online', awaitingAuth: false });
      expect(contacts.upsertActive).toHaveBeenCalledWith(expect.objectContaining({ authorized: true }));
      expect(notices.create).toHaveBeenCalledWith(expect.objectContaining({ toUin: TARGET, fromUin: OWNER, kind: 'added_you' }));
      expect(notifier.notify).toHaveBeenCalledWith(TARGET, {
        type: 'notice',
        notice: expect.objectContaining({ kind: 'added_you', from: OWNER }),
      });
    });

    it('awaits authorization, hides the status and sends "auth_request" with the reason', () => {
      users.findByUin.mockImplementation(usersById(user(TARGET, { authRequired: true })));
      contacts.findActive.mockReturnValue(null);

      const contact = service.add(OWNER, { uin: TARGET, nickname: 'Bobby', reason: 'Hi, it is me' });

      expect(contact).toEqual({ uin: TARGET, nickname: 'Bobby', status: 'offline', awaitingAuth: true });
      expect(notices.resolvePending).toHaveBeenCalledWith(TARGET, OWNER, 'auth_request', expect.any(String));
      expect(notices.create).toHaveBeenCalledWith(
        expect.objectContaining({ toUin: TARGET, kind: 'auth_request', reason: 'Hi, it is me' }),
      );
      expect(notifier.notify).toHaveBeenCalledWith(TARGET, {
        type: 'notice',
        notice: expect.objectContaining({ kind: 'auth_request', reason: 'Hi, it is me' }),
      });
    });

    it('sends no notice when the target ignores the owner', () => {
      users.findByUin.mockImplementation(usersById(user(TARGET)));
      contacts.findActive.mockReturnValue(null);
      ignores.isIgnoring.mockImplementation((owner, ignored) => owner === TARGET && ignored === OWNER);

      service.add(OWNER, { uin: TARGET, reason: '' });

      expect(notices.create).not.toHaveBeenCalled();
      expect(notifier.notify).not.toHaveBeenCalled();
    });

    it('rejects adding yourself, unknown users and duplicates', () => {
      expect(() => service.add(OWNER, { uin: OWNER, reason: '' })).toThrow(
        expect.objectContaining({ code: 'bad_request' }),
      );

      users.findByUin.mockReturnValue(null);
      expect(() => service.add(OWNER, { uin: TARGET, reason: '' })).toThrow(expect.objectContaining({ code: 'not_found' }));

      users.findByUin.mockImplementation(usersById(user(TARGET)));
      contacts.findActive.mockReturnValue(contactEntry(OWNER, TARGET));
      expect(() => service.add(OWNER, { uin: TARGET, reason: '' })).toThrow(expect.objectContaining({ code: 'conflict' }));
      expect(contacts.upsertActive).not.toHaveBeenCalled();
    });
  });

  describe('respondAuth', () => {
    const request: NoticeRecord = {
      id: 42,
      toUin: TARGET,
      kind: 'auth_request',
      fromUin: OWNER,
      fromNickname: 'Alice',
      reason: 'please',
      createdAt: '2026-11-04T11:00:00.000Z',
      resolvedAt: null,
    };

    it('grants: authorizes the requester, pushes contact.updated and an auth_granted notice', () => {
      notices.findUnresolved.mockReturnValue(request);
      notices.resolve.mockReturnValue(undefined);
      contacts.authorize.mockReturnValue(contactEntry(OWNER, TARGET, { authorized: true, nickname: 'Bob' }));
      contacts.findActive.mockReturnValue(null);

      service.respondAuth(TARGET, 42, true, '');

      expect(notices.resolve).toHaveBeenCalledWith(42, expect.any(String));
      expect(contacts.authorize).toHaveBeenCalledWith(OWNER, TARGET);
      expect(notifier.notify).toHaveBeenCalledWith(OWNER, {
        type: 'contact.updated',
        contact: { uin: TARGET, nickname: 'Bob', status: 'online', awaitingAuth: false },
      });
      expect(notifier.notify).toHaveBeenCalledWith(OWNER, {
        type: 'notice',
        notice: expect.objectContaining({ kind: 'auth_granted', from: TARGET }),
      });
    });

    it('grants without any notice when the requester removed the contact meanwhile', () => {
      notices.findUnresolved.mockReturnValue(request);
      notices.resolve.mockReturnValue(undefined);
      contacts.authorize.mockReturnValue(null);

      service.respondAuth(TARGET, 42, true, '');

      expect(notices.resolve).toHaveBeenCalledWith(42, expect.any(String));
      expect(notices.create).not.toHaveBeenCalled();
      expect(notifier.notify).not.toHaveBeenCalled();
    });

    it('denies: sends auth_denied with the reason and leaves the contact awaiting', () => {
      notices.findUnresolved.mockReturnValue(request);
      notices.resolve.mockReturnValue(undefined);

      service.respondAuth(TARGET, 42, false, 'Who are you?');

      expect(contacts.authorize).not.toHaveBeenCalled();
      expect(notices.resolve).toHaveBeenCalledWith(42, expect.any(String));
      expect(notifier.notify).toHaveBeenCalledTimes(1);
      expect(notifier.notify).toHaveBeenCalledWith(OWNER, {
        type: 'notice',
        notice: expect.objectContaining({ kind: 'auth_denied', reason: 'Who are you?' }),
      });
    });

    it('rejects notices that are missing, foreign or not an authorization request', () => {
      notices.findUnresolved.mockReturnValue(null);
      expect(() => service.respondAuth(TARGET, 42, true, '')).toThrow(DomainError);

      notices.findUnresolved.mockReturnValue({ ...request, kind: 'added_you' });
      expect(() => service.respondAuth(TARGET, 42, true, '')).toThrow(expect.objectContaining({ code: 'not_found' }));
      expect(notifier.notify).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('soft deletes and withdraws a pending authorization request', () => {
      contacts.remove.mockReturnValue(true);
      service.remove(OWNER, TARGET);
      expect(contacts.remove).toHaveBeenCalledWith(OWNER, TARGET, expect.any(String));
      expect(notices.resolvePending).toHaveBeenCalledWith(TARGET, OWNER, 'auth_request', expect.any(String));
    });

    it('is not_found for a contact that is not in the list', () => {
      contacts.remove.mockReturnValue(false);
      expect(() => service.remove(OWNER, TARGET)).toThrow(expect.objectContaining({ code: 'not_found' }));
      expect(notices.resolvePending).not.toHaveBeenCalled();
    });
  });

  describe('requestAuth', () => {
    it('re-sends the request only for a contact that still awaits authorization', () => {
      contacts.findActive.mockReturnValue(contactEntry(OWNER, TARGET, { authorized: false }));
      service.requestAuth(OWNER, TARGET, 'again');
      expect(notices.create).toHaveBeenCalledWith(expect.objectContaining({ kind: 'auth_request', reason: 'again' }));

      contacts.findActive.mockReturnValue(contactEntry(OWNER, TARGET, { authorized: true }));
      expect(() => service.requestAuth(OWNER, TARGET, '')).toThrow(expect.objectContaining({ code: 'bad_request' }));
    });
  });
});
