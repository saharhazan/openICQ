import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { me } from '../../../tests/fixtures';
import { makeServices, renderWithServices } from '../../../tests/renderWithServices';
import { IntroduceYourself } from './IntroduceYourself';

describe('IntroduceYourself', () => {
  it('requires a first name before continuing', async () => {
    const ctx = makeServices({ me: me({ firstName: '', lastName: '' }) });
    const user = userEvent.setup();
    renderWithServices(<IntroduceYourself />, ctx.services);
    expect(screen.getByRole('heading', { name: 'Add a name and avatar' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert')).toHaveTextContent('First name is required');
    expect(ctx.account.updateProfile).not.toHaveBeenCalled();
    expect(ctx.session.finishIntroduce).not.toHaveBeenCalled();
  });

  it('saves the name, then opens the main window', async () => {
    const ctx = makeServices({ me: me({ firstName: '', lastName: '' }) });
    const user = userEvent.setup();
    renderWithServices(<IntroduceYourself />, ctx.services);
    await user.type(screen.getByLabelText('First name*'), 'Anna');
    await user.type(screen.getByLabelText('Last name'), 'K');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(ctx.account.updateProfile).toHaveBeenCalledWith({ firstName: 'Anna', lastName: 'K' });
    expect(ctx.session.finishIntroduce).toHaveBeenCalledTimes(1);
  });

  it('prefills the name given at sign-up and skips an unchanged save', async () => {
    const ctx = makeServices({ me: me({ firstName: 'Anna', lastName: 'K' }) });
    const user = userEvent.setup();
    renderWithServices(<IntroduceYourself />, ctx.services);
    expect(screen.getByLabelText('First name*')).toHaveValue('Anna');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(ctx.account.updateProfile).not.toHaveBeenCalled();
    expect(ctx.session.finishIntroduce).toHaveBeenCalledTimes(1);
  });

  it('uploads a picked avatar and saves it on the profile', async () => {
    const ctx = makeServices({ me: me({ firstName: '' }) });
    ctx.account.uploadAvatar.mockResolvedValueOnce({ fileId: 77, name: 'a.png', mime: 'image/png', size: 10, kind: 'image', width: 400, height: 400 });
    const user = userEvent.setup();
    renderWithServices(<IntroduceYourself />, ctx.services);
    const file = new File(['png'], 'a.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Upload photo'), file);
    expect(ctx.account.uploadAvatar).toHaveBeenCalledWith(file);
    expect(ctx.account.updateProfile).toHaveBeenCalledWith({ avatarFileId: 77 });
  });
});
