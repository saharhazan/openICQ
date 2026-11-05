import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { chat } from '../../../tests/fixtures';
import { makeServices, renderWithServices } from '../../../tests/renderWithServices';
import { SettingsList } from './SettingsList';

describe('SettingsList', () => {
  it('lists my profile and the pages in the original order', () => {
    const ctx = makeServices({});
    renderWithServices(<SettingsList mini={false} />, ctx.services);
    const [profile, ...pages] = screen.getAllByRole('button');
    expect(profile).toHaveTextContent('Sahar H');
    expect(profile).toHaveAccessibleDescription('My profile');
    expect(pages.map((b) => b.textContent)).toEqual(['Favorites', 'General', 'Notifications', 'Privacy', 'Appearance', 'Shortcuts', 'About app']);
  });

  it('opens a page and marks it current', async () => {
    const ctx = makeServices({});
    const user = userEvent.setup();
    ctx.store.getState().patch({ tab: 'settings' });
    renderWithServices(<SettingsList mini={false} />, ctx.services);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(ctx.store.getState().settingsPage).toBe('notifications');
    expect(screen.getByRole('button', { name: 'Notifications' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'General' })).not.toHaveAttribute('aria-current');
  });

  it('opens the Favorites chat on the Chats tab', async () => {
    const ctx = makeServices({ chats: [chat(5, { type: 'favorites', pinned: true }), chat(6, { peer: 2000 })] });
    const user = userEvent.setup();
    ctx.store.getState().patch({ tab: 'settings', settingsPage: 'general' });
    renderWithServices(<SettingsList mini={false} />, ctx.services);
    await user.click(screen.getByRole('button', { name: 'Favorites' }));
    expect(ctx.store.getState().selectedChatId).toBe(5);
    expect(ctx.store.getState().tab).toBe('chats');
    expect(ctx.store.getState().settingsPage).toBeNull();
  });

  it('keeps every row named in mini mode, where only tiles show', () => {
    const ctx = makeServices({});
    renderWithServices(<SettingsList mini />, ctx.services);
    expect(screen.getByRole('button', { name: 'Privacy' })).toBeInTheDocument();
    expect(screen.queryByText('Privacy')).toBeNull();
  });
});
