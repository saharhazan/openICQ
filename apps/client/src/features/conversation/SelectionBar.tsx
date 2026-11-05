/** Multi-select mode (HistoryControlPage multiselect): "%1 message selected" with Reply, Copy, Forward, Delete and Cancel. */
import { Copy, Forward, Reply, Trash2, X } from 'lucide-react';
import type { Chat } from '@openicq/protocol';
import { useApp, useServices } from '../../app/AppContext';
import { S, fmt } from '../../strings';

const NO_IDS: number[] = [];

export function selectionTitle(count: number): string {
  return fmt(count === 1 ? S.selection.one : S.selection.many, count);
}

export function SelectionBar({ chat, canWrite }: { chat: Chat; canWrite: boolean }) {
  const { store } = useServices();
  const ids = useApp((s) => (s.selection?.chatId === chat.id ? s.selection.ids : NO_IDS));
  const messages = useApp((s) => s.data.histories[chat.id]?.messages);
  const picked = (messages ?? []).filter((m) => ids.includes(m.id) && !m.deleted);
  const live = picked.filter((m) => m.event === null);
  const exit = () => store.getState().patch({ selection: null });

  const copy = () => {
    const text = live
      .map((m) => m.text)
      .filter((t) => t.trim() !== '')
      .join('\n');
    navigator.clipboard.writeText(text).then(exit, (error: unknown) => store.getState().reportError(error));
  };

  return (
    <div className="selection-bar" role="toolbar" aria-label={selectionTitle(ids.length)}>
      <button type="button" className="icon-button" aria-label={S.selection.cancel} onClick={exit}>
        <X size={20} />
      </button>
      <span className="selection-title">{selectionTitle(ids.length)}</span>
      <div className="selection-actions">
        {canWrite && (
          <button
            type="button"
            className="selection-button"
            disabled={live.length !== 1}
            onClick={() => {
              const target = live[0];
              if (!target) return;
              store.getState().setComposer(chat.id, { replyTo: target, editing: null });
              exit();
            }}
          >
            <Reply size={18} aria-hidden="true" />
            {S.messageMenu.reply}
          </button>
        )}
        <button type="button" className="selection-button" disabled={live.every((m) => m.text.trim() === '')} onClick={copy}>
          <Copy size={18} aria-hidden="true" />
          {S.messageMenu.copy}
        </button>
        <button
          type="button"
          className="selection-button"
          disabled={live.length === 0}
          onClick={() => store.getState().openDialog({ kind: 'forward', fromChatId: chat.id, messageIds: live.map((m) => m.id) })}
        >
          <Forward size={18} aria-hidden="true" />
          {S.messageMenu.forward}
        </button>
        <button
          type="button"
          className="selection-button selection-danger"
          disabled={ids.length === 0}
          onClick={() => store.getState().openDialog({ kind: 'deleteMessages', chatId: chat.id, messageIds: ids })}
        >
          <Trash2 size={18} aria-hidden="true" />
          {S.messageMenu.delete}
        </button>
      </div>
    </div>
  );
}
