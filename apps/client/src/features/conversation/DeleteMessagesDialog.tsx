/**
 * Deleting several selected messages (HistoryControlPage.cpp:1168). "Delete for all"
 * is offered only when every message may be deleted for all (my own, or I am an admin).
 */
import { useApp, useServices } from '../../app/AppContext';
import { S, fmt } from '../../strings';
import { Button, Dialog } from '../../ui/Dialog';
import { canDeleteForAll } from './messageMenu';

export function DeleteMessagesDialog({ chatId, messageIds, onClose }: { chatId: number; messageIds: number[]; onClose: () => void }) {
  const { store, chats } = useServices();
  const chat = useApp((s) => s.data.chats[chatId]);
  const me = useApp((s) => s.data.me?.uin ?? 0);
  const messages = useApp((s) => s.data.histories[chatId]?.messages);
  if (!chat) return null;
  const picked = (messages ?? []).filter((m) => messageIds.includes(m.id));
  const context = { chat, me, canWrite: true };
  const forAll = picked.filter((m) => canDeleteForAll(m, context));
  const allowAll = chat.type !== 'favorites' && forAll.length > 0;
  const partial = allowAll && forAll.length < picked.length;

  const run = (all: boolean) => {
    const ids = all ? forAll.map((m) => m.id) : picked.map((m) => m.id);
    onClose();
    store.getState().patch({ selection: null });
    void chats.deleteMessages(chatId, ids, all);
  };

  return (
    <Dialog
      title={S.dialogs.deleteMessages}
      onClose={onClose}
      footer={
        <>
          <Button kind="secondary" onClick={onClose}>
            {S.dialogs.cancel}
          </Button>
          <Button kind="destructive" onClick={() => run(false)}>
            {chat.type === 'favorites' ? S.messageMenu.delete : S.messageMenu.deleteForMe}
          </Button>
          {allowAll && (
            <Button kind="destructive" onClick={() => run(true)}>
              {S.messageMenu.deleteForAll}
            </Button>
          )}
        </>
      }
    >
      <p className="dialog-text">{partial ? fmt(S.dialogs.deleteForAllOwnOnly, forAll.length, picked.length) : S.dialogs.deleteOnlyForYou}</p>
    </Dialog>
  );
}
