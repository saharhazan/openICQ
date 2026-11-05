import { hasStatusMessage, type StatusMessageStatus, type Uin } from '@openicq/protocol';
import { useEffect, useState } from 'react';
import { useIcq, useServices } from '../../app/AppContext';
import { StatusIcon } from '../../ui/icons/StatusIcon';
import { WindowFrame } from '../../ui/WindowFrame';
import { READ_AWAY_DIALOG, STRINGS } from '../strings';
import { displayName, windowTitle } from '../windowTitles';
import './Away.css';

type AwayReply = { status: StatusMessageStatus; text: string } | { status: 'none' };

/** "Read Away-message": fetches the contact's current auto-response text with away.get. */
export function ReadAwayDialog({ windowId, uin }: { windowId: string; uin: Uin }) {
  const { store, commands } = useServices();
  const title = useIcq((s) => windowTitle({ kind: 'readAway', uin }, s));
  const nick = useIcq((s) => displayName(s, uin));
  const [reply, setReply] = useState<AwayReply | null>(null);
  const [failed, setFailed] = useState(false);
  const close = () => store.getState().closeWindow(windowId);

  useEffect(() => {
    let alive = true;
    commands
      .getAwayMessage(uin)
      .then((result) => {
        if (!alive) return;
        if (!result) {
          setFailed(true);
          return;
        }
        const status = result.status;
        setReply(hasStatusMessage(status) ? { status, text: result.text } : { status: 'none' });
      })
      .catch((error: unknown) => {
        if (alive) setFailed(true);
        store.getState().reportError(error, title);
      });
    return () => {
      alive = false;
    };
  }, [commands, store, uin, title]);

  const copy = reply && reply.status !== 'none' ? READ_AWAY_DIALOG[reply.status] : null;
  return (
    <WindowFrame
      windowId={windowId}
      title={title}
      icon={<StatusIcon status={reply && reply.status !== 'none' ? reply.status : 'away'} />}
      onClose={close}
      closeOnEscape
      className="read-away"
    >
      {reply === null && !failed ? <p className="dialog-text">{STRINGS.retrievingAway}</p> : null}
      {failed ? <p className="dialog-text">{"Can't respond to request"}</p> : null}
      {reply?.status === 'none' ? <p className="dialog-text">{`${nick} is not in an away mode.`}</p> : null}
      {copy && reply && reply.status !== 'none' ? (
        <>
          <p className="read-away__heading">{copy.heading(nick)}</p>
          <label className="read-away__label">{copy.label}</label>
          <textarea className="dialog-textarea read-away__text" readOnly value={reply.text} rows={5} aria-label={copy.label} />
        </>
      ) : null}
      <div className="dialog-buttons dialog-buttons--end">
        <button type="button" className="default" autoFocus onClick={close}>
          Close
        </button>
      </div>
    </WindowFrame>
  );
}
