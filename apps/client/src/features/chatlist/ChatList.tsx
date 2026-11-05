/**
 * The chat list (RecentsModel.cpp): PINNED then RECENTS, newest first.
 * A listbox whose options are named by the chat title; the context menu
 * offers the row actions of chatMenu.ts.
 */
import { useCallback, useMemo, useRef, type KeyboardEvent } from 'react';
import type { Chat } from '@openicq/protocol';
import { useApp, useServices } from '../../app/AppContext';
import { chatSections, chatTitle } from '../../state/selectors';
import { S } from '../../strings';
import { useMenu } from '../../ui/Menu';
import { useNow } from '../../ui/useNow';
import { chatMenuEntries, type ChatAction } from './chatMenu';
import { ChatRow } from './ChatRow';
import './chatlist.css';

export function ChatList({ mini }: { mini: boolean }) {
  const { store, chats: commands } = useServices();
  const chats = useApp((s) => s.data.chats);
  const selected = useApp((s) => s.selectedChatId);
  const compact = useApp((s) => s.prefs.compact);
  const pinOrder = useApp((s) => s.data.pinOrder);
  const sections = useMemo(() => chatSections(chats, pinOrder), [chats, pinOrder]);
  const now = useNow();
  const menu = useMenu();
  const listRef = useRef<HTMLDivElement>(null);

  const open = useCallback((chatId: number) => store.getState().openChat(chatId), [store]);

  const run = useCallback(
    (chat: Chat, action: ChatAction) => {
      const state = store.getState();
      const peer = chat.peer;
      switch (action) {
        case 'markRead':
          void commands.markRead(chat.id);
          return;
        case 'markUnread':
          void commands.markUnread(chat.id);
          return;
        case 'pin':
        case 'unpin':
          void commands.update(chat.id, { pinned: action === 'pin' });
          return;
        case 'mute':
        case 'unmute':
          void commands.update(chat.id, { muted: action === 'mute' });
          return;
        case 'clear':
          state.confirm({
            title: S.chatMenu.clearHistory,
            text: S.dialogs.clearHistoryConfirm,
            confirmLabel: S.dialogs.remove,
            destructive: true,
            onConfirm: () => void commands.clear(chat.id),
          });
          return;
        case 'block':
          if (peer === null) return;
          state.confirm({
            title: S.dialogs.block,
            text: S.dialogs.blockConfirm,
            confirmLabel: S.dialogs.block,
            destructive: true,
            onConfirm: () => void commands.block(peer, true),
          });
          return;
        case 'unblock':
          if (peer !== null) void commands.block(peer, false);
          return;
        case 'leave':
          state.confirm({
            title: S.chatMenu.leaveAndDelete,
            text: S.dialogs.leaveGroupConfirm,
            confirmLabel: S.dialogs.leave,
            destructive: true,
            onConfirm: () => void commands.remove(chat.id),
          });
          return;
        case 'hide':
          void commands.remove(chat.id);
          return;
      }
    },
    [store, commands],
  );

  const openMenu = useCallback(
    (chat: Chat, x: number, y: number) => {
      const state = store.getState();
      const peer = chat.peer === null ? undefined : state.data.users[chat.peer];
      const entries = chatMenuEntries(chat, peer).map((entry) => ({
        label: entry.label,
        danger: entry.danger,
        onSelect: () => run(chat, entry.action),
      }));
      menu.openAt(x, y, chatTitle(state.data, chat), entries);
    },
    [store, menu, run],
  );

  const ordered = [...sections.pinned, ...sections.recents];
  const focusId = selected !== null && ordered.some((c) => c.id === selected) ? selected : ordered[0]?.id;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    if (rows.length === 0) return;
    event.preventDefault();
    const index = rows.findIndex((row) => row === document.activeElement);
    const next =
      event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
    rows[next]?.focus();
  };

  if (ordered.length === 0) return <p className="list-empty">{S.placeholders.chatListEmpty}</p>;

  const renderRows = (list: Chat[]) =>
    list.map((chat) => (
      <ChatRow
        key={chat.id}
        chat={chat}
        selected={chat.id === selected}
        compact={compact}
        mini={mini}
        focusable={chat.id === focusId}
        now={now}
        onOpen={open}
        onMenu={openMenu}
      />
    ));

  return (
    <div ref={listRef} className="chat-list" role="listbox" aria-label={S.head.chats} onKeyDown={onKeyDown}>
      {sections.pinned.length > 0 && !mini && (
        <div role="presentation" className="list-section">
          {S.sections.pinned}
        </div>
      )}
      {renderRows(sections.pinned)}
      {sections.pinned.length > 0 && sections.recents.length > 0 && !mini && (
        <div role="presentation" className="list-section">
          {S.sections.recents}
        </div>
      )}
      {renderRows(sections.recents)}
      {menu.menu}
    </div>
  );
}
