import { describe, expect, it } from 'vitest';
import { contact, message, SELF, snapshot } from '../../tests/fixtures';
import { applyServerEvent, applySnapshot, initialChatState } from './chat';
import { groupContacts, totalUnread } from './contactList';

describe('groupContacts', () => {
  const state = applySnapshot(
    initialChatState,
    snapshot({
      contacts: [
        contact(1001, 'zed', { status: 'online' }),
        contact(1002, 'Amy', { status: 'dnd' }),
        contact(1003, 'bob', { status: 'online' }),
        contact(1004, 'Cat', { status: 'ffc' }),
        contact(1005, 'dan'),
        contact(1006, 'Ann', { awaitingAuth: true }),
      ],
    }),
  );

  it('splits Online and Offline and sorts by status, then nickname ignoring case', () => {
    const [online, offline] = groupContacts(state);
    expect(online?.title).toBe('Online');
    expect(online?.rows.map((r) => r.nickname)).toEqual(['Cat', 'bob', 'zed', 'Amy']);
    expect(offline?.title).toBe('Offline');
    expect(offline?.rows.map((r) => r.nickname)).toEqual(['dan']);
  });

  it('keeps contacts that did not authorize yet under Awaiting Authorization', () => {
    const awaiting = groupContacts(state)[2];
    expect(awaiting?.title).toBe('Awaiting Authorization');
    expect(awaiting?.rows.map((r) => r.nickname)).toEqual(['Ann']);
  });

  it('adds Not In List only for strangers who wrote, with their unread count', () => {
    expect(groupContacts(state)).toHaveLength(3);
    const withStranger = applyServerEvent(state, { type: 'message', message: message(5555, SELF, 'hi') });
    const sections = groupContacts(withStranger);
    expect(sections[3]?.title).toBe('Not In List');
    expect(sections[3]?.rows[0]).toMatchObject({ uin: 5555, unread: 1, inList: false });
    expect(totalUnread(withStranger)).toBe(1);
  });

  it('counts unread messages per contact', () => {
    const withMessages = applyServerEvent(
      applyServerEvent(state, { type: 'message', message: message(1001, SELF, 'a') }),
      { type: 'message', message: message(1001, SELF, 'b') },
    );
    const row = groupContacts(withMessages)[0]?.rows.find((r) => r.uin === 1001);
    expect(row?.unread).toBe(2);
  });
});
