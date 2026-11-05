import { memo } from 'react';
import { BellOff, Pin } from 'lucide-react';
import type { Chat } from '@openicq/protocol';
import { useApp } from '../../app/AppContext';
import { formatListTime } from '../../state/format';
import { chatAvatarFileId, chatAvatarSeed, chatPreview, chatTitle, typingLine } from '../../state/selectors';
import { Avatar } from '../../ui/Avatar';
import { TickIcon } from '../../ui/TickIcon';
import { rowTick } from './rowTick';

export interface ChatRowProps {
  chat: Chat;
  selected: boolean;
  compact: boolean;
  mini: boolean;
  focusable: boolean;
  now: Date;
  onOpen: (chatId: number) => void;
  onMenu: (chat: Chat, x: number, y: number) => void;
}

const NO_TYPING: readonly number[] = [];

/** One chat row (RecentItemDelegate.cpp): 72 high with a 52 avatar, 48 with 32 in compact mode. */
export const ChatRow = memo(function ChatRow({ chat, selected, compact, mini, focusable, now, onOpen, onMenu }: ChatRowProps) {
  const users = useApp((s) => s.data.users);
  const me = useApp((s) => s.data.me);
  const draft = useApp((s) => s.drafts[chat.id] ?? '');
  const typing = useApp((s) => s.data.typing[chat.id] ?? NO_TYPING);
  const outbox = useApp((s) => s.data.outbox[chat.id]);
  const marks = useApp((s) => s.data.readMarks[chat.id]);
  const names = { users, me };
  const title = chatTitle(names, chat);
  const typingText = typingLine(names, chat, typing);
  const preview = chatPreview(names, chat, selected ? '' : draft);
  const tick = me ? rowTick(chat, me.uin, outbox, marks) : null;
  const unread = chat.unread > 0 || chat.markedUnread;
  const peer = chat.peer === null ? undefined : users[chat.peer];
  const time = chat.lastMessage ? formatListTime(chat.lastMessage.sentAt, now) : '';
  const avatarSize = compact || mini ? 32 : 52;

  return (
    <div
      id={`chat-row-${chat.id}`}
      role="option"
      aria-selected={selected}
      aria-label={title}
      aria-describedby={mini ? undefined : `chat-row-${chat.id}-desc`}
      tabIndex={focusable ? 0 : -1}
      data-chat-id={chat.id}
      className={`chat-row${compact ? ' chat-row-compact' : ''}${mini ? ' chat-row-mini' : ''}${selected ? ' chat-row-selected' : ''}`}
      onClick={() => onOpen(chat.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(chat.id);
        }
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          onMenu(chat, rect.left + 24, rect.top + rect.height / 2);
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu(chat, event.clientX, event.clientY);
      }}
    >
      <span className="chat-row-avatar">
        <Avatar
          fileId={chatAvatarFileId(names, chat)}
          seed={chatAvatarSeed(names, chat)}
          name={title}
          size={avatarSize}
          favorites={chat.type === 'favorites'}
          online={chat.type === 'direct' && peer?.presence.online === true}
        />
        {mini && unread && <span className={`unread-dot${chat.muted ? ' unread-muted' : ''}`} />}
      </span>
      {!mini && (
        <span className="chat-row-body" id={`chat-row-${chat.id}-desc`}>
          <span className="chat-row-line">
            <span className="chat-row-name">{title}</span>
            {chat.muted && <BellOff className="chat-row-flag" size={14} aria-hidden="true" />}
            <span className="chat-row-meta">
              {tick === 'read' && chat.type === 'direct' && peer ? (
                <span className="row-head" data-tick="read">
                  <Avatar fileId={peer.avatarFileId} seed={peer.uin} name={title} size={14} />
                </span>
              ) : tick === 'read' ? (
                <TickIcon tick="delivered" size={14} />
              ) : (
                tick && <TickIcon tick={tick} size={14} />
              )}
              <span className="chat-row-time">{time}</span>
            </span>
          </span>
          {!compact && (
            <span className="chat-row-line">
              <span className={`chat-row-preview${unread ? ' chat-row-preview-unread' : ''}`}>
                {typingText ? (
                  <span className="chat-row-typing">{typingText}</span>
                ) : (
                  <>
                    {preview.prefix && <span className={preview.isDraft ? 'chat-row-draft' : 'chat-row-sender'}>{`${preview.prefix}: `}</span>}
                    {preview.text}
                  </>
                )}
              </span>
              {chat.pinned && !unread && <Pin className="chat-row-flag" size={14} aria-hidden="true" />}
              {unread && (
                <span className={`unread-pill${chat.muted ? ' unread-muted' : ''}`} data-unread={chat.unread}>
                  {chat.unread > 0 ? (chat.unread > 999 ? '999+' : chat.unread) : ''}
                </span>
              )}
            </span>
          )}
          {compact && unread && (
            <span className={`unread-pill unread-compact${chat.muted ? ' unread-muted' : ''}`} data-unread={chat.unread}>
              {chat.unread > 0 ? chat.unread : ''}
            </span>
          )}
        </span>
      )}
    </div>
  );
});
