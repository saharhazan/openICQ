import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { chat, group, user } from '../../../tests/fixtures';
import { makeServices, renderWithServices } from '../../../tests/renderWithServices';
import { upsertChat } from '../../state/data';
import { CreateGroupDialog } from './CreateGroupDialog';

function setup() {
  const ctx = makeServices({ users: [user(200, 'Anna'), user(201, 'Ben')], contacts: [200, 201] });
  const onClose = vi.fn();
  renderWithServices(<CreateGroupDialog onClose={onClose} />, ctx.services);
  return { ...ctx, onClose };
}

async function fillName(name: string) {
  const ui = userEvent.setup();
  await ui.type(screen.getByLabelText('Group name'), name);
  await ui.click(screen.getByRole('button', { name: 'Next' }));
  return ui;
}

describe('CreateGroupDialog', () => {
  it('needs a group name before Next', async () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Create group' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: /Join with Approval/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: /Public chat/ })).toBeInTheDocument();
  });

  it('asks before creating a group without members', async () => {
    const { groups } = setup();
    const ui = await fillName('Team');
    await ui.click(screen.getByRole('button', { name: 'Create' }));
    expect(
      screen.getByText('You have not selected anyone from the list, are you sure you want to create a group without members?'),
    ).toBeInTheDocument();
    expect(groups.create).not.toHaveBeenCalled();
    await ui.click(screen.getByRole('button', { name: 'Create' }));
    expect(groups.create).toHaveBeenCalledWith({ name: 'Team', avatarFileId: null, memberUins: [], joinWithApproval: false, public: false });
  });

  it('creates with the chosen options and members, then opens the group', async () => {
    const { groups, store, onClose } = setup();
    groups.create.mockResolvedValue({ chatId: 50, refused: [] });
    const ui = userEvent.setup();
    await ui.type(screen.getByLabelText('Group name'), 'Team');
    await ui.click(screen.getByRole('switch', { name: /Join with Approval/ }));
    await ui.click(screen.getByRole('button', { name: 'Next' }));
    await ui.click(screen.getByRole('checkbox', { name: 'Ben' }));
    await ui.click(screen.getByRole('button', { name: 'Create' }));
    expect(groups.create).toHaveBeenCalledWith({ name: 'Team', avatarFileId: null, memberUins: [201], joinWithApproval: true, public: false });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(store.getState().selectedChatId).toBe(50);
  });

  it('lists refused members and sends them the invite link', async () => {
    const { groups, chats, store, onClose } = setup();
    groups.create.mockImplementation(async () => {
      store.getState().updateData((d) =>
        upsertChat(d, chat(50, { type: 'group', title: 'Team', group: group({ myRole: 'creator', inviteToken: 'tok12345' }) })),
      );
      return { chatId: 50, refused: [200] };
    });
    chats.openDirect.mockImplementation(async (uin: number) => {
      store.getState().updateData((d) => upsertChat(d, chat(60, { peer: uin })));
    });
    const ui = await fillName('Team');
    await ui.click(screen.getByRole('checkbox', { name: 'Anna' }));
    await ui.click(screen.getByRole('button', { name: 'Create' }));

    const link = `${window.location.origin}/#/join/tok12345`;
    expect(await screen.findByText(`You cannot add Anna to the group. Send the user a link to join ${link}`)).toBeInTheDocument();
    await ui.click(screen.getByRole('button', { name: 'Send them invite link' }));
    await waitFor(() => expect(chats.send).toHaveBeenCalledWith(60, `Join the group ${link}`));
    expect(chats.openDirect).toHaveBeenCalledWith(200);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(store.getState().selectedChatId).toBe(50);
  });

  it('filters the member list', async () => {
    setup();
    const ui = await fillName('Team');
    await ui.type(screen.getByRole('searchbox', { name: 'Search' }), 'be');
    expect(screen.getByRole('checkbox', { name: 'Ben' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Anna' })).not.toBeInTheDocument();
  });
});
