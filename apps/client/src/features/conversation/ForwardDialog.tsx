/** "Forward": pick a chat; the messages are sent there as new messages with "Forwarded from". */
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useApp, useServices } from '../../app/AppContext';
import { chatAvatarFileId, chatAvatarSeed, chatSections, chatTitle } from '../../state/selectors';
import { S } from '../../strings';
import { Avatar } from '../../ui/Avatar';
import { Dialog } from '../../ui/Dialog';
import './overlays.css';

export function ForwardDialog({ fromChatId, messageIds, onClose }: { fromChatId: number; messageIds: number[]; onClose: () => void }) {
  const { store, chats } = useServices();
  const data = useApp((s) => s.data);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const targets = useMemo(() => {
    const { pinned, recents } = chatSections(data.chats, data.pinOrder);
    const q = query.trim().toLowerCase();
    return [...pinned, ...recents].filter((chat) => {
      if (chat.type === 'group' && chat.group?.myRole === 'readonly') return false;
      if (chat.type === 'direct' && chat.peer !== null && data.users[chat.peer]?.blocked) return false;
      return q === '' || chatTitle(data, chat).toLowerCase().includes(q);
    });
  }, [data, query]);

  const forward = async (toChatId: number) => {
    setBusy(true);
    const ok = await chats.forward(fromChatId, messageIds, toChatId);
    setBusy(false);
    if (!ok) return;
    store.getState().patch({ selection: null });
    onClose();
  };

  return (
    <Dialog title={S.dialogs.forward} onClose={onClose}>
      <label className="search-pill dialog-search">
        <Search size={16} aria-hidden="true" />
        <input type="search" aria-label={S.search.placeholder} placeholder={S.search.placeholder} value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="picker-list" role="listbox" aria-label={S.dialogs.forward}>
        {targets.map((chat) => {
          const title = chatTitle(data, chat);
          return (
            <div
              key={chat.id}
              role="option"
              aria-selected={false}
              aria-label={title}
              aria-disabled={busy}
              tabIndex={0}
              className="contact-row"
              onClick={() => {
                if (!busy) void forward(chat.id);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !busy) void forward(chat.id);
              }}
            >
              <Avatar fileId={chatAvatarFileId(data, chat)} seed={chatAvatarSeed(data, chat)} name={title} size={32} favorites={chat.type === 'favorites'} />
              <span className="contact-name">{title}</span>
            </div>
          );
        })}
        {targets.length === 0 && <p className="list-empty">{S.search.nothingFound}</p>}
      </div>
    </Dialog>
  );
}
