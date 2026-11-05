import { beforeEach, describe, expect, it } from 'vitest';
import { PresenceService } from '../../src/application/presence-service.ts';
import { VisibilityResolver } from '../../src/application/visibility-resolver.ts';
import type { PresenceRegistry } from '../../src/domain/ports.ts';
import { contactEntry, fixedClock, mockContacts, mockIgnores, mockNotifier, mockUsers, presenceOf, user } from './mocks.ts';

const TARGET = 100001;
const FRIEND = 100002;
const PENDING = 100003;
const OFFLINE_WATCHER = 100004;

describe('PresenceService', () => {
  let contacts: ReturnType<typeof mockContacts>;
  let ignores: ReturnType<typeof mockIgnores>;
  let users: ReturnType<typeof mockUsers>;
  let notifier: ReturnType<typeof mockNotifier>;
  let presence: PresenceRegistry;
  let service: PresenceService;

  beforeEach(() => {
    contacts = mockContacts();
    ignores = mockIgnores();
    users = mockUsers();
    notifier = mockNotifier();
    presence = presenceOf({ [FRIEND]: 'online', [PENDING]: 'online' });
    ignores.isIgnoring.mockReturnValue(false);
    contacts.listWatchers.mockReturnValue([
      contactEntry(FRIEND, TARGET),
      contactEntry(PENDING, TARGET, { authorized: false }),
      contactEntry(OFFLINE_WATCHER, TARGET),
    ]);
    service = new PresenceService({
      presence,
      contacts,
      users,
      notifier,
      clock: fixedClock(),
      visibility: new VisibilityResolver({ presence, contacts, ignores }),
    });
  });

  it('tells connected, authorized watchers about a connect, and nobody else', () => {
    service.connect(TARGET, 'online');
    expect(notifier.notify).toHaveBeenCalledTimes(1);
    expect(notifier.notify).toHaveBeenCalledWith(FRIEND, { type: 'presence', uin: TARGET, status: 'online' });
  });

  it('sends nothing when the visible status does not change (connection replaced with the same status)', () => {
    service.connect(TARGET, 'away');
    notifier.notify.mockClear();
    service.connect(TARGET, 'away');
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it('going invisible looks like going offline', () => {
    service.connect(TARGET, 'online');
    notifier.notify.mockClear();
    service.setStatus(TARGET, 'invisible');
    expect(notifier.notify).toHaveBeenCalledWith(FRIEND, { type: 'presence', uin: TARGET, status: 'offline' });
  });

  it('stores the away message given with an away-like status', () => {
    const current = user(TARGET);
    users.findByUin.mockReturnValue(current);
    users.updateSettings.mockReturnValue(current);
    service.setStatus(TARGET, 'na', 'Back on Monday');
    expect(users.updateSettings).toHaveBeenCalledWith(
      TARGET,
      expect.objectContaining({ awayMessages: { ...current.awayMessages, na: 'Back on Monday' } }),
    );
  });

  it('publishes offline and records last seen on disconnect', () => {
    service.connect(TARGET, 'online');
    notifier.notify.mockClear();
    users.touchLastSeen.mockReturnValue(undefined);
    service.disconnect(TARGET);
    expect(notifier.notify).toHaveBeenCalledWith(FRIEND, { type: 'presence', uin: TARGET, status: 'offline' });
    expect(users.touchLastSeen).toHaveBeenCalledWith(TARGET, expect.any(String));
  });

  it('refreshView notifies the viewer when an ignore change hides the target', () => {
    service.connect(TARGET, 'online');
    notifier.notify.mockClear();
    contacts.findActive.mockReturnValue(contactEntry(FRIEND, TARGET));
    let ignoring = false;
    ignores.isIgnoring.mockImplementation(() => ignoring);

    service.refreshView(FRIEND, TARGET, () => {
      ignoring = true;
    });

    expect(notifier.notify).toHaveBeenCalledWith(FRIEND, { type: 'presence', uin: TARGET, status: 'offline' });
  });
});
