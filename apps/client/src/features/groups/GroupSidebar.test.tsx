import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { GroupInfo, Member } from '@openicq/protocol';
import { ME, chat, group, user } from '../../../tests/fixtures';
import { makeServices, renderWithServices } from '../../../tests/renderWithServices';
import { GroupSidebar } from './GroupSidebar';

const JOINED = '2026-11-01T10:00:00.000Z';
const MEMBERS: Member[] = [
  { uin: ME, role: 'creator', joinedAt: JOINED },
  { uin: 200, role: 'admin', joinedAt: JOINED },
  { uin: 201, role: 'member', joinedAt: JOINED },
  { uin: 202, role: 'readonly', joinedAt: JOINED },
];

function setup(info: Partial<GroupInfo> = {}, members: Member[] = MEMBERS, before?: (ctx: ReturnType<typeof makeServices>) => void) {
  const ctx = makeServices({
    users: [user(200, 'Anna'), user(201, 'Ben'), user(202, 'Cara'), user(203, 'Dan')],
    chats: [chat(50, { type: 'group', title: 'Team', group: group({ myRole: 'creator', inviteToken: 'tok12345', about: 'We build', ...info }) })],
  });
  ctx.groups.members.mockResolvedValue(members);
  before?.(ctx);
  ctx.store.getState().patch({ sidebar: { kind: 'group', chatId: 50 } });
  renderWithServices(<GroupSidebar chatId={50} />, ctx.services);
  return ctx;
}

async function menuOf(name: RegExp) {
  const ui = userEvent.setup();
  await ui.click(await screen.findByRole('button', { name }));
  const menu = screen.getByRole('menu');
  return { ui, items: within(menu).getAllByRole('menuitem').map((item) => item.textContent) };
}

describe('GroupSidebar', () => {
  it('shows the group, its about text and the members with their role labels', async () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Team' })).toBeInTheDocument();
    expect(screen.getByText('We build')).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'All members' });
    const rows = within(list).getAllByRole('button');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Creator'),
      expect.stringContaining('Admin'),
      expect.not.stringMatching(/Creator|Admin|Read Only/),
      expect.stringContaining('Read Only'),
    ]);
    expect(within(rows[2] as HTMLElement).getByText('Ben')).toBeInTheDocument();
  });

  it('gives the creator the full member menu', async () => {
    setup();
    expect((await menuOf(/^Ben/)).items).toEqual(['Assign admin role', 'Ban to write', 'Delete', 'Profile']);
  });

  it('lets the creator revoke an admin', async () => {
    setup();
    expect((await menuOf(/^Anna/)).items).toEqual(['Revoke admin role', 'Delete', 'Profile']);
  });

  it('gives an admin no admin assignment and no actions on other admins', async () => {
    setup({ myRole: 'admin' }, [{ uin: ME, role: 'admin', joinedAt: JOINED }, ...MEMBERS.slice(1).map((m) => (m.uin === 200 ? { ...m, role: 'creator' as const } : m))]);
    expect((await menuOf(/^Cara/)).items).toEqual(['Allow to write', 'Delete', 'Profile']);
  });

  it('shows plain members only the profile and no admin rows', async () => {
    setup({ myRole: 'member', inviteToken: null });
    expect(screen.queryByRole('button', { name: 'Group settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add member' })).not.toBeInTheDocument();
    expect((await menuOf(/^Ben/)).items).toEqual(['Profile']);
  });

  it('deletes a member after the original confirmation and reloads the list', async () => {
    const { store, groups } = setup();
    const { ui } = await menuOf(/^Ben/);
    await ui.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = store.getState().dialog;
    if (dialog?.kind !== 'confirm') throw new Error('no confirm');
    expect(dialog.spec.text).toBe('Are you sure you want to delete user from this chat?');
    dialog.spec.onConfirm();
    await waitFor(() => expect(groups.removeMember).toHaveBeenCalledWith(50, 201));
    await waitFor(() => expect(groups.members).toHaveBeenCalledTimes(2));
  });

  it('assigns the admin role through setRole', async () => {
    const { store, groups } = setup();
    const { ui } = await menuOf(/^Ben/);
    await ui.click(screen.getByRole('menuitem', { name: 'Assign admin role' }));
    const dialog = store.getState().dialog;
    if (dialog?.kind !== 'confirm') throw new Error('no confirm');
    expect(dialog.spec.text).toBe('Are you sure you want to make user admin in this chat?');
    dialog.spec.onConfirm();
    await waitFor(() => expect(groups.setRole).toHaveBeenCalledWith(50, 201, 'admin'));
  });

  it('copies the invite link', async () => {
    const { store } = setup();
    const link = `${window.location.origin}/#/join/tok12345`;
    expect(screen.getByText(link)).toBeInTheDocument();
    // user-event installs a clipboard stub on navigator that can be read back.
    const ui = userEvent.setup();
    await ui.click(screen.getByRole('button', { name: 'Copy link to group' }));
    await expect(navigator.clipboard.readText()).resolves.toBe(link);
    await waitFor(() => expect(store.getState().toasts.map((t) => t.text)).toContain('Link copied'));
  });

  it('regenerates the link after confirmation', async () => {
    const { store, groups } = setup();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Generate new link' }));
    const dialog = store.getState().dialog;
    if (dialog?.kind !== 'confirm') throw new Error('no confirm');
    expect(dialog.spec.confirmLabel).toBe('Generate');
    dialog.spec.onConfirm();
    expect(groups.regenerateLink).toHaveBeenCalledWith(50);
  });

  it('approves join requests for admins', async () => {
    const { groups } = setup({ pendingRequests: 1 }, MEMBERS, (ctx) => ctx.groups.requests.mockResolvedValue([{ uin: 203, requestedAt: JOINED }]));
    const row = await screen.findByRole('listitem', { name: 'Dan' });
    await userEvent.setup().click(within(row).getByRole('button', { name: 'Approve' }));
    expect(groups.resolveRequest).toHaveBeenCalledWith(50, 203, true);
    await waitFor(() => expect(screen.queryByRole('listitem', { name: 'Dan' })).not.toBeInTheDocument());
  });

  it('leaves and deletes the group', async () => {
    const { store, chats } = setup();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Leave and delete' }));
    const dialog = store.getState().dialog;
    if (dialog?.kind !== 'confirm') throw new Error('no confirm');
    expect(dialog.spec.text).toBe('Are you sure you want to erase history and leave the group?');
    dialog.spec.onConfirm();
    expect(chats.remove).toHaveBeenCalledWith(50);
    expect(store.getState().sidebar).toBeNull();
  });

  it('saves group settings', async () => {
    const { groups } = setup();
    const ui = userEvent.setup();
    await ui.click(screen.getByRole('button', { name: 'Group settings' }));
    const name = screen.getByLabelText('Group name');
    await ui.clear(name);
    await ui.type(name, 'Team 2');
    await ui.click(screen.getByRole('switch', { name: /Public chat/ }));
    await ui.click(screen.getByRole('button', { name: 'Apply' }));
    expect(groups.update).toHaveBeenCalledWith(50, { name: 'Team 2', public: true });
  });
});
