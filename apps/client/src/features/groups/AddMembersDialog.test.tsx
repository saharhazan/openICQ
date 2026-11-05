import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { chat, group, user } from '../../../tests/fixtures';
import { makeServices, renderWithServices } from '../../../tests/renderWithServices';
import { AddMembersDialog } from './AddMembersDialog';

function setup() {
  const ctx = makeServices({
    users: [user(200, 'Anna'), user(201, 'Ben')],
    contacts: [200, 201],
    chats: [chat(50, { type: 'group', title: 'Team', group: group({ myRole: 'admin', inviteToken: 'tok12345' }) })],
  });
  ctx.groups.members.mockResolvedValue([{ uin: 200, role: 'member', joinedAt: '2026-11-01T10:00:00.000Z' }]);
  const onClose = vi.fn();
  renderWithServices(<AddMembersDialog chatId={50} onClose={onClose} />, ctx.services);
  return { ...ctx, onClose };
}

describe('AddMembersDialog', () => {
  it('offers only contacts outside the group and adds the chosen ones', async () => {
    const { groups, onClose } = setup();
    const ben = await screen.findByRole('checkbox', { name: 'Ben' });
    expect(screen.queryByRole('checkbox', { name: 'Anna' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    const ui = userEvent.setup();
    await ui.click(ben);
    await ui.click(screen.getByRole('button', { name: 'Add' }));
    expect(groups.addMembers).toHaveBeenCalledWith(50, [201]);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows the refused step with the invite link', async () => {
    const { groups, onClose } = setup();
    groups.addMembers.mockResolvedValue({ added: [], refused: [201] });
    const ui = userEvent.setup();
    await ui.click(await screen.findByRole('checkbox', { name: 'Ben' }));
    await ui.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('button', { name: 'Send them invite link' })).toBeInTheDocument();
    expect(screen.getByText(/You cannot add Ben to the group/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
