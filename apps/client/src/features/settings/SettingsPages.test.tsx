import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DesktopBridge } from '@openicq/desktop-bridge';
import type { Services } from '../../app/services';
import { user as makeUser } from '../../../tests/fixtures';
import { makeServices, renderWithServices } from '../../../tests/renderWithServices';
import type { SettingsPage as PageName } from '../../state/store';
import { SettingsPage } from './SettingsPage';

function open(page: PageName, ctx = makeServices({})) {
  const user = userEvent.setup();
  renderWithServices(<SettingsPage page={page} />, ctx.services);
  return { ...ctx, user };
}

function fakeBridge(): DesktopBridge {
  return {
    platform: 'darwin',
    setUnread: vi.fn(),
    notify: vi.fn(),
    setPreferences: vi.fn(),
    openConnectionSettings: vi.fn(),
    quit: vi.fn(),
    windowState: () => ({ visible: true, focused: true }),
    onWindowState: vi.fn(() => () => undefined),
    onNotificationClick: vi.fn(() => () => undefined),
    onTrayCommand: vi.fn(() => () => undefined),
  };
}

describe('Settings: Notifications', () => {
  it('shows the original rows with their defaults', () => {
    open('notifications');
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Play sounds' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Outgoing messages sound' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: 'Show notifications when app in focus' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('switch', { name: 'Animate taskbar icon' })).toBeNull();
  });

  it('stores a toggle in the device settings', async () => {
    const { user, store } = open('notifications');
    await user.click(screen.getByRole('switch', { name: 'Play sounds' }));
    expect(store.getState().prefs.playSounds).toBe(false);
    await user.click(screen.getByRole('switch', { name: 'Hide message text in notifications' }));
    expect(store.getState().prefs.hideText).toBe(true);
  });

  it('asks the browser for permission when notifications are turned on, and says when it is blocked', async () => {
    const ctx = makeServices({});
    ctx.store.getState().setPrefs({ showNotifications: false });
    ctx.notifier.requestPermission.mockResolvedValueOnce('denied');
    const { user } = open('notifications', ctx);
    await user.click(screen.getByRole('switch', { name: 'Show notifications' }));
    expect(ctx.notifier.requestPermission).toHaveBeenCalledTimes(1);
    expect(ctx.store.getState().prefs.showNotifications).toBe(true);
    expect(await screen.findByText('Notifications are blocked in this browser')).toBeInTheDocument();
  });
});

describe('Settings: General', () => {
  it('hides the desktop-only rows in a browser and keeps link previews off', () => {
    open('general');
    expect(screen.queryByRole('switch', { name: 'Launch when system starts' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Connection settings' })).toBeNull();
    expect(screen.getByRole('switch', { name: 'Preview links' })).toBeDisabled();
  });

  it('shows launch options and Connection settings in the desktop app', async () => {
    const ctx = makeServices({});
    const bridge = fakeBridge();
    const services = { ...ctx.services, bridge } as Services;
    const user = userEvent.setup();
    renderWithServices(<SettingsPage page="general" />, services);
    await user.click(screen.getByRole('switch', { name: 'Launch when system starts' }));
    expect(ctx.store.getState().prefs.launchAtLogin).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Connection settings' }));
    expect(bridge.openConnectionSettings).toHaveBeenCalledTimes(1);
  });
});

describe('Settings: Appearance and Shortcuts', () => {
  it('switches the theme, the font size and the compact list', async () => {
    const { user, store } = open('appearance');
    await user.click(screen.getByRole('radio', { name: 'Dark Green' }));
    await user.click(screen.getByRole('radio', { name: 'Large' }));
    await user.click(screen.getByRole('switch', { name: 'Chat list compact mode' }));
    expect(store.getState().prefs).toMatchObject({ theme: 'dark-green', fontSize: 'large', compact: true });
  });

  it('chooses the send key', async () => {
    const { user, store } = open('shortcuts');
    expect(screen.getByRole('radio', { name: 'Enter' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Ctrl + Enter' }));
    expect(store.getState().prefs.sendKey).toBe('ctrlEnter');
  });
});

describe('Settings: Privacy', () => {
  it('sends "Who can add me to groups"', async () => {
    const { user, account } = open('privacy');
    expect(screen.getByRole('radio', { name: 'Everybody' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Nobody' }));
    expect(account.setGroupInvites).toHaveBeenCalledWith('nobody');
  });

  it('lists the sessions and closes another one after confirmation', async () => {
    const ctx = makeServices({});
    ctx.account.listSessions.mockResolvedValue([
      { id: 1, current: true, device: 'Chrome on macOS', createdAt: '2026-11-01T10:00:00.000Z', lastSeenAt: '2026-11-05T11:00:00.000Z' },
      { id: 2, current: false, device: 'Firefox on Linux', createdAt: '2026-10-01T10:00:00.000Z', lastSeenAt: '2026-11-04T09:30:00.000Z' },
    ]);
    const { user } = open('privacy', ctx);
    const list = await screen.findByRole('list', { name: 'Active sessions' });
    expect(within(list).getByText('Current session')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close session: Firefox on Linux' }));
    const dialog = ctx.store.getState().dialog;
    expect(dialog).toMatchObject({ kind: 'confirm', spec: { text: 'Session Firefox on Linux will be closed' } });
    if (dialog?.kind === 'confirm') dialog.spec.onConfirm();
    expect(ctx.account.closeSession).toHaveBeenCalledWith({ sessionId: 2 });
  });

  it('closes all other sessions', async () => {
    const ctx = makeServices({});
    ctx.account.listSessions.mockResolvedValue([
      { id: 1, current: true, device: 'Chrome on macOS', createdAt: '2026-11-01T10:00:00.000Z', lastSeenAt: '2026-11-05T11:00:00.000Z' },
      { id: 3, current: false, device: 'Safari on iOS', createdAt: '2026-10-01T10:00:00.000Z', lastSeenAt: '2026-11-04T09:30:00.000Z' },
    ]);
    const { user } = open('privacy', ctx);
    await user.click(await screen.findByRole('button', { name: 'Close all other sessions' }));
    const dialog = ctx.store.getState().dialog;
    expect(dialog).toMatchObject({ spec: { text: 'All sessions except the current one will be closed' } });
    if (dialog?.kind === 'confirm') dialog.spec.onConfirm();
    expect(ctx.account.closeSession).toHaveBeenCalledWith({ others: true });
  });

  it('shows blocked users as the ignore list and unblocks after confirmation', async () => {
    const ctx = makeServices({ users: [makeUser(2000, 'Boris', { blocked: true }), makeUser(2001, 'Vera')] });
    const { user } = open('privacy', ctx);
    const list = screen.getByRole('list', { name: 'Ignore list' });
    expect(within(list).getByText('Boris')).toBeInTheDocument();
    expect(within(list).queryByText('Vera')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Unblock: Boris' }));
    const dialog = ctx.store.getState().dialog;
    expect(dialog).toMatchObject({ spec: { text: 'Are you sure you want to delete user from ignore list?' } });
    if (dialog?.kind === 'confirm') dialog.spec.onConfirm();
    expect(ctx.chats.block).toHaveBeenCalledWith(2000, false);
  });

  it('says when nobody is ignored', () => {
    open('privacy');
    expect(screen.getByText('You have no ignored contacts')).toBeInTheDocument();
  });
});

describe('Settings: About app', () => {
  it('names the project and says it is not affiliated', () => {
    open('about');
    expect(screen.getByRole('heading', { name: 'About app' })).toBeInTheDocument();
    expect(screen.getByText(/Not affiliated with/)).toBeInTheDocument();
  });
});
