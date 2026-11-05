import { useIcq, useServices } from '../../app/AppContext';
import { StatusIcon } from '../../ui/icons/StatusIcon';
import { MessageBox } from '../../ui/MessageBox';
import { WindowFrame } from '../../ui/WindowFrame';
import { STRINGS } from '../strings';
import './SystemDialogs.css';

/** Every failure ends here: an ICQ-style error box that stays until the user closes it. */
export function ErrorDialog({ windowId, errorId }: { windowId: string; errorId: number }) {
  const { store } = useServices();
  const entry = useIcq((s) => s.errors.find((e) => e.id === errorId));
  const close = () => store.getState().dismissError(errorId);
  return (
    <MessageBox
      windowId={windowId}
      title={entry?.title ?? STRINGS.appName}
      icon={entry?.code === 'rate_limited' || entry?.code === 'not_connected' ? 'warning' : 'error'}
      buttons={[{ label: 'OK', onClick: close, isDefault: true }]}
      onClose={close}
    >
      {entry?.message ?? 'Unknown error'}
    </MessageBox>
  );
}

/** Same ICQ# signed in elsewhere: the connection is gone and no reconnect happens. */
export function KickedDialog({ windowId }: { windowId: string }) {
  const { store } = useServices();
  const close = () => store.getState().closeWindow(windowId);
  return (
    <MessageBox
      windowId={windowId}
      title={STRINGS.networkError}
      icon="error"
      buttons={[{ label: 'OK', onClick: close, isDefault: true }]}
      onClose={close}
    >
      {'Your ICQ# is being used on another computer'}
    </MessageBox>
  );
}

export function ConfirmShutDownDialog({ windowId }: { windowId: string }) {
  const { store, session, desktop } = useServices();
  const close = () => store.getState().closeWindow(windowId);
  const shutDown = () => {
    close();
    // The desktop app exits like the original; a saved password still signs in next time.
    if (desktop) {
      desktop.bridge.quit();
      return;
    }
    session.signOut().catch((error: unknown) => store.getState().reportError(error, STRINGS.shutDown));
  };
  return (
    <MessageBox
      windowId={windowId}
      title={STRINGS.confirmShutDownTitle}
      icon="question"
      buttons={[
        { label: 'Yes', onClick: shutDown, isDefault: true },
        { label: 'No', onClick: close },
      ]}
      onClose={close}
    >
      {STRINGS.confirmShutDownText}
    </MessageBox>
  );
}

/** "About ICQ" (dialog 2001), with the facts of this rebuild instead of the 2001 legal text. */
export function AboutDialog({ windowId }: { windowId: string }) {
  const { store } = useServices();
  const close = () => store.getState().closeWindow(windowId);
  return (
    <WindowFrame
      windowId={windowId}
      title={`About ${STRINGS.appName}`}
      onClose={close}
      minimizable={false}
      closeOnEscape
      className="about-dialog"
    >
      <div className="about-dialog__top">
        <div className="about-dialog__logo">
          <StatusIcon status="logo" size={64} />
        </div>
        <div className="about-dialog__facts">
          <p>{STRINGS.appName} Version 1.0</p>
          <p>An open-source rebuild of ICQ 2001b</p>
          <p>A tribute to the original messenger. ICQ, the ICQ logo and the flower device are trademarks of their respective owner.</p>
          <p>Icons and sounds are redrawn and synthesized; no original artwork is used.</p>
        </div>
        <button type="button" className="default" autoFocus onClick={close}>
          OK
        </button>
      </div>
    </WindowFrame>
  );
}
