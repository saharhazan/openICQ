import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GroupPreview } from '@openicq/protocol';
import { makeServices, renderWithServices } from '../../../tests/renderWithServices';
import { JoinDialog } from './JoinDialog';

function preview(extra: Partial<GroupPreview> = {}): GroupPreview {
  return { chatId: 70, title: 'Readers', about: 'Books and more', avatarFileId: null, membersCount: 12, joinWithApproval: false, state: 'none', ...extra };
}

function setup(group: GroupPreview | null) {
  const ctx = makeServices({});
  ctx.groups.preview.mockResolvedValue(group);
  const onClose = vi.fn();
  renderWithServices(<JoinDialog token="tok12345" onClose={onClose} />, ctx.services);
  return { ...ctx, onClose };
}

describe('JoinDialog', () => {
  it('previews the group and joins it', async () => {
    const { groups, onClose } = setup(preview());
    groups.join.mockResolvedValue('member');
    expect(await screen.findByRole('dialog', { name: 'Readers' })).toBeInTheDocument();
    expect(groups.preview).toHaveBeenCalledWith('tok12345');
    expect(screen.getByText('12 members')).toBeInTheDocument();
    expect(screen.getByText('Books and more')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Join' }));
    expect(groups.join).toHaveBeenCalledWith('tok12345');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows the wait text after a join request', async () => {
    const { groups, onClose } = setup(preview({ joinWithApproval: true }));
    groups.join.mockResolvedValue('pending');
    expect(await screen.findByText('This group can be joined only after admin approval')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Join' }));
    expect(await screen.findByText('Wait for join request approval')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join' })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows a pending request directly', async () => {
    setup(preview({ state: 'pending' }));
    expect(await screen.findByText('Wait for join request approval')).toBeInTheDocument();
  });

  it('opens the chat at once for a member', async () => {
    const { store, onClose } = setup(preview({ state: 'member' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(store.getState().selectedChatId).toBe(70);
  });

  it('explains a bad or old link', async () => {
    setup(null);
    expect(
      await screen.findByText('Sorry, there was a problem with your link. Check it out and try again or ask to send you another link'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Join' })).toBeInTheDocument();
  });
});
