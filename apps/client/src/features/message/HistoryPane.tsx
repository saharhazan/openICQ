import type { ChatMessage, Uin } from '@openicq/protocol';
import { useEffect, useRef } from 'react';
import type { AutoResponseNote } from '../../state/chat';
import { Linkified } from '../../ui/Linkified';
import { STATUS_NAME } from '../strings';
import './HistoryPane.css';

export type HistoryEntry = { type: 'message'; message: ChatMessage } | { type: 'auto'; note: AutoResponseNote; key: string };

/** Messages in id order, each auto-response right after the message that triggered it. */
export function historyEntries(messages: readonly ChatMessage[], notes: readonly AutoResponseNote[]): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  const pending = [...notes];
  for (const message of messages) {
    entries.push({ type: 'message', message });
    for (let i = 0; i < pending.length; ) {
      const note = pending[i];
      if (note && note.afterMessageId === message.id) {
        entries.push({ type: 'auto', note, key: `auto-${note.afterMessageId}-${i}` });
        pending.splice(i, 1);
      } else {
        i += 1;
      }
    }
  }
  return entries;
}

export function formatTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay ? time : `${date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })} ${time}`;
}

export interface HistoryPaneProps {
  entries: HistoryEntry[];
  selfUin: Uin | null;
  selfName: string;
  peerName: string;
  /** Keep the newest entry in view when entries change. */
  stickToBottom?: boolean;
  label: string;
}

/** The read-only conversation area: nick and time in colour, then the text. */
export function HistoryPane({ entries, selfUin, selfName, peerName, stickToBottom = true, label }: HistoryPaneProps) {
  const ref = useRef<HTMLDivElement>(null);
  const last = entries.at(-1);
  const lastKey = last ? (last.type === 'message' ? `m${last.message.id}` : last.key) : '';

  useEffect(() => {
    const el = ref.current;
    if (el && stickToBottom) el.scrollTop = el.scrollHeight;
  }, [lastKey, stickToBottom]);

  return (
    <div className="history-pane" ref={ref} role="log" aria-label={label} aria-live="polite">
      {entries.map((entry) => {
        if (entry.type === 'auto') {
          return (
            <div key={entry.key} className="history-entry history-entry--auto">
              <div className="history-entry__head">
                {`${peerName} (${STATUS_NAME[entry.note.status]})`}
                <span className="history-entry__tag">Auto</span>
              </div>
              <div className="history-entry__text">
                <Linkified text={entry.note.text} />
              </div>
            </div>
          );
        }
        const m = entry.message;
        const own = m.from === selfUin;
        return (
          <div key={m.id} className={`history-entry ${own ? 'history-entry--own' : 'history-entry--peer'}`} data-message-id={m.id}>
            <div className="history-entry__head">
              <span className="history-entry__nick">{own ? selfName : peerName}</span>
              <span className="history-entry__time">{formatTime(m.sentAt)}</span>
              {m.deliveredOffline ? <span className="history-entry__tag">Offline Message</span> : null}
              {m.kind === 'auto' ? <span className="history-entry__tag">Auto</span> : null}
            </div>
            <div className="history-entry__text">
              <Linkified text={m.text} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
