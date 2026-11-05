import { beforeEach, describe, expect, it } from 'vitest';
import type { SettableStatus } from '@openicq/protocol';
import type { MessageRecord, NewMessage } from '../../src/domain/entities.ts';
import { MessagingService } from '../../src/application/messaging-service.ts';
import { VisibilityResolver } from '../../src/application/visibility-resolver.ts';
import {
  fixedClock,
  mockContacts,
  mockIgnores,
  mockMessages,
  mockNotifier,
  mockUsers,
  presenceOf,
  user,
  usersById,
} from './mocks.ts';

const SENDER = 100001;
const RECIPIENT = 100002;

function stored(message: NewMessage, id = 1): MessageRecord {
  return { ...message, id, readAt: null };
}

describe('MessagingService', () => {
  let users: ReturnType<typeof mockUsers>;
  let messages: ReturnType<typeof mockMessages>;
  let contacts: ReturnType<typeof mockContacts>;
  let ignores: ReturnType<typeof mockIgnores>;
  let notifier: ReturnType<typeof mockNotifier>;

  function serviceWith(recipientStatus: SettableStatus | null): MessagingService {
    const presence = presenceOf(recipientStatus === null ? {} : { [RECIPIENT]: recipientStatus });
    return new MessagingService({
      users,
      messages,
      contacts,
      ignores,
      notifier,
      clock: fixedClock(),
      visibility: new VisibilityResolver({ presence, contacts, ignores }),
    });
  }

  beforeEach(() => {
    users = mockUsers();
    messages = mockMessages();
    contacts = mockContacts();
    ignores = mockIgnores();
    notifier = mockNotifier();
    users.findByUin.mockImplementation(
      usersById(user(SENDER), user(RECIPIENT, { awayMessages: { away: 'Gone fishing', na: 'N/A text', occupied: 'Busy', dnd: 'DND', ffc: 'Chat with me' } })),
    );
    contacts.findActive.mockReturnValue(null);
    ignores.isIgnoring.mockReturnValue(false);
    messages.create.mockImplementation((message) => stored(message));
  });

  it('delivers live and returns the away message as auto-response when the recipient is Away', () => {
    const outcome = serviceWith('away').send(SENDER, RECIPIENT, 'hello', false);

    expect(outcome.autoResponse).toEqual({ status: 'away', text: 'Gone fishing' });
    expect(outcome.message).toMatchObject({ from: SENDER, to: RECIPIENT, text: 'hello', deliveredOffline: false, read: false });
    expect(notifier.notify).toHaveBeenCalledWith(RECIPIENT, { type: 'message', message: outcome.message });
  });

  it.each([
    ['na', 'N/A text'],
    ['occupied', 'Busy'],
    ['dnd', 'DND'],
  ] as const)('auto-responds for %s', (status, text) => {
    expect(serviceWith(status).send(SENDER, RECIPIENT, 'hi', false).autoResponse).toEqual({ status, text });
  });

  it('has no auto-response for online, Free For Chat, invisible or offline recipients', () => {
    expect(serviceWith('online').send(SENDER, RECIPIENT, 'hi', false).autoResponse).toBeNull();
    expect(serviceWith('ffc').send(SENDER, RECIPIENT, 'hi', false).autoResponse).toBeNull();
    expect(serviceWith('invisible').send(SENDER, RECIPIENT, 'hi', false).autoResponse).toBeNull();
    expect(serviceWith(null).send(SENDER, RECIPIENT, 'hi', false).autoResponse).toBeNull();
  });

  it('stores and relays the urgent flag', () => {
    const outcome = serviceWith('occupied').send(SENDER, RECIPIENT, 'need you now', true);
    expect(messages.create).toHaveBeenCalledWith(expect.objectContaining({ urgent: true }));
    expect(outcome.message.urgent).toBe(true);
    expect(notifier.notify).toHaveBeenCalledWith(RECIPIENT, { type: 'message', message: outcome.message });
  });

  it('drops the urgent flag for a recipient in DND, who does not accept urgent events', () => {
    const outcome = serviceWith('dnd').send(SENDER, RECIPIENT, 'need you now', true);
    expect(messages.create).toHaveBeenCalledWith(expect.objectContaining({ urgent: false }));
    expect(outcome.message.urgent).toBe(false);
  });

  it('stores the message for later when the recipient is offline', () => {
    serviceWith(null).send(SENDER, RECIPIENT, 'see you', false);
    expect(messages.create).toHaveBeenCalledWith(expect.objectContaining({ deliveredOffline: true, recipientHidden: false }));
  });

  it('marks a message to an invisible recipient as offline so the sender learns nothing, yet delivers it', () => {
    const outcome = serviceWith('invisible').send(SENDER, RECIPIENT, 'psst', false);
    expect(outcome.message.deliveredOffline).toBe(true);
    expect(notifier.notify).toHaveBeenCalledWith(RECIPIENT, { type: 'message', message: outcome.message });
  });

  it('stores but never delivers when the recipient ignores the sender, and still reports success', () => {
    ignores.isIgnoring.mockImplementation((owner, ignored) => owner === RECIPIENT && ignored === SENDER);

    const outcome = serviceWith('away').send(SENDER, RECIPIENT, 'are you there', false);

    expect(messages.create).toHaveBeenCalledWith(expect.objectContaining({ recipientHidden: true, deliveredOffline: true }));
    expect(notifier.notify).not.toHaveBeenCalled();
    expect(outcome.message.text).toBe('are you there');
    expect(outcome.autoResponse).toBeNull();
  });

  it('rejects messages to yourself and to unknown users', () => {
    const service = serviceWith('online');
    expect(() => service.send(SENDER, SENDER, 'me', false)).toThrow(expect.objectContaining({ code: 'bad_request' }));
    expect(() => service.send(SENDER, 999999, 'who', false)).toThrow(expect.objectContaining({ code: 'not_found' }));
    expect(messages.create).not.toHaveBeenCalled();
  });

  it('returns a history page oldest first and says whether older messages exist', () => {
    const newestFirst = [5, 4, 3].map((id) =>
      stored({ fromUin: SENDER, toUin: RECIPIENT, text: `m${id}`, kind: 'normal', sentAt: '', deliveredOffline: false, urgent: false, recipientHidden: false }, id),
    );
    messages.history.mockReturnValue(newestFirst);

    const page = serviceWith('online').history(SENDER, RECIPIENT, undefined, 2);

    expect(messages.history).toHaveBeenCalledWith(SENDER, RECIPIENT, null, 3);
    expect(page.messages.map((message) => message.id)).toEqual([4, 5]);
    expect(page.hasMore).toBe(true);
  });

  it('lists unread senders that are not in the contact list', () => {
    const unread = [SENDER, SENDER].map((from, index) => ({
      id: index + 1,
      from,
      to: RECIPIENT,
      text: 'x',
      kind: 'normal' as const,
      sentAt: '',
      deliveredOffline: true,
      urgent: false,
      read: false,
    }));
    expect(serviceWith('online').notInList(RECIPIENT, unread)).toEqual([{ uin: SENDER, nickname: `User${SENDER}` }]);
  });
});
