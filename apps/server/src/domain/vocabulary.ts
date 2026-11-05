/** Protocol vocabulary the domain layer uses, including the derived types the protocol does not name. */
import type { Attachment, ChatEvent } from '@openicq/protocol';

export type {
  AccountSettings,
  ChatType,
  FilePurpose,
  GroupInvitePolicy,
  MemberRole,
  Reaction,
  Uin,
} from '@openicq/protocol';

export type ChatEventType = ChatEvent['type'];
export type AttachmentKindValue = Attachment['kind'];
export type AssignableRole = 'admin' | 'member' | 'readonly';
