/**
 * The sign-in page (LoginPage.cpp, "Sign in by password"), our sign-up
 * without SMS, and the screen that shows the new ICQ number.
 */
import { useState, type FormEvent } from 'react';
import { useApp, useServices } from '../../app/AppContext';
import { S } from '../../strings';
import { Button } from '../../ui/Dialog';
import { TextField } from '../../ui/controls';
import { checkNicknameRules } from '../profile/nickname';
import { validateSignIn, validateSignUp, type SignUpErrors, type SignUpFields } from './authForms';
import './auth.css';

type Screen = { kind: 'signIn' } | { kind: 'signUp' } | { kind: 'registered'; uin: number };

/** Asks for web notification permission right after a sign-in click, while the gesture still counts. */
function useAskNotifications() {
  const { notifier, store } = useServices();
  const wanted = useApp((s) => s.prefs.showNotifications);
  return () => {
    if (!wanted || notifier.permission() !== 'default') return;
    notifier.requestPermission().catch((error: unknown) => store.getState().reportError(error));
  };
}

function SignInForm({ onSignUp }: { onSignUp: () => void }) {
  const { session } = useServices();
  const askNotifications = useAskNotifications();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [error, setError] = useState<{ field: 'login' | 'password' | 'form'; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const checked = validateSignIn({ login, password, keepSignedIn });
    if (!checked.ok) {
      setError({ field: checked.field, message: checked.message });
      return;
    }
    setError(null);
    setBusy(true);
    const result = await session.signIn(checked.body);
    setBusy(false);
    if (result.ok) askNotifications();
    else setError({ field: 'form', message: result.error });
  };

  return (
    <form className="auth-form" noValidate onSubmit={(event) => void submit(event)} aria-labelledby="auth-title">
      <h1 id="auth-title" className="auth-title">
        {S.login.signInByPassword}
      </h1>
      <p className="auth-hint">{S.login.hint}</p>
      <TextField
        label={S.login.login}
        value={login}
        onChange={setLogin}
        autoFocus
        autoComplete="username"
        name="login"
        error={error?.field === 'login' ? error.message : null}
      />
      <TextField
        label={S.login.password}
        value={password}
        onChange={setPassword}
        type="password"
        autoComplete="current-password"
        name="password"
        error={error?.field === 'password' ? error.message : null}
      />
      <label className="auth-check">
        <input type="checkbox" checked={keepSignedIn} onChange={(event) => setKeepSignedIn(event.target.checked)} />
        <span className="auth-check-box" aria-hidden="true" />
        <span>{S.login.keepSignedIn}</span>
      </label>
      {error?.field === 'form' && (
        <p className="error-text auth-error" role="alert">
          {error.message}
        </p>
      )}
      <Button type="submit" wide disabled={busy}>
        {S.login.signIn}
      </Button>
      <button type="button" className="text-button auth-switch" onClick={onSignUp}>
        {S.login.signUp}
      </button>
    </form>
  );
}

const EMPTY_SIGN_UP: SignUpFields = { firstName: '', lastName: '', nickname: '', email: '', password: '' };

function SignUpForm({ onSignIn, onRegistered }: { onSignIn: () => void; onRegistered: (uin: number) => void }) {
  const { session } = useServices();
  const [fields, setFields] = useState<SignUpFields>(EMPTY_SIGN_UP);
  const [errors, setErrors] = useState<SignUpErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (field: keyof SignUpFields) => (value: string) => {
    setFields((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] === undefined ? current : { ...current, [field]: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const checked = validateSignUp(fields);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    setFormError(null);
    setBusy(true);
    const result = await session.signUp(checked.body);
    setBusy(false);
    if (result.ok) {
      onRegistered(result.uin);
      return;
    }
    if (checked.body.nickname && result.code === 'conflict') setErrors({ nickname: S.profile.taken });
    else setFormError(result.error);
  };

  // Nickname rules are shown live; the server check needs a session and runs on submit.
  const rule = fields.nickname.trim() === '' ? null : checkNicknameRules(fields.nickname);
  const nicknameError = errors.nickname ?? (rule && !rule.ok ? rule.message : null);

  return (
    <form className="auth-form" noValidate onSubmit={(event) => void submit(event)} aria-labelledby="auth-title">
      <h1 id="auth-title" className="auth-title">
        {S.login.createAccount}
      </h1>
      <p className="auth-hint">{S.login.signUpHint}</p>
      <TextField label={S.profile.firstName} value={fields.firstName} onChange={set('firstName')} autoFocus autoComplete="given-name" error={errors.firstName} />
      <TextField label={S.profile.lastName} value={fields.lastName} onChange={set('lastName')} autoComplete="family-name" error={errors.lastName} />
      <TextField
        label={S.login.nicknameOptional}
        value={fields.nickname}
        onChange={(value) => set('nickname')(value.toLowerCase())}
        autoComplete="off"
        error={nicknameError}
      />
      <TextField label={S.login.emailOptional} value={fields.email} onChange={set('email')} type="email" autoComplete="email" error={errors.email} />
      <TextField label={S.login.password} value={fields.password} onChange={set('password')} type="password" autoComplete="new-password" error={errors.password} />
      {formError && (
        <p className="error-text auth-error" role="alert">
          {formError}
        </p>
      )}
      <Button type="submit" wide disabled={busy}>
        {S.login.signUp}
      </Button>
      <button type="button" className="text-button auth-switch" onClick={onSignIn}>
        {S.login.haveAccount}
      </button>
    </form>
  );
}

function Registered({ uin }: { uin: number }) {
  const { session } = useServices();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enter = async () => {
    setBusy(true);
    setError(null);
    const result = await session.enterAfterSignUp();
    setBusy(false);
    if (!result.ok) setError(result.error);
  };
  return (
    <section className="auth-form" aria-labelledby="auth-title">
      <h1 id="auth-title" className="auth-title">
        {S.login.yourNumber}
      </h1>
      <p className="auth-number" aria-label={`${S.profile.icqNumber} ${uin}`}>
        {uin}
      </p>
      <p className="auth-hint">{S.login.yourNumberHint}</p>
      {error && (
        <p className="error-text auth-error" role="alert">
          {error}
        </p>
      )}
      <Button wide autoFocus disabled={busy} onClick={() => void enter()}>
        {S.introduce.continue}
      </Button>
    </section>
  );
}

export function AuthScreen() {
  const [screen, setScreen] = useState<Screen>({ kind: 'signIn' });
  return (
    <div className="auth-screen">
      <div className="auth-brand" aria-hidden="true">
        {S.appName}
      </div>
      {screen.kind === 'signIn' && <SignInForm onSignUp={() => setScreen({ kind: 'signUp' })} />}
      {screen.kind === 'signUp' && (
        <SignUpForm onSignIn={() => setScreen({ kind: 'signIn' })} onRegistered={(uin) => setScreen({ kind: 'registered', uin })} />
      )}
      {screen.kind === 'registered' && <Registered uin={screen.uin} />}
    </div>
  );
}
