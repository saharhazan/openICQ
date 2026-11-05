/** Events the server pushes to every open session of the users concerned. */
import { z } from 'zod';
import { chatSchema, idSchema, messageSchema, presenceSchema, uinSchema, userSchema } from './domain.ts';

export const serverEventSchema = z.discriminatedUnion('type', [
  /** A new message, with the chat row as it now stands for the receiver. */
  z.object({ type: z.literal('message'), message: messageSchema, chat: chatSchema, users: z.array(userSchema) }),
  /** Edited, deleted for all, or reactions changed. */
  z.object({ type: z.literal('message.updated'), message: messageSchema }),
  /** "Delete for me" or "Clear history" from another device of the same user. */
  z.object({ type: z.literal('messages.removed'), chatId: idSchema, messageIds: z.array(idSchema) }),
  z.object({ type: z.literal('chat.updated'), chat: chatSchema, users: z.array(userSchema) }),
  /** Hidden, left, or removed from the group. */
  z.object({ type: z.literal('chat.removed'), chatId: idSchema }),
  /** A member's read mark moved. */
  z.object({ type: z.literal('read'), chatId: idSchema, uin: uinSchema, messageId: idSchema }),
  /** A member's client received messages up to this id. */
  z.object({ type: z.literal('delivered'), chatId: idSchema, uin: uinSchema, messageId: idSchema }),
  z.object({ type: z.literal('typing'), chatId: idSchema, uin: uinSchema }),
  z.object({ type: z.literal('presence'), uin: uinSchema, presence: presenceSchema }),
  /** Profile, nickname, avatar or contact state of a user changed. */
  z.object({ type: z.literal('user.updated'), user: userSchema }),
  z.object({ type: z.literal('contacts.changed'), contacts: z.array(uinSchema) }),
  /** This session was closed from "Session List" on another device, or signed out. */
  z.object({ type: z.literal('session.closed'), reason: z.enum(['closed_remotely', 'signed_out']) }),
]);
export type ServerEvent = z.infer<typeof serverEventSchema>;
export type ServerEventType = ServerEvent['type'];
