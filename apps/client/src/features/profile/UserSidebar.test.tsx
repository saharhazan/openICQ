import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { User } from '@openicq/protocol';
import { user } from '../../../tests/fixtures';
import { makeServices, renderWithServices } from '../../../tests/renderWithServices';
import { UserSidebar } from './UserSidebar';

function setup(extra: Partial<User> = {}, known = true) {
  const ctx = makeServices({ users: known ? [user(200, 'Anna', { nickname: 'anna.k', about: 'Hello there', ...extra })] : [] });
  ctx.store.getState().patch({ sidebar: { kind: 'user', uin: 200 } });
  renderWithServices(<UserSidebar uin={200} />, ctx.services);
  return ctx;
}

function confirmSpec(ctx: ReturnType<typeof makeServices>) {
  const dialog = ctx.store.getState().dialog;
  if (dialog?.kind !== 'confirm') throw new Error('no confirm');
  return dialog.spec;
}

describe('UserSidebar', () => {
  it('shows the profile and refreshes it from the server', () => {
    const { account } = setup();
    expect(screen.getByRole('region', { name: 'Information' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Anna' })).toBeInTheDocument();
    expect(screen.getByText('@anna.k')).toBeInTheDocument();
    expect(screen.getByText('Hello there')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(account.getUser).toHaveBeenCalledWith(200);
  });

  it('blocks after the original confirmation', async () => {
    const ctx = setup();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Block' }));
    const spec = confirmSpec(ctx);
    expect(spec.text).toBe('Are you sure you want to move contact to ignore list?');
    spec.onConfirm();
    expect(ctx.chats.block).toHaveBeenCalledWith(200, true);
  });

  it('unblocks a blocked user', async () => {
    const ctx = setup({ blocked: true });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Unblock' }));
    const spec = confirmSpec(ctx);
    expect(spec.text).toBe('Are you sure you want to unblock user?');
    spec.onConfirm();
    expect(ctx.chats.block).toHaveBeenCalledWith(200, false);
  });

  it('removes a contact, or adds a stranger', async () => {
    const ctx = setup();
    expect(screen.queryByRole('button', { name: 'Add contact' })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Remove contact' }));
    confirmSpec(ctx).onConfirm();
    expect(ctx.account.removeContact).toHaveBeenCalledWith(200);
  });

  it('adds a user who is not a contact', async () => {
    const ctx = setup({ isContact: false });
    expect(screen.queryByRole('button', { name: 'Remove contact' })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add contact' }));
    expect(ctx.account.addContact).toHaveBeenCalledWith(200);
  });

  it('opens the chat with Message and closes with Close', async () => {
    const ctx = setup();
    const ui = userEvent.setup();
    await ui.click(screen.getByRole('button', { name: 'Message' }));
    expect(ctx.chats.openDirect).toHaveBeenCalledWith(200);
    await ui.click(screen.getByRole('button', { name: 'Close' }));
    expect(ctx.store.getState().sidebar).toBeNull();
  });

  it('copies the nickname', async () => {
    const ctx = setup();
    const ui = userEvent.setup();
    await ui.click(screen.getByRole('button', { name: 'Copy nickname' }));
    await expect(navigator.clipboard.readText()).resolves.toBe('@anna.k');
    expect(ctx.store.getState().toasts.map((t) => t.text)).toContain('Nickname copied');
  });

  it('waits for an unknown user', () => {
    const { account } = setup({}, false);
    expect(screen.queryByRole('button', { name: 'Message' })).not.toBeInTheDocument();
    expect(account.getUser).toHaveBeenCalledWith(200);
  });
});
