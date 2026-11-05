import { LIMITS } from '@openicq/protocol';
import { useState, type FormEvent } from 'react';
import { useServices } from '../../app/AppContext';
import { ComboBox } from '../../ui/ComboBox';
import { StatusIcon } from '../../ui/icons/StatusIcon';
import { WindowFrame } from '../../ui/WindowFrame';
import { LOGIN_TITLE } from '../windowTitles';
import { validateLogin } from './loginForm';
import './LoginWindow.css';

const WRONG_PASSWORD = 'Password does not match. Try again:';

/** "Connect to The ICQ Network" (dialog 1007): ICQ#, password, Save password. */
export function LoginWindow({ windowId }: { windowId: string }) {
  const { store, session, prefs } = useServices();
  const [recent] = useState(() => prefs.recentUins().map(String));
  const [uin, setUin] = useState(() => recent[0] ?? '');
  const [password, setPassword] = useState('');
  const [savePassword, setSavePassword] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);
  const [busy, setBusy] = useState(false);

  const close = () => store.getState().closeWindow(windowId);
  const newUser = () => {
    const state = store.getState();
    state.closeWindow(windowId);
    state.openWindow({ kind: 'register' });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const check = validateLogin({ uin, password, savePassword });
    if (!check.ok) {
      setProblem(check.message);
      return;
    }
    setProblem(null);
    setBusy(true);
    const outcome = await session.login(check.body);
    // On success the window is already closed; only a rejected attempt stays here.
    if (outcome === 'rejected') {
      setRejected(true);
      setPassword('');
    }
    if (outcome === 'rejected' || outcome === 'failed') setBusy(false);
  };

  return (
    <WindowFrame windowId={windowId} title={LOGIN_TITLE} icon={<StatusIcon status="logo" />} onClose={close} closeOnEscape className="login-window">
      <form
        className="login-window__form"
        onSubmit={(e) => {
          submit(e).catch((error: unknown) => {
            setBusy(false);
            store.getState().reportError(error, 'ICQ Login');
          });
        }}
        noValidate
      >
        <p className="login-window__header" aria-live="polite">
          {rejected ? WRONG_PASSWORD : ''}
        </p>
        <div className="login-window__row">
          <label htmlFor={`${windowId}-uin`}>User:</label>
          <ComboBox
            id={`${windowId}-uin`}
            ariaLabel="ICQ#"
            value={uin}
            options={recent}
            onChange={setUin}
            inputMode="numeric"
            maxLength={10}
            autoFocus={uin === ''}
            disabled={busy}
          />
        </div>
        <div className="login-window__row">
          <label htmlFor={`${windowId}-password`}>Password:</label>
          <input
            id={`${windowId}-password`}
            type="password"
            value={password}
            maxLength={LIMITS.passwordMax}
            autoFocus={uin !== ''}
            autoComplete="current-password"
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="login-window__row login-window__row--check">
          <span />
          <span>
            <input
              id={`${windowId}-save`}
              type="checkbox"
              checked={savePassword}
              disabled={busy}
              onChange={(e) => setSavePassword(e.target.checked)}
            />
            <label htmlFor={`${windowId}-save`}>Save password</label>
          </span>
        </div>
        {problem ? (
          <p className="dialog-error" role="alert">
            {problem}
          </p>
        ) : null}
        <div className="login-window__rule" />
        <div className="login-window__buttons">
          <button type="button" onClick={newUser} disabled={busy}>
            Register A New User
          </button>
          <span className="dialog-spacer" />
          <button type="button" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="default" disabled={busy}>
            {busy ? 'Connecting...' : 'OK'}
          </button>
        </div>
      </form>
    </WindowFrame>
  );
}
