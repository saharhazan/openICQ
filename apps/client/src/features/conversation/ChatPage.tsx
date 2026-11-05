/**
 * The chat page: header, history on the wallpaper, typing row and the input
 * (or the multi-select bar, or the blocked / read-only plate). Files dragged
 * onto the page show the two drop zones "Quick send" and "Send with caption".
 */
import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react';
import type { Attachment, Message, Reaction } from '@openicq/protocol';
import { useApp, useServices } from '../../app/AppContext';
import { chatTitle } from '../../state/selectors';
import { S } from '../../strings';
import { useMenu } from '../../ui/Menu';
import type { BubbleHandlers } from './Bubble';
import { ChatHeader } from './ChatHeader';
import { Composer } from './Composer';
import { History } from './History';
import { messageMenuEntries, type MessageAction } from './messageMenu';
import { SelectionBar } from './SelectionBar';
import { acceptFiles, batches, tooLargeText } from './SendFilesDialog';
import { TypingRow } from './TypingRow';
import './conversation.css';
import './bubble.css';

function hasFiles(event: DragEvent): boolean {
  return [...event.dataTransfer.types].includes('Files');
}

export function ChatPage({ chatId }: { chatId: number }) {
  const { store, chats } = useServices();
  const chat = useApp((s) => s.data.chats[chatId]);
  const users = useApp((s) => s.data.users);
  const me = useApp((s) => s.data.me);
  const selecting = useApp((s) => s.selection?.chatId === chatId);
  const menu = useMenu();
  const openMenuAt = menu.openAt;
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const peer = chat?.peer === null || chat?.peer === undefined ? undefined : users[chat.peer];
  const blocked = chat?.type === 'direct' && peer?.blocked === true;
  const readOnly = chat?.type === 'group' && chat.group?.myRole === 'readonly';
  const canWrite = !blocked && !readOnly;
  const title = chat ? chatTitle({ users, me }, chat) : '';

  const run = useCallback(
    (message: Message, action: MessageAction) => {
      const state = store.getState();
      switch (action) {
        case 'reply':
          state.setComposer(chatId, { replyTo: message, editing: null });
          return;
        case 'copy':
          navigator.clipboard.writeText(message.text).catch((error: unknown) => store.getState().reportError(error));
          return;
        case 'forward':
          state.openDialog({ kind: 'forward', fromChatId: chatId, messageIds: [message.id] });
          return;
        case 'select':
          state.patch({ selection: { chatId, ids: [message.id] } });
          return;
        case 'edit':
          state.setComposer(chatId, { editing: message, replyTo: null });
          return;
        case 'deleteForMe':
        case 'deleteForAll': {
          const forAll = action === 'deleteForAll';
          state.confirm({
            title: S.dialogs.deleteMessage,
            text: forAll ? S.dialogs.deleteMessageConfirm : S.dialogs.deleteOnlyForYou,
            confirmLabel: S.dialogs.remove,
            destructive: true,
            onConfirm: () => void chats.deleteMessages(chatId, [message.id], forAll),
          });
          return;
        }
      }
    },
    [store, chats, chatId],
  );

  const handlers = useMemo<BubbleHandlers>(
    () => ({
      onMenu: (message: Message, x: number, y: number) => {
        const state = store.getState();
        const current = state.data.chats[chatId];
        const myUin = state.data.me?.uin;
        if (!current || myUin === undefined) return;
        const entries = messageMenuEntries(message, { chat: current, me: myUin, canWrite }).map((entry) => ({
          label: entry.label,
          danger: entry.danger,
          onSelect: () => run(message, entry.action),
        }));
        openMenuAt(x, y, message.text.slice(0, 40) || S.messageMenu.select, entries);
      },
      onReact: (message: Message, reaction: Reaction | null) => void chats.react(message.id, reaction),
      onReply: (message: Message) => {
        if (canWrite) store.getState().setComposer(chatId, { replyTo: message, editing: null });
      },
      onOpenImage: (attachment: Attachment) => store.getState().openDialog({ kind: 'image', fileId: attachment.fileId, name: attachment.name }),
      onRetry: (clientId: string) => void chats.retry(chatId, clientId),
      onToggleSelect: (messageId: number) =>
        store.getState().patch((s) => {
          const ids = s.selection?.chatId === chatId ? s.selection.ids : [];
          return { selection: { chatId, ids: ids.includes(messageId) ? ids.filter((id) => id !== messageId) : [...ids, messageId] } };
        }),
      onJump: (messageId: number) => {
        const row = document.getElementById(`msg-${messageId}`);
        if (!row) return;
        row.scrollIntoView({ block: 'center' });
        row.classList.add('msg-flash');
        setTimeout(() => row.classList.remove('msg-flash'), 1_200);
      },
    }),
    [store, chats, chatId, canWrite, openMenuAt, run],
  );

  if (!chat) return null;

  const dropFiles = (event: DragEvent, quick: boolean) => {
    event.preventDefault();
    // A drop on a zone must not reach the page's own drop handler as well.
    event.stopPropagation();
    dragDepth.current = 0;
    setDragging(false);
    const files = [...event.dataTransfer.files];
    if (files.length === 0 || !canWrite) return;
    if (!quick) {
      store.getState().openDialog({ kind: 'sendFiles', chatId, files });
      return;
    }
    const accepted = acceptFiles(files, (name) => store.getState().toast(tooLargeText(name), 'error'));
    batches(accepted).forEach((group) => void chats.send(chatId, '', group));
  };

  return (
    <section
      className="chat-page"
      aria-label={title}
      onDragEnter={(event) => {
        if (!hasFiles(event) || !canWrite) return;
        event.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (hasFiles(event)) event.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(event) => dropFiles(event, false)}
    >
      <ChatHeader chat={chat} title={title} />
      <History chat={chat} title={title} handlers={handlers} />
      <TypingRow chatId={chatId} />
      {selecting ? (
        <SelectionBar chat={chat} canWrite={canWrite} />
      ) : blocked && peer ? (
        <div className="input-plate">
          <span>{S.input.userBlocked}</span>
          <button type="button" className="text-button" onClick={() => void chats.block(peer.uin, false)}>
            {S.input.unblock}
          </button>
        </div>
      ) : readOnly ? (
        <div className="input-plate">{S.input.banned}</div>
      ) : (
        <Composer chat={chat} />
      )}
      {dragging && (
        <div className="drop-overlay">
          <div className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropFiles(event, true)}>
            {S.files.quickSend}
          </div>
          <div className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropFiles(event, false)}>
            {S.files.sendWithCaption}
          </div>
        </div>
      )}
      {menu.menu}
    </section>
  );
}
