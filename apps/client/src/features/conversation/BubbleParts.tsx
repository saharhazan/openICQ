/** The inner blocks of a bubble: quote, forwarded header, attachments and the time line. */
import { FileText } from 'lucide-react';
import type { Attachment, ReplyPreview } from '@openicq/protocol';
import { useServices } from '../../app/AppContext';
import { fitPreview } from '../../app/attachments';
import { formatSize, formatTime } from '../../state/format';
import type { LocalAttachment } from '../../state/types';
import { S, fmt } from '../../strings';
import { avatarColors } from '../../ui/avatarPalette';

export function QuoteBlock({ reply, senderName, onJump }: { reply: ReplyPreview; senderName: string; onJump: (messageId: number) => void }) {
  const text = reply.deleted ? S.history.messageDeleted : reply.text || (reply.hasAttachments ? S.recents.file : '');
  return (
    <button
      type="button"
      className="quote-block"
      onClick={(event) => {
        event.stopPropagation();
        onJump(reply.messageId);
      }}
    >
      <span className="quote-sender" style={{ color: avatarColors(reply.sender).name }}>
        {senderName}
      </span>
      <span className={`quote-text${reply.deleted ? ' quote-deleted' : ''}`}>{text}</span>
    </button>
  );
}

export function ForwardedHeader({ name }: { name: string | null }) {
  return <div className="forwarded">{name ? fmt(S.history.forwardedFrom, name) : S.history.forwardedMessage}</div>;
}

export interface MediaProps {
  attachments: readonly Attachment[];
  local: readonly LocalAttachment[];
  standalone: boolean;
  onOpenImage: (attachment: Attachment) => void;
}

/** Images up to 360 x 360 and file cards (320, up to 580) of MessageStyle.cpp. */
export function MediaBlock({ attachments, local, standalone, onOpenImage }: MediaProps) {
  const { api } = useServices();
  return (
    <div className={`media-block${standalone ? ' media-standalone' : ''}`}>
      {attachments.map((attachment) => {
        if (attachment.kind === 'image') {
          const size = fitPreview(attachment.width, attachment.height);
          return (
            <button
              key={attachment.fileId}
              type="button"
              className="media-image"
              aria-label={attachment.name}
              style={{ width: size.width, height: size.height }}
              onClick={(event) => {
                event.stopPropagation();
                onOpenImage(attachment);
              }}
            >
              <img src={api.fileUrl(attachment.fileId)} alt={attachment.name} width={size.width} height={size.height} loading="lazy" draggable={false} />
            </button>
          );
        }
        return (
          <a
            key={attachment.fileId}
            className="file-card"
            href={api.fileUrl(attachment.fileId)}
            download={attachment.name}
            onClick={(event) => event.stopPropagation()}
          >
            <span className="file-icon" aria-hidden="true">
              <FileText size={22} />
            </span>
            <span className="file-text">
              <span className="file-name">{attachment.name}</span>
              <span className="file-size">{formatSize(attachment.size)}</span>
            </span>
          </a>
        );
      })}
      {local.map((file, index) => {
        if (file.kind === 'image' && file.previewUrl) {
          const size = fitPreview(file.width, file.height);
          return (
            <span key={`local-${index}`} className="media-image media-pending" style={{ width: size.width, height: size.height }}>
              <img src={file.previewUrl} alt={file.name} width={size.width} height={size.height} draggable={false} />
            </span>
          );
        }
        return (
          <span key={`local-${index}`} className="file-card media-pending">
            <span className="file-icon" aria-hidden="true">
              <FileText size={22} />
            </span>
            <span className="file-text">
              <span className="file-name">{file.name}</span>
              <span className="file-size">{formatSize(file.size)}</span>
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** Time inside the bubble (10 px), with "edited"; on media it sits on a dark pill. */
export function MetaLine({ at, edited, overlay }: { at: Date; edited: boolean; overlay: boolean }) {
  return (
    <span className={`msg-meta${overlay ? ' msg-meta-overlay' : ''}`} title={at.toLocaleString()}>
      {edited && <span className="msg-edited">{S.history.edited}</span>}
      <time dateTime={at.toISOString()}>{formatTime(at)}</time>
    </span>
  );
}
