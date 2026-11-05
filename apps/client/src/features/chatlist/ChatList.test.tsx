import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ME, chat, message, user } from '../../../tests/fixtures';
import { makeServices, renderWithServices } from '../../../tests/renderWithServices';
import { addOutgoing } from '../../state/data';
import { ChatList } from './ChatList';
import { chatMenuEntries } from './chatMenu';

const anna = user(2, 'Anna', { presence: { online: true, lastSeen: null } });
const ben = user(3, 'Ben');

function setup() {
  const mine = message(1, ME, 'see you', { id: 21, sentAt: '2026-11-05T10:00:00.000Z' });
  const fromBen = message(2, 3, 'ping', { id: 22, sentAt: '2026-11-05T10:30:00.000Z' });
  const ctx = makeServices({
    users: [anna, ben],
    chats: [
      chat(1, { peer: 2, lastMessage: mine, peerDeliveredId: 21, updatedAt: '2026-11-05T10:00:00.000Z' }),
      chat(2, { peer: 3, lastMessage: fromBen, unread: 4, muted: true, updatedAt: '2026-11-05T10:30:00.000Z' }),
      chat(3, { type: 'favorites', pinned: true, updatedAt: '2026-11-01T10:00:00.000Z' }),
      chat(4, { type: 'group', title: 'Team', updatedAt: '2026-11-05T09:00:00.000Z', group: null }),
    ],
  });
  renderWithServices(<ChatList mini={false} />, ctx.services);
  return ctx;
}

describe('ChatList', () => {
  it('lists PINNED then RECENTS, newest first, named by title', () => {
    setup();
    const list = screen.getByRole('listbox', { name: 'Chats' });
    expect(within(list).getAllByRole('option').map((o) => o.getAttribute('aria-label'))).toEqual(['Favorites', 'Ben', 'Anna', 'Team']);
    expect(screen.getByText('PINNED')).toBeInTheDocument();
    expect(screen.getByText('RECENTS')).toBeInTheDocument();
  });

  it('shows the unread pill, muted in base_tertiary, and the delivery tick of my last message', () => {
    setup();
    const ben = screen.getByRole('option', { name: 'Ben' });
    const pill = ben.querySelector('.unread-pill');
    expect(pill).toHaveTextContent('4');
    expect(pill).toHaveClass('unread-muted');
    const anna = screen.getByRole('option', { name: 'Anna' });
    expect(anna.querySelector('[data-tick="delivered"]')).not.toBeNull();
  });

  it('shows the reader head when my last message was read', () => {
    const ctx = setup();
    act(() => ctx.store.getState().updateData((d) => ({ ...d, chats: { ...d.chats, 1: { ...chat(1, { peer: 2 }), ...d.chats[1], peerReadId: 21 } } })));
    expect(screen.getByRole('option', { name: 'Anna' }).querySelector('[data-tick="read"]')).not.toBeNull();
  });

  it('shows a pending clock while my message is on its way', () => {
    const ctx = setup();
    act(() =>
      ctx.store
        .getState()
        .updateData((d) => addOutgoing(d, { clientId: 'x', chatId: 1, text: 'more', replyTo: null, attachments: [], createdAt: 0, state: 'pending' })),
    );
    expect(screen.getByRole('option', { name: 'Anna' }).querySelector('[data-tick="pending"]')).not.toBeNull();
  });

  it('shows Draft and is typing...', () => {
    const ctx = setup();
    act(() => {
      ctx.store.getState().setDraft(1, 'unfinished');
      ctx.store.getState().updateData((d) => ({ ...d, typing: { 2: [3] } }));
    });
    expect(screen.getByRole('option', { name: 'Anna' })).toHaveTextContent('Draft: unfinished');
    expect(screen.getByRole('option', { name: 'Ben' })).toHaveTextContent('is typing...');
  });

  it('opens a chat on click and marks it selected', async () => {
    const ctx = setup();
    await userEvent.click(screen.getByRole('option', { name: 'Anna' }));
    expect(ctx.store.getState().selectedChatId).toBe(1);
    expect(screen.getByRole('option', { name: 'Anna' })).toHaveAttribute('aria-selected', 'true');
  });

  it('offers the row menu and runs its actions', async () => {
    const ctx = setup();
    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByRole('option', { name: 'Ben' }) });
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Mark as read',
      'Pin',
      'Turn on notifications',
      'Clear history',
      'Block',
      'Hide',
    ]);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Pin' }));
    expect(ctx.chats.update).toHaveBeenCalledWith(2, { pinned: true });
  });

  it('switches to compact rows without the message line', () => {
    const ctx = setup();
    act(() => ctx.store.getState().setPrefs({ compact: true }));
    const row = screen.getByRole('option', { name: 'Anna' });
    expect(row).toHaveClass('chat-row-compact');
    expect(row).not.toHaveTextContent('see you');
  });
});

describe('chatMenuEntries', () => {
  it('builds the group menu with Leave and delete', () => {
    const entries = chatMenuEntries(chat(9, { type: 'group', title: 'G', pinned: true, unread: 0, lastMessage: message(9, 3, 'x') }), undefined);
    expect(entries.map((e) => e.label)).toEqual(['Mark as unread', 'Unpin', 'Turn off notifications', 'Clear history', 'Leave and delete']);
  });

  it('offers Unblock for a blocked peer and nothing to mute in Favorites', () => {
    expect(chatMenuEntries(chat(1, { peer: 2 }), user(2, 'A', { blocked: true })).map((e) => e.action)).toContain('unblock');
    expect(chatMenuEntries(chat(3, { type: 'favorites' }), undefined).map((e) => e.action)).toEqual(['pin', 'clear']);
  });
});
