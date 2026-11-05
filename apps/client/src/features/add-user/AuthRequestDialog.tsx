import { LIMITS, type Uin } from '@openicq/protocol';
import { useEffect, useState } from 'react';
import { useIcq, useServices } from '../../app/AppContext';
import { findContact } from '../../state/chat';
import { StatusIcon } from '../../ui/icons/StatusIcon';
import { WindowFrame } from '../../ui/WindowFrame';
import { STRINGS } from '../strings';
import { windowTitle } from '../windowTitles';
import './AddUser.css';

const NEEDS_AUTH = "Can't add user to your Contact List. The user must first authorize your request \n \n Enter request reason:";
const REQUEST_SENT = "Request sent for user's authorization to add him/her to your\nContact List.\nYou will be notified of authorization.";

export function defaultAuthReason(nickname: string, uin: Uin): string {
  return `Please authorize my request and add me to your Contact List. ${nickname} ICQ#${uin}`;
}

type Phase = 'checking' | 'edit' | 'busy' | 'done';

export interface AuthRequestDialogProps {
  windowId: string;
  uin: Uin;
  nickname: string;
  mode: 'add' | 'request';
  authRequired?: boolean | undefined;
}

/**
 * "Add User to Contact List" (icqaddus.dll dialog 110 with page 102), and
 * "Resend Request For Authorization From User" (dialog 134) for mode request.
 */
export function AuthRequestDialog({ windowId, uin, nickname, mode, authRequired }: AuthRequestDialogProps) {
  const { store, commands } = useServices();
  const title = useIcq((s) => windowTitle({ kind: 'authRequest', uin, nickname, mode }, s));
  const self = useIcq((s) => s.self);
  const alreadyInList = useIcq((s) => findContact(s.chat, uin) !== undefined);
  const [needsAuth, setNeedsAuth] = useState<boolean | null>(mode === 'request' ? true : (authRequired ?? null));
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState(nickname);
  const [reason, setReason] = useState(() => defaultAuthReason(self?.nickname ?? '', self?.uin ?? 0));
  const [phase, setPhase] = useState<Phase>(needsAuth === null ? 'checking' : 'edit');
  const [result, setResult] = useState('');
  const close = () => store.getState().closeWindow(windowId);

  useEffect(() => {
    let alive = true;
    commands
      .getProfile(uin)
      .then((profile) => {
        if (!alive) return;
        if (!profile) {
          setPhase((p) => (p === 'checking' ? 'edit' : p));
          setNeedsAuth((n) => n ?? false);
          return;
        }
        setEmail(profile.email);
        setDisplayName((current) => (current === String(uin) && profile.nickname ? profile.nickname : current));
        setNeedsAuth((n) => (mode === 'request' ? true : (n ?? profile.authRequired)));
        setPhase((p) => (p === 'checking' ? 'edit' : p));
      })
      .catch((error: unknown) => store.getState().reportError(error, title));
    return () => {
      alive = false;
    };
  }, [commands, store, uin, mode, title]);

  const submit = async () => {
    setPhase('busy');
    if (mode === 'request') {
      const ok = await commands.requestAuth(uin, reason);
      setPhase(ok ? 'done' : 'edit');
      if (ok) setResult(REQUEST_SENT);
      return;
    }
    const name = displayName.trim();
    const ok = await commands.addContact(uin, name === '' ? undefined : name.slice(0, LIMITS.nickname), needsAuth ? reason : '');
    setPhase(ok ? 'done' : 'edit');
    if (ok) setResult(needsAuth ? REQUEST_SENT : STRINGS.addedToList(name || nickname));
  };

  const next = () => {
    submit().catch((error: unknown) => {
      setPhase('edit');
      store.getState().reportError(error, title);
    });
  };

  return (
    <WindowFrame windowId={windowId} title={title} icon={<StatusIcon status="logo" />} onClose={close} closeOnEscape className="auth-request">
      <div className="auth-request__who">
        <label>
          <span>ICQ#:</span>
          <input type="text" readOnly value={String(uin)} />
        </label>
        <label>
          <span>Display Name:</span>
          <input
            type="text"
            value={displayName}
            maxLength={LIMITS.nickname}
            readOnly={mode === 'request' || phase !== 'edit'}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label>
          <span>Email:</span>
          <input type="text" readOnly value={email} />
        </label>
      </div>
      <div className="auth-request__body">
        {phase === 'checking' ? <p className="dialog-text">{STRINGS.fetchingUser}</p> : null}
        {alreadyInList && mode === 'add' && phase !== 'done' ? <p className="dialog-text">User is already in your Contact List</p> : null}
        {(phase === 'edit' || phase === 'busy') && needsAuth ? (
          <>
            <p className="dialog-text">{NEEDS_AUTH}</p>
            <textarea
              className="dialog-textarea auth-request__reason"
              aria-label="Request reason"
              value={reason}
              maxLength={LIMITS.reason}
              rows={6}
              disabled={phase === 'busy'}
              onChange={(e) => setReason(e.target.value)}
            />
          </>
        ) : null}
        {(phase === 'edit' || phase === 'busy') && needsAuth === false ? (
          <p className="dialog-text">{"Click 'Next' to add the user to your Contact List."}</p>
        ) : null}
        {phase === 'done' ? <p className="dialog-text auth-request__result">{result}</p> : null}
      </div>
      <div className="dialog-buttons dialog-buttons--split">
        <button type="button" onClick={close}>
          Close
        </button>
        <span className="dialog-spacer" />
        {phase === 'done' ? (
          <button type="button" className="default" autoFocus onClick={close}>
            Done
          </button>
        ) : (
          <button
            type="button"
            className="default"
            disabled={phase !== 'edit' || (mode === 'add' && alreadyInList)}
            onClick={next}
          >
            {mode === 'request' ? 'Request' : 'Next >>'}
          </button>
        )}
      </div>
    </WindowFrame>
  );
}
