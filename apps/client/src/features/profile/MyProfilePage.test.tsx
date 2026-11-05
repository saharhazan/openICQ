import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { me } from '../../../tests/fixtures';
import { makeServices, renderWithServices } from '../../../tests/renderWithServices';
import { MyProfilePage } from './MyProfilePage';
import { NICKNAME_CHECK_DELAY_MS } from './NicknameField';

function setup(timers = false) {
  if (timers) vi.useFakeTimers({ shouldAdvanceTime: true });
  const ctx = makeServices({ me: me({ nickname: 'sahar', about: 'Hello' }) });
  const user = userEvent.setup(timers ? { advanceTimers: vi.advanceTimersByTime } : {});
  renderWithServices(<MyProfilePage />, ctx.services);
  return { ...ctx, user };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('MyProfilePage', () => {
  it('shows my profile fields', () => {
    setup();
    expect(screen.getByRole('button', { name: /^Nickname,\s*@sahar/ })).toBeInTheDocument();
    expect(screen.getByText('100001')).toBeInTheDocument();
    expect(screen.getByText('me@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change avatar' })).toBeInTheDocument();
  });

  it('applies the nickname rules at once, then checks the server and saves', async () => {
    const { user, account } = setup(true);
    await user.click(screen.getByRole('button', { name: /^Nickname,\s*@sahar/ }));
    const dialog = screen.getByRole('dialog', { name: 'Nickname' });
    expect(dialog).toBeInTheDocument();
    const field = screen.getByRole('textbox', { name: 'Nickname' });
    await user.clear(field);
    await user.type(field, '1abc');
    expect(screen.getByText('Nicknames must start with a letter of the roman alphabet (a-z)')).toBeInTheDocument();
    expect(account.checkNickname).not.toHaveBeenCalled();
    await user.clear(field);
    await user.type(field, 'Sahar.New');
    expect(screen.getByText('Checking...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NICKNAME_CHECK_DELAY_MS);
    });
    expect(account.checkNickname).toHaveBeenCalledWith('sahar.new');
    expect(await screen.findByText('Nickname available')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(account.updateProfile).toHaveBeenCalledWith({ nickname: 'sahar.new' });
  });

  it('shows a taken nickname and keeps Save off', async () => {
    const { user, account } = setup(true);
    account.checkNickname.mockResolvedValue('taken');
    await user.click(screen.getByRole('button', { name: /^Nickname,\s*@sahar/ }));
    const field = screen.getByRole('textbox', { name: 'Nickname' });
    await user.clear(field);
    await user.type(field, 'busyname');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NICKNAME_CHECK_DELAY_MS);
    });
    expect(await screen.findByText('This nickname is taken')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('removes the nickname when the field is emptied', async () => {
    const { user, account } = setup();
    await user.click(screen.getByRole('button', { name: /^Nickname,\s*@sahar/ }));
    await user.clear(screen.getByRole('textbox', { name: 'Nickname' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(account.updateProfile).toHaveBeenCalledWith({ nickname: null });
  });

  it('edits About me with the 120 character limit', async () => {
    const { user, account, store } = setup();
    await user.click(screen.getByRole('button', { name: /^About me,\s*Hello/ }));
    const field = screen.getByLabelText('About me');
    expect(field).toHaveAttribute('maxLength', '120');
    await user.clear(field);
    await user.type(field, 'Back soon');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(account.updateProfile).toHaveBeenCalledWith({ about: 'Back soon' });
    expect(store.getState().toasts.at(-1)?.text).toBe('Profile updated');
  });

  it('says when the current password is wrong', async () => {
    const { user, account } = setup();
    account.changePassword.mockResolvedValueOnce('wrong');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    await user.type(screen.getByLabelText('Current password'), 'old');
    await user.type(screen.getByLabelText('New password'), 'newsecret');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(account.changePassword).toHaveBeenCalledWith('old', 'newsecret');
    expect(await screen.findByText('Wrong password')).toBeInTheDocument();
  });

  it('signs out after the confirmation', async () => {
    const { user, store, session } = setup();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    const dialog = store.getState().dialog;
    expect(dialog).toMatchObject({ kind: 'confirm', spec: { text: 'Are you sure you want to sign out?' } });
    if (dialog?.kind === 'confirm') dialog.spec.onConfirm();
    expect(session.signOut).toHaveBeenCalledTimes(1);
  });
});
