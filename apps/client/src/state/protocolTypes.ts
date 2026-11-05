/** Type-only re-exports from the wire contract, so state modules import from one place. */
export type {
  AccountSettings,
  Attachment,
  Chat,
  ChatEvent,
  GroupInfo,
  Id,
  Me,
  Member,
  MemberRole,
  Message,
  Presence,
  Reaction,
  ReactionCount,
  ReadMark,
  ReplyPreview,
  SessionEntry,
  SessionSnapshot,
  ServerEvent,
  Uin,
  User,
} from '@openicq/protocol';

/** `image` or `file`, as in attachmentSchema. */
export type AttachmentKind = 'image' | 'file';
