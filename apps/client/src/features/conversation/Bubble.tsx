/**
 * One message bubble (ComplexMessageItem.cpp, MessageStyle.cpp): radius 12,
 * 4 on the corners joined to the neighbours of the same sender, incoming
 * chat_primary, outgoing chat_secondary, the time inside, the tick beside it
 * and the readers' heads under it.
 */
import { memo, useEffect, useState } from 'react';
import { Check, SmilePlus } from 'lucide-react';
import type { Attachment, Message, Reaction } from '@openicq/protocol';
import type { BubbleItem, Tick } from '../../state/timeline';
import { S } from '../../strings';
import { Avatar } from '../../ui/Avatar';
import { avatarColors } from '../../ui/avatarPalette';
import { Linkified } from '../../ui/Linkified';
import { TickIcon } from '../../ui/TickIcon';
import { ForwardedHeader, MediaBlock, MetaLine, QuoteBlock } from './BubbleParts';
import { REACTION_DEFS, nextReaction, reactionDef } from './reactions';

export interface BubbleHandlers {
  onMenu: (message: Message, x: number, y: number) => void;
  onReact: (message: Message, reaction: Reaction | null) => void;
  onReply: (message: Message) => void;
  onOpenImage: (attachment: Attachment) => void;
  onRetry: (clientId: string) => void;
  onToggleSelect: (messageId: number) => void;
  onJump: (messageId: number) => void;
}

export interface Person {
  name: string;
  avatarFileId: number | null;
}

export interface BubbleProps {
  item: BubbleItem;
  tick: Tick | undefined;
  heads: readonly number[] | undefined;
  isGroup: boolean;
  selecting: boolean;
  selected: boolean;
  /** Resolves a user for sender names, quotes and heads. */
  person: (uin: number) => Person;
  handlers: BubbleHandlers;
}

/** The clock shows only if sending takes longer than this (LastStatusAnimation.cpp pendingTimeout). */
export const PENDING_CLOCK_DELAY_MS = 500;

function usePendingClock(createdAt: number | null): boolean {
  const [now, setNow] = useState(() => Date.now());
  const due = createdAt === null ? null : createdAt + PENDING_CLOCK_DELAY_MS;
  const shown = due !== null && now >= due;
  useEffect(() => {
    if (due === null || shown) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, due - Date.now()));
    return () => clearTimeout(timer);
  }, [due, shown]);
  return shown;
}

function ReactionPicker({ onPick, onClose }: { onPick: (reaction: Reaction) => void; onClose: () => void }) {
  return (
    <div
      className="reaction-picker"
      role="menu"
      aria-label={S.reactions.title}
      onMouseLeave={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      {REACTION_DEFS.map((def) => (
        <button
          key={def.id}
          type="button"
          role="menuitem"
          className="reaction-option"
          aria-label={def.label}
          title={def.label}
          onClick={(event) => {
            event.stopPropagation();
            onPick(def.id);
            onClose();
          }}
        >
          {def.emoji}
        </button>
      ))}
    </div>
  );
}

export const Bubble = memo(function Bubble({ item, tick, heads, isGroup, selecting, selected, person, handlers }: BubbleProps) {
  const [picking, setPicking] = useState(false);
  const message = item.message;
  const outgoing = item.outgoing;
  const deleted = message?.deleted === true;
  const text = message ? message.text : (outgoing?.text ?? '');
  const reply = message ? message.replyTo : (outgoing?.replyTo ?? null);
  const attachments = message?.attachments ?? [];
  const local = outgoing?.attachments ?? [];
  const hasMedia = attachments.length > 0 || local.length > 0;
  const standaloneMedia = hasMedia && text.trim() === '' && reply === null && !message?.forwardedFrom && !item.showSender;
  const sender = person(item.sender);
  const failed = outgoing?.state === 'failed';
  const clock = usePendingClock(outgoing && !failed ? outgoing.createdAt : null);
  const shownTick = tick === 'pending' && !clock ? undefined : tick;
  const classes = [
    'msg-row',
    item.mine ? 'msg-out' : 'msg-in',
    item.chainedPrev ? 'chained-prev' : '',
    item.chainedNext ? 'chained-next' : '',
    selecting ? 'msg-selecting' : '',
    selected ? 'msg-selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const openMenu = (x: number, y: number) => {
    if (message) handlers.onMenu(message, x, y);
  };

  return (
    <div
      className={classes}
      data-message-id={message?.id}
      data-client-id={outgoing?.clientId}
      id={message ? `msg-${message.id}` : undefined}
      onClick={() => {
        if (selecting && message) handlers.onToggleSelect(message.id);
      }}
    >
      {selecting && message && (
        <span className={`select-mark${selected ? ' select-mark-on' : ''}`} role="checkbox" aria-checked={selected} aria-label={text || S.messageMenu.select}>
          {selected && <Check size={14} aria-hidden="true" />}
        </span>
      )}
      {isGroup && !item.mine && (
        <span className="msg-avatar">
          {item.showSender && <Avatar fileId={sender.avatarFileId} seed={item.sender} name={sender.name} size={32} />}
        </span>
      )}
      <div className="msg-column">
        <div
          className={`bubble${standaloneMedia ? ' bubble-media' : ''}${deleted ? ' bubble-deleted' : ''}`}
          onContextMenu={(event) => {
            if (!message) return;
            event.preventDefault();
            openMenu(event.clientX, event.clientY);
          }}
          onDoubleClick={() => {
            if (message && !deleted && !selecting) handlers.onReply(message);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              openMenu(rect.left + 16, rect.bottom);
            } else if (selecting && message && (event.key === ' ' || event.key === 'Enter')) {
              event.preventDefault();
              handlers.onToggleSelect(message.id);
            }
          }}
          tabIndex={message ? -1 : undefined}
        >
          {item.showSender && (
            <div className="msg-sender" style={{ color: avatarColors(item.sender).name }}>
              {sender.name}
            </div>
          )}
          {deleted ? (
            <div className="msg-text msg-tombstone">
              {S.history.messageDeleted}
              <MetaLine at={item.at} edited={false} overlay={false} />
            </div>
          ) : (
            <>
              {message?.forwardedFrom !== undefined && message.forwardedFrom !== null && (
                <ForwardedHeader name={person(message.forwardedFrom).name} />
              )}
              {reply && <QuoteBlock reply={reply} senderName={person(reply.sender).name} onJump={handlers.onJump} />}
              {hasMedia && <MediaBlock attachments={attachments} local={local} standalone={standaloneMedia} onOpenImage={handlers.onOpenImage} />}
              {text.trim() !== '' || !standaloneMedia ? (
                <div className="msg-text">
                  <Linkified text={text} />
                  <MetaLine at={item.at} edited={message?.editedAt !== null && message?.editedAt !== undefined} overlay={false} />
                </div>
              ) : (
                <MetaLine at={item.at} edited={false} overlay />
              )}
            </>
          )}
        </div>
        {message && message.reactions.length > 0 && (
          <div className="reaction-bar">
            {message.reactions.map((r) => {
              const def = reactionDef(r.reaction);
              return (
                <button
                  key={r.reaction}
                  type="button"
                  className={`reaction-chip${r.mine ? ' reaction-mine' : ''}`}
                  aria-pressed={r.mine}
                  aria-label={`${def.label} ${r.count}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    handlers.onReact(message, nextReaction(message.reactions, r.reaction));
                  }}
                >
                  <span aria-hidden="true">{def.emoji}</span>
                  <span>{r.count}</span>
                </button>
              );
            })}
          </div>
        )}
        {heads && heads.length > 0 && (
          <div className="read-heads" data-heads={heads.join(',')}>
            {heads.slice(0, 5).map((uin) => {
              const reader = person(uin);
              return <Avatar key={uin} fileId={reader.avatarFileId} seed={uin} name={reader.name} size={16} />;
            })}
          </div>
        )}
      </div>
      {message && !deleted && !selecting && (
        <span className="msg-hover">
          <button
            type="button"
            className="icon-button msg-react-button"
            aria-label={S.reactions.title}
            aria-expanded={picking}
            onClick={(event) => {
              event.stopPropagation();
              setPicking((open) => !open);
            }}
          >
            <SmilePlus size={18} />
          </button>
          {picking && <ReactionPicker onPick={(reaction) => handlers.onReact(message, nextReaction(message.reactions, reaction))} onClose={() => setPicking(false)} />}
        </span>
      )}
      {failed && outgoing ? (
        <button type="button" className="msg-tick msg-retry" title={S.history.failed} aria-label={S.history.failed} onClick={() => handlers.onRetry(outgoing.clientId)}>
          <TickIcon tick="failed" />
        </button>
      ) : (
        shownTick && (
          <span className="msg-tick">
            <TickIcon tick={shownTick} />
          </span>
        )
      )}
    </div>
  );
});
