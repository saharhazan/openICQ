/**
 * Server to client push events. The server sends these without a request,
 * for example when a contact changes status or a message arrives.
 */
import { z } from 'zod';
import { chatMessageSchema, contactSchema, statusSchema, systemNoticeSchema, uinSchema } from './domain.ts';

export const serverEventSchema = z.discriminatedUnion('type', [
  /** A contact's status as visible to the recipient changed. */
  z.object({ type: z.literal('presence'), uin: uinSchema, status: statusSchema }),
  /** A new incoming message (or a copy of an own message sent from another window). */
  z.object({ type: z.literal('message'), message: chatMessageSchema }),
  /** A new system notice. */
  z.object({ type: z.literal('notice'), notice: systemNoticeSchema }),
  /** A contact entry changed (authorization granted, alias, status). */
  z.object({ type: z.literal('contact.updated'), contact: contactSchema }),
  z.object({ type: z.literal('contact.removed'), uin: uinSchema }),
  /** The same UIN signed in from another location; this connection is closed after the event. */
  z.object({ type: z.literal('session.kicked'), reason: z.enum(['other_location', 'signed_out']) }),
]);
export type ServerEvent = z.infer<typeof serverEventSchema>;
export type ServerEventType = ServerEvent['type'];
export type ServerEventOf<T extends ServerEventType> = Extract<ServerEvent, { type: T }>;
