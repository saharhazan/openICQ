import { LIMITS, type SystemNotice } from '@openicq/protocol';
import { useState } from 'react';
import { useIcq, useServices } from '../../app/AppContext';
import { findContact } from '../../state/chat';
import { NoticeIcon } from '../../ui/icons/NoticeIcon';
import { PopupMenu, type MenuAnchor } from '../../ui/PopupMenu';
import { WindowFrame } from '../../ui/WindowFrame';
import { NOTICE_TITLE, STRINGS } from '../strings';
import './NoticeWindow.css';

const TEXT = {
  request: 'This user has requested your authorization to add you to his/her Contact List.',
  granted: 'The user has accepted your request to add him/her to your Contact List.',
  deniedNoReason: 'The user has declined your request to add him/her to your Contact List.\nNo reason was given.',
  deniedWithReason: 'The user has declined your request to add him/her to your Contact List.\nThe following reason was given:\n',
  addedYou: 'The user added you to his/her Contact List.',
  ignoreConfirm: 'User will receive no response to his/her Authorization request. Are you sure you wish to ignore his/her request?',
} as const;

type Mode = 'view' | 'decline' | 'ignore' | 'granted';

function NoticeHeader({ notice }: { notice: SystemNotice }) {
  const date = new Date(notice.createdAt);
  return (
    <fieldset className="notice__from">
      <legend>From</legend>
      <div className="notice__from-grid">
        <span>Nick Name:</span>
        <input type="text" readOnly value={notice.fromNickname} aria-label="Nick Name" />
        <span>ICQ # :</span>
        <input type="text" readOnly value={String(notice.from)} aria-label="ICQ #" />
        <span>Date:</span>
        <input type="text" readOnly value={date.toLocaleDateString('en-US')} aria-label="Date" />
        <span>Time:</span>
        <input type="text" readOnly value={date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} aria-label="Time" />
      </div>
    </fieldset>
  );
}

/** One System Notice: authorization request, accepted, denied, or "You Were Added". */
export function NoticeWindow({ windowId, noticeId }: { windowId: string; noticeId: number }) {
  const { store, commands } = useServices();
  const notice = useIcq((s) => s.chat.notices.find((n) => n.id === noticeId) ?? null);
  const inList = useIcq((s) => (notice ? findContact(s.chat, notice.from) !== undefined : false));
  const [mode, setMode] = useState<Mode>('view');
  const [reason, setReason] = useState('');
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const [busy, setBusy] = useState(false);
  const [granted, setGranted] = useState<SystemNotice | null>(null);
  const close = () => store.getState().closeWindow(windowId);
  const shown = notice ?? granted;
  if (!shown) return null;

  const act = (task: () => Promise<boolean>, after: () => void) => {
    setBusy(true);
    task()
      .then((ok) => {
        setBusy(false);
        if (ok) after();
      })
      .catch((error: unknown) => {
        setBusy(false);
        store.getState().reportError(error, 'System Notice');
      });
  };
  const respond = (grant: boolean, why: string) =>
    act(
      () => commands.respondAuth(shown.id, grant, why),
      () => {
        if (grant && !inList) {
          setGranted(shown);
          setMode('granted');
        } else {
          close();
        }
      },
    );
  const dismiss = () => act(() => commands.dismissNotice(shown.id), close);
  const openAdd = () =>
    store.getState().openWindow({ kind: 'authRequest', uin: shown.from, nickname: shown.fromNickname || String(shown.from), mode: 'add' });
  const sendMessage = () => store.getState().openWindow({ kind: 'message', uin: shown.from });
  const ignore = () =>
    act(async () => (await commands.setIgnored(shown.from, true)) && commands.dismissNotice(shown.id), close);

  const body = () => {
    if (mode === 'granted') {
      return (
        <>
          <p className="dialog-text">{`Authorization granted to ${shown.fromNickname || shown.from}.`}</p>
          <div className="dialog-buttons dialog-buttons--end">
            {!inList ? (
              <button type="button" className="default" onClick={() => { openAdd(); close(); }}>
                Add To Contact List
              </button>
            ) : null}
            <button type="button" onClick={close}>
              Close
            </button>
          </div>
        </>
      );
    }
    if (mode === 'decline') {
      return (
        <>
          <p className="dialog-text">{STRINGS.declinePrompt}</p>
          <textarea className="dialog-textarea notice__text" value={reason} maxLength={LIMITS.reason} rows={3} autoFocus aria-label={STRINGS.declineTitle} onChange={(e) => setReason(e.target.value)} />
          <div className="dialog-buttons dialog-buttons--end">
            <button type="button" className="default" disabled={busy} onClick={() => respond(false, reason)}>
              Send
            </button>
            <button type="button" onClick={() => setMode('view')}>
              Cancel
            </button>
          </div>
        </>
      );
    }
    if (mode === 'ignore') {
      return (
        <>
          <p className="dialog-text">{TEXT.ignoreConfirm}</p>
          <div className="dialog-buttons dialog-buttons--end">
            <button type="button" className="default" disabled={busy} onClick={dismiss}>
              Yes
            </button>
            <button type="button" onClick={() => setMode('view')}>
              No
            </button>
          </div>
        </>
      );
    }
    switch (shown.kind) {
      case 'auth_request':
        return (
          <>
            <p className="dialog-text">{TEXT.request}</p>
            <textarea className="dialog-textarea notice__text" readOnly value={shown.reason} rows={3} aria-label="Request reason" />
            <fieldset className="notice__actions">
              <legend>Response Action</legend>
              <div className="notice__action-row">
                <button type="button" disabled={busy || inList} onClick={openAdd}>
                  Add To Contact List
                </button>
                <button type="button" disabled={busy} onClick={sendMessage}>
                  Send Message
                </button>
                <button
                  type="button"
                  disabled={busy}
                  aria-haspopup="menu"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setMenu({ x: rect.left, y: rect.bottom });
                  }}
                >
                  Decline/Ignore
                </button>
                <button type="button" className="default" disabled={busy} autoFocus onClick={() => respond(true, '')}>
                  Authorize
                </button>
              </div>
            </fieldset>
          </>
        );
      case 'auth_granted':
        return (
          <>
            <p className="dialog-text">{TEXT.granted}</p>
            <div className="dialog-buttons dialog-buttons--end">
              <button type="button" className="default" autoFocus disabled={busy} onClick={dismiss}>
                OK
              </button>
            </div>
          </>
        );
      case 'auth_denied':
        return (
          <>
            <p className="dialog-text">{shown.reason ? TEXT.deniedWithReason : TEXT.deniedNoReason}</p>
            {shown.reason ? <textarea className="dialog-textarea notice__text" readOnly value={shown.reason} rows={3} aria-label="Reason" /> : null}
            <div className="dialog-buttons dialog-buttons--end">
              <button type="button" className="default" autoFocus disabled={busy} onClick={dismiss}>
                OK
              </button>
            </div>
          </>
        );
      case 'added_you':
        return (
          <>
            <p className="dialog-text">{TEXT.addedYou}</p>
            <fieldset className="notice__actions">
              <legend>Response Action</legend>
              <div className="notice__action-row">
                <button type="button" onClick={() => store.getState().openWindow({ kind: 'userDetails', uin: shown.from })}>
                  User Info
                </button>
                <span className="dialog-spacer" />
                <button
                  type="button"
                  className="default"
                  autoFocus
                  disabled={busy || inList}
                  onClick={() => {
                    openAdd();
                    dismiss();
                  }}
                >
                  Add To Contact List
                </button>
                <button type="button" disabled={busy} onClick={dismiss}>
                  Close
                </button>
              </div>
            </fieldset>
          </>
        );
    }
  };

  return (
    <WindowFrame windowId={windowId} title={NOTICE_TITLE[shown.kind]} icon={<NoticeIcon />} onClose={close} closeOnEscape className="notice">
      <NoticeHeader notice={shown} />
      {body()}
      {menu ? (
        <PopupMenu
          label="Decline/Ignore"
          anchor={menu}
          onClose={() => setMenu(null)}
          items={[
            { type: 'item', label: 'Decline - Without a reason.', onSelect: () => respond(false, '') },
            { type: 'item', label: 'Decline - Enter a reason', onSelect: () => setMode('decline') },
            { type: 'separator' },
            { type: 'item', label: 'Add To Ignore List', onSelect: ignore },
            { type: 'separator' },
            { type: 'item', label: 'Close (Ignore)', onSelect: () => setMode('ignore') },
          ]}
        />
      ) : null}
    </WindowFrame>
  );
}
