import { isAwayStatus, LIMITS, type Uin } from '@openicq/protocol';
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useIcq, useServices } from '../../app/AppContext';
import { conversationOf, findContact, unreadCount } from '../../state/chat';
import { activeWindowId } from '../../state/windows';
import { StatusIcon } from '../../ui/icons/StatusIcon';
import { WindowFrame } from '../../ui/WindowFrame';
import { STATUS_NAME, STRINGS } from '../strings';
import { displayName, windowTitle } from '../windowTitles';
import { HistoryPane, historyEntries } from './HistoryPane';
import './MessageDialog.css';

/** True when the key press should send: Ctrl+Enter, as in ICQ 2001b. Plain Enter is a new line. */
export function isSendShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey'>): boolean {
  return event.key === 'Enter' && (event.ctrlKey || event.metaKey);
}

type UrgentPrompt = 'occupied' | 'dnd';

/** ICQ 2001b split-mode message window (dialog 2566): history above, compose below. */
export function MessageDialog({ windowId, uin }: { windowId: string; uin: Uin }) {
  const { store, session, commands } = useServices();
  const title = useIcq((s) => windowTitle({ kind: 'message', uin }, s));
  const peerName = useIcq((s) => displayName(s, uin));
  const selfUin = useIcq((s) => s.session?.uin ?? null);
  const selfName = useIcq((s) => s.self?.nickname ?? s.session?.nickname ?? 'Me');
  const contact = useIcq((s) => findContact(s.chat, uin));
  const conversation = useIcq((s) => conversationOf(s.chat, uin));
  const unread = useIcq((s) => unreadCount(s.chat, uin));
  const active = useIcq((s) => activeWindowId(s.windows) === windowId);
  const connected = useIcq((s) => s.connection === 'open');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [limitHit, setLimitHit] = useState(false);
  const [prompt, setPrompt] = useState<UrgentPrompt | null>(null);

  const entries = useMemo(
    () => historyEntries(conversation.messages, conversation.autoResponses),
    [conversation.messages, conversation.autoResponses],
  );
  const status = contact?.status ?? 'offline';
  const tooLong = text.length > LIMITS.messageText;
  const empty = text.trim().length === 0;

  useEffect(() => {
    if (!conversation.historyLoaded && connected) {
      commands.loadHistory(uin, false).catch((error: unknown) => store.getState().reportError(error, 'Message History'));
    }
  }, [commands, store, uin, connected, conversation.historyLoaded]);

  useEffect(() => {
    if (active && unread > 0) {
      session.markRead(uin).catch((error: unknown) => store.getState().reportError(error, 'ICQ Message'));
    }
  }, [active, unread, session, store, uin]);

  const close = () => store.getState().closeWindow(windowId);

  const deliver = async (urgent: boolean) => {
    setPrompt(null);
    setSending(true);
    const sent = text;
    const result = await commands.sendMessage(uin, sent, urgent);
    setSending(false);
    if (!result) return;
    // Keep anything typed while the message was on its way.
    setText((current) => (current === sent ? '' : current));
    setLimitHit(false);
    const auto = result.autoResponse;
    if (auto && isAwayStatus(auto.status)) {
      store.getState().openWindow({ kind: 'autoResponse', uin, status: auto.status, text: auto.text });
    }
  };

  const run = (task: Promise<void>) => {
    task.catch((error: unknown) => {
      setSending(false);
      store.getState().reportError(error, 'Send Message');
    });
  };

  /** Send: checks the limit, then asks first when the recipient is Occupied or DND. */
  const send = () => {
    if (sending || empty) return;
    if (tooLong) {
      setLimitHit(true);
      return;
    }
    if (status === 'occupied' || status === 'dnd') {
      setPrompt(status);
      return;
    }
    run(deliver(false));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isSendShortcut(event)) {
      event.preventDefault();
      send();
    }
  };

  return (
    <WindowFrame
      windowId={windowId}
      title={title}
      icon={<StatusIcon status={status} />}
      onClose={close}
      resizable
      className="message-dialog"
    >
      <div className="message-dialog__header">
        <span className="message-dialog__to">To:</span>
        <span className="message-dialog__status" title={STATUS_NAME[status]}>
          <StatusIcon status={contact?.awaitingAuth ? 'awaiting' : status} />
        </span>
        <input className="message-dialog__nick" type="text" readOnly value={peerName} aria-label="Nick" />
        <label className="message-dialog__field">
          <span>ICQ#</span>
          <input type="text" readOnly value={String(uin)} aria-label="ICQ#" />
        </label>
        <span className="dialog-spacer" />
        <button type="button" onClick={() => store.getState().openWindow({ kind: 'userDetails', uin })}>
          Info
        </button>
        <button type="button" onClick={() => store.getState().openWindow({ kind: 'history', uin })}>
          History
        </button>
      </div>
      <HistoryPane entries={entries} selfUin={selfUin} selfName={selfName} peerName={peerName} label={`Messages with ${peerName}`} />
      <div className="message-dialog__toolbar">
        <span className={`message-dialog__counter${tooLong ? ' is-over' : ''}`} aria-live="polite">
          {`Chars: ${text.length}/${LIMITS.messageText}`}
        </span>
      </div>
      <div className="message-dialog__compose">
        <textarea
          className="message-dialog__input"
          aria-label="Message"
          value={text}
          autoFocus
          onChange={(e) => {
            setText(e.target.value);
            if (limitHit && e.target.value.length <= LIMITS.messageText) setLimitHit(false);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {limitHit ? (
        <p className="dialog-error message-dialog__limit" role="alert">
          {STRINGS.overServerLimit(LIMITS.messageText)}
        </p>
      ) : null}
      {prompt ? (
        <div className="message-dialog__prompt" role="alertdialog" aria-label={`User ${peerName} is in ${STATUS_NAME[prompt]} mode`}>
          <p className="dialog-text">{prompt === 'occupied' ? STRINGS.occupiedPrompt : STRINGS.dndPrompt}</p>
          <div className="dialog-buttons dialog-buttons--end">
            {prompt === 'occupied' ? (
              <button type="button" onClick={() => run(deliver(true))}>
                {STRINGS.sendUrgent}
              </button>
            ) : null}
            <button type="button" className="default" autoFocus onClick={() => run(deliver(false))}>
              {STRINGS.sendToContactList}
            </button>
            <button type="button" onClick={() => setPrompt(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      <div className="message-dialog__buttons">
        <button type="button" onClick={close}>
          Cancel
        </button>
        <span className="dialog-spacer" />
        <button type="button" className="default message-dialog__send" onClick={send} disabled={sending || empty || tooLong} title="Send (Ctrl+Enter)">
          {sending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </WindowFrame>
  );
}
