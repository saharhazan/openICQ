/**
 * The message history (HistoryControlPage.cpp) on the chat_environment
 * background: a log of date pills, the "New messages" plate, service events
 * and bubbles. Loads older pages at the top, keeps the bottom pinned while
 * new messages arrive, and shows the floating date pill while scrolling.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowDown } from 'lucide-react';
import type { Chat } from '@openicq/protocol';
import { useApp, useServices } from '../../app/AppContext';
import { chatEventText } from '../../state/chatEventText';
import { formatDatePill } from '../../state/format';
import { eventNames, userName } from '../../state/selectors';
import { buildTimeline, memberMarks, readState, type TimelineItem } from '../../state/timeline';
import { emptyHistory } from '../../state/types';
import { S } from '../../strings';
import { Bubble, type BubbleHandlers, type Person } from './Bubble';

const NO_OUTBOX: never[] = [];
const NEAR_BOTTOM_PX = 120;
const LOAD_OLDER_PX = 200;
const FLOATING_PILL_MS = 1_200;

/** Pairs each item with the date pill text of its day (for the floating pill). */
function withDayLabels(items: readonly TimelineItem[], now: Date): Array<{ item: TimelineItem; day: string }> {
  const rows: Array<{ item: TimelineItem; day: string }> = [];
  let day = '';
  for (const item of items) {
    if (item.kind === 'date') day = formatDatePill(item.at, now);
    rows.push({ item, day });
  }
  return rows;
}

export interface HistoryProps {
  chat: Chat;
  title: string;
  handlers: BubbleHandlers;
}

export function History({ chat, title, handlers }: HistoryProps) {
  const { chats: commands } = useServices();
  const history = useApp((s) => s.data.histories[chat.id] ?? emptyHistory);
  const outbox = useApp((s) => s.data.outbox[chat.id] ?? NO_OUTBOX);
  const marks = useApp((s) => s.data.readMarks[chat.id]);
  const users = useApp((s) => s.data.users);
  const me = useApp((s) => s.data.me);
  const plate = useApp((s) => (s.newPlate?.chatId === chat.id ? s.newPlate.afterId : null));
  const selection = useApp((s) => (s.selection?.chatId === chat.id ? s.selection.ids : null));
  const myUin = me?.uin ?? 0;

  const items = useMemo(
    () => buildTimeline({ messages: history.messages, outbox, me: myUin, isGroup: chat.type === 'group', newPlateAfterId: plate }),
    [history.messages, outbox, myUin, chat.type, plate],
  );
  const rows = useMemo(() => withDayLabels(items, new Date()), [items]);
  const reads = useMemo(() => readState(items, memberMarks(chat, myUin, marks), myUin), [items, chat, myUin, marks]);
  const names = useMemo(() => ({ users, me }), [users, me]);
  const person = useCallback(
    (uin: number): Person => ({
      name: userName(names, uin),
      avatarFileId: me && uin === me.uin ? me.avatarFileId : (users[uin]?.avatarFileId ?? null),
    }),
    [names, users, me],
  );

  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const restore = useRef<{ height: number; top: number } | null>(null);
  const [showDown, setShowDown] = useState(false);
  /** After a failed load the history waits for "REPEAT" instead of retrying in a loop. */
  const [failed, setFailed] = useState(false);
  const olderFailed = useRef(false);
  const [floating, setFloating] = useState<string | null>(null);
  const floatingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (history.loaded || history.loading || failed) return;
    void commands.loadHistory(chat.id, 'latest').then((ok) => {
      if (!ok) setFailed(true);
    });
  }, [chat.id, history.loaded, history.loading, failed, commands]);

  useEffect(
    () => () => {
      if (floatingTimer.current !== null) clearTimeout(floatingTimer.current);
    },
    [],
  );

  // Keep the view: older pages keep the reading position, new messages stick to the bottom.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (restore.current) {
      el.scrollTop = el.scrollHeight - restore.current.height + restore.current.top;
      restore.current = null;
      return;
    }
    if (atBottom.current) el.scrollTop = el.scrollHeight;
  }, [items]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottom.current = distance < NEAR_BOTTOM_PX;
    setShowDown(distance > el.clientHeight);
    if (el.scrollTop < LOAD_OLDER_PX && history.hasMore && !history.loading && history.loaded && !olderFailed.current) {
      restore.current = { height: el.scrollHeight, top: el.scrollTop };
      void commands.loadHistory(chat.id, 'older').then((ok) => {
        // One report per failure: older pages are tried again only after a new message or reopening the chat.
        olderFailed.current = !ok;
      });
    }
    const top = el.getBoundingClientRect().top;
    const rows = el.querySelectorAll<HTMLElement>('[data-day]');
    let label: string | null = null;
    for (const row of rows) {
      if (row.getBoundingClientRect().bottom > top) {
        label = row.dataset.day ?? null;
        break;
      }
    }
    setFloating(label);
    if (floatingTimer.current !== null) clearTimeout(floatingTimer.current);
    floatingTimer.current = setTimeout(() => setFloating(null), FLOATING_PILL_MS);
  };

  /** Arrow keys move between bubbles; the menu key or Shift+F10 opens a bubble's actions. */
  const onLogKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    const bubbles = [...(scroller.current?.querySelectorAll<HTMLElement>('.bubble[tabindex]') ?? [])];
    if (bubbles.length === 0) return;
    event.preventDefault();
    const index = bubbles.findIndex((b) => b === document.activeElement);
    const next = index === -1 ? bubbles.length - 1 : Math.max(0, Math.min(bubbles.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
    bubbles[next]?.focus();
  };

  const toBottom = () => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottom.current = true;
    setShowDown(false);
  };

  const eventNameSource = eventNames(names);
  const selected = new Set(selection ?? []);

  return (
    <div className="history-wrap">
      {floating && (
        <div className="date-pill date-floating" aria-hidden="true">
          {floating}
        </div>
      )}
      <div
        ref={scroller}
        className="history"
        role="log"
        aria-label={`Messages with ${title}`}
        onScroll={onScroll}
        onKeyDown={onLogKey}
        tabIndex={0}
      >
        <div className="history-inner">
          {history.loading && history.messages.length === 0 && <div className="history-loading" aria-busy="true" />}
          {failed && (
            <div className="history-failed" role="alert">
              <span>{S.dialogs.errorOccurred}</span>
              <button type="button" className="text-button" onClick={() => setFailed(false)}>
                {S.history.repeat}
              </button>
            </div>
          )}
          {rows.map(({ item, day: dayLabel }) => {
            if (item.kind === 'date') {
              return (
                <div key={item.key} className="date-row" data-day={dayLabel}>
                  <span className="date-pill">{dayLabel}</span>
                </div>
              );
            }
            if (item.kind === 'new') {
              return (
                <div key={item.key} className="new-plate" data-day={dayLabel}>
                  {S.history.newMessages}
                </div>
              );
            }
            if (item.kind === 'event') {
              return (
                <div key={item.key} className="event-row" data-day={dayLabel} data-message-id={item.message.id}>
                  <span className="event-text">{item.message.event ? chatEventText(item.message.event, eventNameSource) : ''}</span>
                </div>
              );
            }
            return (
              <div key={item.key} data-day={dayLabel}>
                <Bubble
                  item={item}
                  tick={reads.ticks.get(item.key)}
                  heads={reads.heads.get(item.key)}
                  isGroup={chat.type === 'group'}
                  selecting={selection !== null}
                  selected={item.message ? selected.has(item.message.id) : false}
                  person={person}
                  handlers={handlers}
                />
              </div>
            );
          })}
        </div>
      </div>
      {showDown && (
        <button type="button" className="to-bottom" aria-label={S.history.toBottom} onClick={toBottom}>
          <ArrowDown size={20} />
          {chat.unread > 0 && <span className="to-bottom-count">{chat.unread}</span>}
        </button>
      )}
    </div>
  );
}
