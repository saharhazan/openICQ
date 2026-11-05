import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeServices, renderWithServices } from '../../../tests/renderWithServices';
import { AuthScreen } from './AuthScreen';

function setup() {
  const ctx = makeServices();
  const user = userEvent.setup();
  renderWithServices(<AuthScreen />, ctx.services);
  return { ...ctx, user };
}

describe('AuthScreen: sign in by password', () => {
  it('shows the original title, fields and the kept session default', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Sign in by password' })).toBeInTheDocument();
    expect(screen.getByText('Enter your login and password')).toBeInTheDocument();
    expect(screen.getByLabelText('Login')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('checkbox', { name: 'Keep me signed in' })).toBeChecked();
  });

  it('does not send an empty form and says why', async () => {
    const { user, session } = setup();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(session.signIn).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your login and password');
    expect(screen.getByLabelText('Login')).toHaveAttribute('aria-invalid', 'true');
  });

  it('sends login, password and the keep flag', async () => {
    const { user, session } = setup();
    await user.type(screen.getByLabelText('Login'), ' 100001 ');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('checkbox', { name: 'Keep me signed in' }));
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(session.signIn).toHaveBeenCalledWith({ login: '100001', password: 'secret', keepSignedIn: false });
  });

  it('shows the server answer inline', async () => {
    const { user, session } = setup();
    session.signIn.mockResolvedValueOnce({ ok: false, error: 'Invalid login or password' });
    await user.type(screen.getByLabelText('Login'), 'me@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login or password');
  });

  it('asks for notification permission after a successful sign-in', async () => {
    const { user, notifier } = setup();
    notifier.permission.mockReturnValue('default');
    await user.type(screen.getByLabelText('Login'), '100001');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(notifier.requestPermission).toHaveBeenCalledTimes(1);
  });
});

describe('AuthScreen: sign up', () => {
  it('validates live and on submit without calling the server', async () => {
    const { user, session } = setup();
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    await user.type(screen.getByLabelText('Nickname (optional)'), '1ab');
    expect(screen.getByText('Nicknames must start with a letter of the roman alphabet (a-z)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(session.signUp).not.toHaveBeenCalled();
    expect(screen.getByText('First name is required')).toBeInTheDocument();
    expect(screen.getByText('Minimum length - 6 symbols')).toBeInTheDocument();
  });

  it('creates the account, shows the new ICQ number and continues', async () => {
    const { user, session } = setup();
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    await user.type(screen.getByLabelText('First name'), 'Anna');
    await user.type(screen.getByLabelText('Nickname (optional)'), 'Anna.K');
    await user.type(screen.getByLabelText('Password'), 'secret1');
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(session.signUp).toHaveBeenCalledWith({ firstName: 'Anna', lastName: '', nickname: 'anna.k', email: '', password: 'secret1' });
    expect(await screen.findByRole('heading', { name: 'Your ICQ number' })).toBeInTheDocument();
    expect(screen.getByText('100500')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(session.enterAfterSignUp).toHaveBeenCalledTimes(1);
  });

  it('puts a taken nickname under the nickname field', async () => {
    const { user, session } = setup();
    session.signUp.mockResolvedValueOnce({ ok: false, error: 'Nickname is already in use', code: 'conflict' });
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    await user.type(screen.getByLabelText('First name'), 'Anna');
    await user.type(screen.getByLabelText('Nickname (optional)'), 'annak');
    await user.type(screen.getByLabelText('Password'), 'secret1');
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(await screen.findByText('This nickname is taken')).toBeInTheDocument();
  });

  it('goes back to sign in', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    await user.click(screen.getByRole('button', { name: 'Sign in by password' }));
    expect(screen.getByRole('heading', { name: 'Sign in by password' })).toBeInTheDocument();
  });
});
