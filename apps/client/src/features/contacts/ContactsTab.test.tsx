import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { user } from '../../../tests/fixtures';
import { makeServices, renderWithServices } from '../../../tests/renderWithServices';
import { ContactsTab } from './ContactsTab';

function setup(contacts = [201, 200, 202], mini = false) {
  const ctx = makeServices({
    users: [user(200, 'Anna', { presence: { online: true, lastSeen: null } }), user(201, 'Ben'), user(202, 'Cara')],
    contacts,
  });
  renderWithServices(<ContactsTab mini={mini} />, ctx.services);
  return ctx;
}

describe('ContactsTab', () => {
  it('lists contacts alphabetically under ALL CONTACTS with their presence', () => {
    setup();
    expect(screen.getByText('ALL CONTACTS')).toBeInTheDocument();
    const list = screen.getByRole('listbox', { name: 'Contacts' });
    expect(within(list).getAllByRole('option').map((o) => o.getAttribute('aria-label'))).toEqual(['Anna', 'Ben', 'Cara']);
    expect(within(list).getByText('Online')).toBeInTheDocument();
    expect(within(list).getAllByText('Has never been here')).toHaveLength(2);
  });

  it('opens the direct chat on click and switches to Chats', async () => {
    const { chats, store } = setup();
    await userEvent.setup().click(screen.getByRole('option', { name: 'Ben' }));
    expect(chats.openDirect).toHaveBeenCalledWith(201);
    await waitFor(() => expect(store.getState().tab).toBe('chats'));
  });

  it('opens the chat with Enter', async () => {
    const { chats } = setup();
    const option = screen.getByRole('option', { name: 'Cara' });
    option.focus();
    await userEvent.setup().keyboard('{Enter}');
    expect(chats.openDirect).toHaveBeenCalledWith(202);
  });

  it('removes a contact from the context menu after confirmation', async () => {
    const { store, account } = setup();
    fireEvent.contextMenu(screen.getByRole('option', { name: 'Anna' }), { clientX: 10, clientY: 10 });
    const menu = screen.getByRole('menu', { name: 'Anna' });
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Profile', 'Remove contact']);
    await userEvent.setup().click(within(menu).getByRole('menuitem', { name: 'Remove contact' }));
    const dialog = store.getState().dialog;
    if (dialog?.kind !== 'confirm') throw new Error('no confirm');
    expect(dialog.spec.title).toBe('Remove contact');
    expect(dialog.spec.text).toBe('Remove Anna from your contacts?');
    dialog.spec.onConfirm();
    expect(account.removeContact).toHaveBeenCalledWith(200);
  });

  it('shows the profile in the sidebar from the context menu', async () => {
    const { store, chats } = setup();
    fireEvent.contextMenu(screen.getByRole('option', { name: 'Ben' }), { clientX: 10, clientY: 10 });
    await userEvent.setup().click(screen.getByRole('menuitem', { name: 'Profile' }));
    expect(chats.openDirect).toHaveBeenCalledWith(201);
    await waitFor(() => expect(store.getState().sidebar).toEqual({ kind: 'user', uin: 201 }));
  });

  it('opens the Add contact dialog', async () => {
    const { store } = setup();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add contact' }));
    expect(store.getState().dialog).toEqual({ kind: 'addContact' });
  });

  it('says when the contact list is empty', () => {
    setup([]);
    expect(screen.getByText('Contact list is empty')).toBeInTheDocument();
    expect(screen.queryByText('ALL CONTACTS')).not.toBeInTheDocument();
  });

  it('draws avatars only in mini mode, still named for assistive tech', () => {
    setup([200], true);
    expect(screen.getByRole('option', { name: 'Anna' })).toBeInTheDocument();
    expect(screen.queryByText('Online')).not.toBeInTheDocument();
  });
});
