import type { ChatMessage, Uin } from '@openicq/protocol';
import { useEffect, useId, useMemo, useState } from 'react';
import { useIcq, useServices } from '../../app/AppContext';
import { conversationOf } from '../../state/chat';
import { MessageIcon } from '../../ui/icons/MessageIcon';
import { Linkified } from '../../ui/Linkified';
import { WindowFrame } from '../../ui/WindowFrame';
import { displayName, windowTitle } from '../windowTitles';
import './HistoryWindow.css';

/** Sorts and filters history rows the way the window shows them. */
export function visibleHistory(messages: readonly ChatMessage[], lastFirst: boolean, find: string): ChatMessage[] {
  const needle = find.trim().toLowerCase();
  const filtered = needle === '' ? [...messages] : messages.filter((m) => m.text.toLowerCase().includes(needle));
  return filtered.sort((a, b) => (lastFirst ? b.id - a.id : a.id - b.id));
}

/** "History Of Events: <nick>" (icq.exe dialog 2020), paged with history.get. */
export function HistoryWindow({ windowId, uin }: { windowId: string; uin: Uin }) {
  const { store, commands } = useServices();
  const id = useId();
  const title = useIcq((s) => windowTitle({ kind: 'history', uin }, s));
  const peer = useIcq((s) => displayName(s, uin));
  const selfUin = useIcq((s) => s.session?.uin ?? null);
  const selfName = useIcq((s) => s.self?.nickname ?? 'Me');
  const conversation = useIcq((s) => conversationOf(s.chat, uin));
  const connected = useIcq((s) => s.connection === 'open');
  const [lastFirst, setLastFirst] = useState(true);
  const [find, setFind] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const rows = useMemo(() => visibleHistory(conversation.messages, lastFirst, find), [conversation.messages, lastFirst, find]);
  const current = rows.find((m) => m.id === selected) ?? null;
  const close = () => store.getState().closeWindow(windowId);

  const load = (older: boolean) => {
    setLoading(true);
    commands
      .loadHistory(uin, older)
      .then(() => setLoading(false))
      .catch((error: unknown) => {
        setLoading(false);
        store.getState().reportError(error, 'Message History');
      });
  };

  useEffect(() => {
    if (conversation.historyLoaded || !connected) return;
    commands.loadHistory(uin, false).catch((error: unknown) => store.getState().reportError(error, 'Message History'));
  }, [commands, store, uin, connected, conversation.historyLoaded]);

  return (
    <WindowFrame windowId={windowId} title={title} icon={<MessageIcon />} onClose={close} closeOnEscape resizable className="history-window">
      <div className="sunken-panel history-window__list">
        <table className="interactive" aria-label={title}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Type</th>
              <th>Nick Name</th>
              <th>Content</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const own = m.from === selfUin;
              const when = new Date(m.sentAt);
              return (
                <tr key={m.id} className={m.id === selected ? 'highlighted' : undefined} aria-selected={m.id === selected} onClick={() => setSelected(m.id)}>
                  <td>{when.toLocaleDateString('en-US')}</td>
                  <td>{when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</td>
                  <td>{own ? 'Send' : 'Receive'}</td>
                  <td className={own ? 'history-window__own' : 'history-window__peer'}>{own ? selfName : peer}</td>
                  <td className="history-window__content">{m.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && !loading ? <p className="history-window__empty">No events.</p> : null}
      </div>
      <fieldset className="history-window__details">
        <legend>Content</legend>
        <div className="history-window__text">{current ? <Linkified text={current.text} /> : null}</div>
      </fieldset>
      <div className="history-window__controls">
        <button type="button" disabled={!conversation.hasMoreHistory || loading || !connected} onClick={() => load(true)}>
          {loading ? 'Loading...' : 'Older Events'}
        </button>
        <span className="history-window__find">
          <label htmlFor={`${id}-find`}>Find:</label>
          <input id={`${id}-find`} type="text" value={find} onChange={(e) => setFind(e.target.value)} />
        </span>
        <span className="field-row">
          <input id={`${id}-last`} type="checkbox" checked={lastFirst} onChange={(e) => setLastFirst(e.target.checked)} />
          <label htmlFor={`${id}-last`}>Display Last Event First</label>
        </span>
        <span className="dialog-spacer" />
        <button type="button" className="default" onClick={close}>
          Close
        </button>
      </div>
    </WindowFrame>
  );
}
