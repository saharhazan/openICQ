/** The 56 px chat header (DialogHeaderPanel.cpp): avatar 32, name 16, status 14, then the action buttons. */
import { Hourglass, Info, UserPlus } from 'lucide-react';
import type { Chat } from '@openicq/protocol';
import { useApp, useServices } from '../../app/AppContext';
import { formatPresence } from '../../state/format';
import { chatAvatarFileId, chatAvatarSeed } from '../../state/selectors';
import { S, plural } from '../../strings';
import { Avatar } from '../../ui/Avatar';
import { useNow } from '../../ui/useNow';
import { isAdmin } from './messageMenu';

export function ChatHeader({ chat, title }: { chat: Chat; title: string }) {
  const { store } = useServices();
  const users = useApp((s) => s.data.users);
  const me = useApp((s) => s.data.me);
  const sidebar = useApp((s) => s.sidebar);
  const now = useNow();
  const peer = chat.peer === null ? undefined : users[chat.peer];
  const admin = chat.type === 'group' && isAdmin(chat);
  const pending = chat.group?.pendingRequests ?? 0;
  const sidebarOpen =
    sidebar !== null && ((sidebar.kind === 'user' && sidebar.uin === chat.peer) || (sidebar.kind === 'group' && sidebar.chatId === chat.id));

  let status = '';
  if (chat.type === 'group' && chat.group) status = plural(chat.group.membersCount, S.header.members);
  else if (chat.type === 'direct' && peer) status = peer.blocked ? S.presence.blocked : formatPresence(peer.presence, now);

  const toggleSidebar = () => {
    if (chat.type === 'favorites') return;
    if (sidebarOpen) {
      store.getState().patch({ sidebar: null });
      return;
    }
    if (chat.type === 'group') store.getState().patch({ sidebar: { kind: 'group', chatId: chat.id } });
    else if (chat.peer !== null) store.getState().patch({ sidebar: { kind: 'user', uin: chat.peer } });
  };

  return (
    <header className="chat-header">
      <button type="button" className="chat-header-who" onClick={toggleSidebar} disabled={chat.type === 'favorites'}>
        <Avatar
          fileId={chatAvatarFileId({ users, me }, chat)}
          seed={chatAvatarSeed({ me }, chat)}
          name={title}
          size={32}
          favorites={chat.type === 'favorites'}
          online={peer?.presence.online === true}
        />
        <span className="chat-header-text">
          <span className="chat-header-name">{title}</span>
          {status && <span className={`chat-header-status${peer?.presence.online ? ' chat-header-online' : ''}`}>{status}</span>}
        </span>
      </button>
      <div className="chat-header-actions">
        {admin && pending > 0 && (
          <button
            type="button"
            className="icon-button header-badge-button"
            aria-label={S.header.waitingForApproval}
            title={S.header.waitingForApproval}
            onClick={() => store.getState().patch({ sidebar: { kind: 'group', chatId: chat.id } })}
          >
            <Hourglass size={20} />
            <span className="header-badge">{pending}</span>
          </button>
        )}
        {admin && (
          <button
            type="button"
            className="icon-button"
            aria-label={S.header.addMember}
            title={S.header.addMember}
            onClick={() => store.getState().openDialog({ kind: 'addMembers', chatId: chat.id })}
          >
            <UserPlus size={20} />
          </button>
        )}
        {chat.type !== 'favorites' && (
          <button
            type="button"
            className="icon-button"
            aria-label={S.header.information}
            title={S.header.information}
            aria-pressed={sidebarOpen}
            onClick={toggleSidebar}
          >
            <Info size={20} />
          </button>
        )}
      </div>
    </header>
  );
}
