import { isAwayStatus, type Status, type Uin } from '@openicq/protocol';
import { useIcq, useServices } from '../../app/AppContext';
import { StatusIcon } from '../../ui/icons/StatusIcon';
import { WindowFrame } from '../../ui/WindowFrame';
import { AUTO_RESPONSE_NOTICE, READ_AWAY_DIALOG } from '../strings';
import { windowTitle } from '../windowTitles';
import '../away/Away.css';
import './MessageDialog.css';

/** "User %s Is Away": the auto-response that came back from message.send. */
export function AutoResponseDialog({ windowId, uin, status, text }: { windowId: string; uin: Uin; status: Status; text: string }) {
  const { store } = useServices();
  const title = useIcq((s) => windowTitle({ kind: 'autoResponse', uin, status, text }, s));
  const close = () => store.getState().closeWindow(windowId);
  const away = isAwayStatus(status) ? status : null;
  return (
    <WindowFrame windowId={windowId} title={title} icon={<StatusIcon status={status} />} onClose={close} closeOnEscape minimizable={false} className="auto-response">
      {away ? <p className="dialog-text">{AUTO_RESPONSE_NOTICE[away]}</p> : null}
      <label className="read-away__label">{away ? READ_AWAY_DIALOG[away].label : 'Message:'}</label>
      <textarea className="dialog-textarea read-away__text" readOnly value={text} rows={5} aria-label="Auto-response" />
      <div className="dialog-buttons dialog-buttons--end">
        <button type="button" className="default" autoFocus onClick={close}>
          OK
        </button>
      </div>
    </WindowFrame>
  );
}
