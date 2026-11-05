import { LIMITS, uinSchema, type Uin } from '@openicq/protocol';
import { useId, useState } from 'react';
import { useIcq, useServices } from '../../app/AppContext';
import type { SecurityTab } from '../../state/windows';
import { StatusIcon } from '../../ui/icons/StatusIcon';
import { WindowFrame } from '../../ui/WindowFrame';
import { displayName, windowTitle } from '../windowTitles';
import { PrefsFrame } from './PrefsFrame';

const PAGES = [
  { id: 'general', label: 'General' },
  { id: 'ignore', label: 'Ignore List' },
  { id: 'password', label: 'Change Password' },
] as const satisfies ReadonlyArray<{ id: SecurityTab; label: string }>;

export function validatePasswordChange(current: string, next: string, retype: string): string | null {
  if (current === '') return 'Enter your current password.';
  if (next.length < LIMITS.passwordMin) return `Invalid Password\nThe password must have at least ${LIMITS.passwordMin} characters.`;
  if (next !== retype) return 'Confirm password does not match !';
  return null;
}

/** "Security and Privacy Permissions (Ignore/Spam, harassment control) For: %s". */
export function SecurityWindow({ windowId, tab }: { windowId: string; tab: SecurityTab }) {
  const { store, commands } = useServices();
  const id = useId();
  const title = useIcq((s) => windowTitle({ kind: 'security', tab }, s));
  const settings = useIcq((s) => s.settings);
  const ignored = useIcq((s) => s.chat.ignored);
  // The whole state is a stable snapshot; deriving names here avoids a new object per store read.
  const appState = useIcq((s) => s);
  const [page, setPage] = useState<SecurityTab>(tab);
  const [authRequired, setAuthRequired] = useState(settings?.authRequired ?? false);
  const [webAware, setWebAware] = useState(settings?.webAware ?? false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [ignoreUin, setIgnoreUin] = useState('');
  const [selectedIgnored, setSelectedIgnored] = useState<Uin | null>(null);
  const [passwords, setPasswords] = useState({ current: '', next: '', retype: '' });
  const [passwordDone, setPasswordDone] = useState(false);
  const close = () => store.getState().closeWindow(windowId);

  const guard = (task: () => Promise<void>) => {
    setBusy(true);
    task()
      .then(() => setBusy(false))
      .catch((error: unknown) => {
        setBusy(false);
        store.getState().reportError(error, 'ICQ Security & Privacy');
      });
  };

  const save = (andClose: boolean) =>
    guard(async () => {
      setProblem(null);
      const pendingPassword = passwords.current !== '' || passwords.next !== '' || passwords.retype !== '';
      if (pendingPassword) {
        const message = validatePasswordChange(passwords.current, passwords.next, passwords.retype);
        if (message) {
          setPage('password');
          setProblem(message);
          return;
        }
        if (!(await commands.changePassword(passwords.current, passwords.next))) return;
        setPasswords({ current: '', next: '', retype: '' });
        setPasswordDone(true);
      }
      if (dirty) {
        if (!(await commands.updateSettings({ authRequired, webAware }))) return;
        setDirty(false);
      }
      if (andClose) close();
    });

  const addIgnore = () => {
    const parsed = uinSchema.safeParse(Number(ignoreUin.trim()));
    if (ignoreUin.trim() === '' || !parsed.success) {
      setProblem('This ICQ# does not exist');
      return;
    }
    if (parsed.data === store.getState().session?.uin) {
      setProblem("You can't add yourself to the Ignore List");
      return;
    }
    setProblem(null);
    guard(async () => {
      if (await commands.setIgnored(parsed.data, true)) setIgnoreUin('');
    });
  };

  const removeIgnore = () => {
    if (selectedIgnored === null) return;
    const uin = selectedIgnored;
    guard(async () => {
      if (await commands.setIgnored(uin, false)) setSelectedIgnored(null);
    });
  };

  const dirtyAny = dirty || passwords.current !== '' || passwords.next !== '';

  return (
    <WindowFrame windowId={windowId} title={title} icon={<StatusIcon status="logo" />} onClose={close} closeOnEscape className="prefs">
      <PrefsFrame
        pages={PAGES}
        current={page}
        onPage={(p) => {
          setProblem(null);
          setPage(p);
        }}
        busy={busy}
        dirty={dirtyAny}
        onOk={() => save(true)}
        onCancel={close}
        onApply={() => save(false)}
        problem={problem}
      >
        {page === 'general' ? (
          <>
            <fieldset>
              <legend>Contact List Authorization</legend>
              <div className="field-row">
                <input id={`${id}-all`} type="radio" name={`${id}-auth`} checked={!authRequired} onChange={() => { setAuthRequired(false); setDirty(true); }} />
                <label htmlFor={`${id}-all`}>All users may add me to their Contact List and see my Online / Offline status</label>
              </div>
              <div className="field-row">
                <input id={`${id}-req`} type="radio" name={`${id}-auth`} checked={authRequired} onChange={() => { setAuthRequired(true); setDirty(true); }} />
                <label htmlFor={`${id}-req`}>My authorization is required before users add me to their Contact List</label>
              </div>
            </fieldset>
            <fieldset>
              <legend>Web Aware</legend>
              <div className="field-row">
                <input id={`${id}-web`} type="checkbox" checked={webAware} onChange={(e) => { setWebAware(e.target.checked); setDirty(true); }} />
                <label htmlFor={`${id}-web`}>Allow others to view my Online / Offline status from the Web</label>
              </div>
            </fieldset>
          </>
        ) : null}
        {page === 'ignore' ? (
          <>
            <p className="dialog-text">
              Add users to your ignore list. Once a user is on your Ignore List, any attempt he or she makes to contact you should be
              completely ignored without you being aware of it, and without providing the sender with any indication that he or she is on
              your Ignore List.
            </p>
            <ul className="sunken-list prefs__ignore" role="listbox" aria-label="Ignore List">
              {ignored.map((uin) => (
                <li key={uin} role="option" aria-selected={uin === selectedIgnored} className={uin === selectedIgnored ? 'is-selected' : undefined} onClick={() => setSelectedIgnored(uin)}>
                  {`${displayName(appState, uin)} (${uin})`}
                </li>
              ))}
            </ul>
            <div className="dialog-buttons">
              <input type="text" inputMode="numeric" aria-label="ICQ# to ignore" placeholder="ICQ#" maxLength={10} value={ignoreUin} onChange={(e) => setIgnoreUin(e.target.value)} />
              <button type="button" disabled={busy} onClick={addIgnore}>
                Add To Ignore List
              </button>
              <span className="dialog-spacer" />
              <button type="button" disabled={busy || selectedIgnored === null} onClick={removeIgnore}>
                Remove From Ignore List
              </button>
            </div>
          </>
        ) : null}
        {page === 'password' ? (
          <fieldset>
            <legend>Change Password</legend>
            <p className="dialog-text">
              It is very important to remember your password! Your ICQ# may not be operable without a password. We recommend writing down
              your password and putting it in a secure place.
            </p>
            <div className="field-grid prefs__password">
              <label htmlFor={`${id}-cur`}>Current Password:</label>
              <input id={`${id}-cur`} type="password" autoComplete="current-password" maxLength={LIMITS.passwordMax} value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} />
              <label htmlFor={`${id}-new`}>Type your New Password:</label>
              <input id={`${id}-new`} type="password" autoComplete="new-password" maxLength={LIMITS.passwordMax} value={passwords.next} onChange={(e) => setPasswords({ ...passwords, next: e.target.value })} />
              <label htmlFor={`${id}-re`}>Retype New Password:</label>
              <input id={`${id}-re`} type="password" autoComplete="new-password" maxLength={LIMITS.passwordMax} value={passwords.retype} onChange={(e) => setPasswords({ ...passwords, retype: e.target.value })} />
            </div>
            {passwordDone ? <p className="dialog-text">Password changed.</p> : null}
          </fieldset>
        ) : null}
      </PrefsFrame>
    </WindowFrame>
  );
}
