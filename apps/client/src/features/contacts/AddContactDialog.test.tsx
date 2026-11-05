import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ME, user } from '../../../tests/fixtures';
import { makeServices, renderWithServices } from '../../../tests/renderWithServices';
import { AddContactDialog } from './AddContactDialog';

function setup() {
  const ctx = makeServices({});
  const onClose = vi.fn();
  renderWithServices(<AddContactDialog onClose={onClose} />, ctx.services);
  return { ...ctx, onClose };
}

const FIELD = 'Nickname or ICQ#';

describe('AddContactDialog', () => {
  it('needs two characters before Find', async () => {
    const { account } = setup();
    expect(screen.getByRole('dialog', { name: 'Add contact' })).toBeInTheDocument();
    const ui = userEvent.setup();
    await ui.type(screen.getByLabelText(FIELD), 'a{Enter}');
    expect(screen.getByRole('button', { name: 'Find' })).toBeDisabled();
    expect(account.search).not.toHaveBeenCalled();
  });

  it('finds a person and adds them', async () => {
    const { account } = setup();
    const anna = user(200, 'Anna', { nickname: 'anna.k', isContact: false });
    account.search.mockResolvedValue([anna, user(ME, 'Sahar')]);
    account.addContact.mockResolvedValue({ ...anna, isContact: true });
    const ui = userEvent.setup();
    await ui.type(screen.getByLabelText(FIELD), 'anna.k');
    await ui.click(screen.getByRole('button', { name: 'Find' }));
    expect(account.search).toHaveBeenCalledWith('anna.k');
    const row = await screen.findByRole('listitem', { name: 'Anna' });
    expect(screen.queryByRole('listitem', { name: 'Sahar' })).not.toBeInTheDocument();
    expect(within(row).getByText('@anna.k')).toBeInTheDocument();
    await ui.click(within(row).getByRole('button', { name: 'Add' }));
    expect(account.addContact).toHaveBeenCalledWith(200);
    expect(await within(row).findByText('The user has already been added earlier')).toBeInTheDocument();
  });

  it('says when nobody is found', async () => {
    const { account } = setup();
    account.search.mockResolvedValue([]);
    const ui = userEvent.setup();
    await ui.type(screen.getByLabelText(FIELD), '123456{Enter}');
    expect(await screen.findByText('User is not found')).toBeInTheDocument();
  });

  it('opens a chat with a found person', async () => {
    const { account, chats, onClose, store } = setup();
    account.search.mockResolvedValue([user(200, 'Anna')]);
    const ui = userEvent.setup();
    await ui.type(screen.getByLabelText(FIELD), 'anna{Enter}');
    const row = await screen.findByRole('listitem', { name: 'Anna' });
    await ui.click(within(row).getByRole('button', { name: 'Message' }));
    expect(onClose).toHaveBeenCalled();
    expect(chats.openDirect).toHaveBeenCalledWith(200);
    await waitFor(() => expect(store.getState().tab).toBe('chats'));
  });
});
