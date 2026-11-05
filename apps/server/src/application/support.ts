/** Small helpers and lookups shared by the application services. */
import type { ChatRecord, FileRecord, MemberRecord, UserRecord } from '../domain/entities.ts';
import { DomainError } from '../domain/errors.ts';
import type { ConnectionId } from '../domain/ports.ts';
import type { ChatRepository, FileRepository, UserRepository } from '../domain/repositories.ts';
import type { Uin } from '../domain/vocabulary.ts';

/** Who is acting, and from which connection (null for HTTP), so events can skip the origin. */
export interface Actor {
  readonly uin: Uin;
  readonly connectionId: ConnectionId | null;
}

/** Messages the client shows as is. */
export const MESSAGES = {
  chatNotFound: 'Chat not found.',
  messageNotFound: 'Message not found.',
  fileNotFound: 'File not found.',
  writeForbidden: 'You are not a chat member or you are not allowed to write',
  notGroup: 'This is not a group.',
  adminsOnly: 'Only admins can do this.',
  nicknameTaken: 'This nickname is taken',
  invalidAvatar: 'The avatar must be a JPEG, PNG, GIF or WebP image you uploaded as an avatar.',
} as const;

export function unknownUser(uin: Uin): DomainError {
  return new DomainError('not_found', `No ICQ user has the number ${uin}.`);
}

export function requireUser(users: UserRepository, uin: Uin): UserRecord {
  const user = users.findByUin(uin);
  if (user === null) throw unknownUser(uin);
  return user;
}

export interface Membership {
  readonly chat: ChatRecord;
  readonly member: MemberRecord;
}

/** The chat and the viewer's membership. A chat the viewer is not in is reported as not found. */
export function requireMembership(chats: ChatRepository, chatId: number, uin: Uin): Membership {
  const chat = chats.findById(chatId);
  const member = chat === null ? null : chats.findMember(chatId, uin);
  if (chat === null || member === null) throw new DomainError('not_found', MESSAGES.chatNotFound);
  return { chat, member };
}

/** An avatar for a profile or a group: an image the user uploaded with purpose `avatar`. */
export function requireAvatarFile(files: FileRepository, uin: Uin, fileId: number): FileRecord {
  const file = files.findById(fileId);
  if (file === null || file.ownerUin !== uin) throw new DomainError('not_found', MESSAGES.fileNotFound);
  if (file.purpose !== 'avatar' || file.kind !== 'image') throw new DomainError('bad_request', MESSAGES.invalidAvatar);
  return file;
}

/** Distinct values in first-seen order. */
export function unique<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}
