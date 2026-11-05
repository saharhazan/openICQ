/**
 * Client to server requests sent over the WebSocket.
 *
 * Each request type has a payload schema (validated by the server) and a
 * result schema (validated by the client). Adding a request means adding one
 * entry to both maps; the router and the typed client pick it up from here.
 */
import { z } from 'zod';
import {
  LIMITS,
  chatMessageSchema,
  contactSchema,
  multiLine,
  notInListEntrySchema,
  profileSchema,
  profileUpdateSchema,
  searchQuerySchema,
  searchResultSchema,
  settableStatusSchema,
  settingsSchema,
  settingsUpdateSchema,
  singleLine,
  statusSchema,
  systemNoticeSchema,
  uinSchema,
} from './domain.ts';

const noticeIdSchema = z.number().int().positive();
const emptySchema = z.object({}).strict();

export const requestPayloadSchemas = {
  /** First request after connecting: announces the initial status and returns the snapshot. */
  'session.start': z.object({ status: settableStatusSchema }),
  'status.set': z.object({
    status: settableStatusSchema,
    /** Replaces the stored status message for a status that carries one (see STATUS_MESSAGE_STATUSES). */
    awayMessage: multiLine(LIMITS.awayMessage).optional(),
  }),
  'contact.add': z.object({
    uin: uinSchema,
    nickname: singleLine(LIMITS.nickname).optional(),
    /** Text of the authorization request, used when the target requires authorization. */
    reason: multiLine(LIMITS.reason).default(''),
  }),
  'contact.remove': z.object({ uin: uinSchema }),
  'contact.rename': z.object({ uin: uinSchema, nickname: singleLine(LIMITS.nickname).min(1) }),
  'auth.request': z.object({ uin: uinSchema, reason: multiLine(LIMITS.reason).default('') }),
  'auth.respond': z.object({
    noticeId: noticeIdSchema,
    grant: z.boolean(),
    reason: multiLine(LIMITS.reason).default(''),
  }),
  'notice.dismiss': z.object({ noticeId: noticeIdSchema }),
  'message.send': z.object({
    to: uinSchema,
    text: multiLine(LIMITS.messageText).refine((text) => text.trim().length > 0, 'Message is empty'),
    /** "Send Urgent" (only meaningful when the recipient is Occupied). */
    urgent: z.boolean().default(false),
  }),
  /** Marks every unread message from `from` as read. */
  'message.markRead': z.object({ from: uinSchema }),
  'history.get': z.object({
    uin: uinSchema,
    /** Return messages older than this id (exclusive). Omit for the newest page. */
    beforeId: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(LIMITS.historyPageMax).default(LIMITS.historyPageDefault),
  }),
  'search.users': searchQuerySchema,
  'profile.get': z.object({ uin: uinSchema }),
  'profile.update': profileUpdateSchema,
  /** "Read Away Message" on a contact (also returns the Free For Chat message). */
  'away.get': z.object({ uin: uinSchema }),
  'settings.update': settingsUpdateSchema,
  'ignore.add': z.object({ uin: uinSchema }),
  'ignore.remove': z.object({ uin: uinSchema }),
  'password.change': z.object({
    currentPassword: z.string().min(1).max(LIMITS.passwordMax),
    newPassword: z.string().min(LIMITS.passwordMin).max(LIMITS.passwordMax),
  }),
  'ping': emptySchema,
} as const;

export const sessionSnapshotSchema = z.object({
  self: profileSchema,
  settings: settingsSchema,
  status: statusSchema,
  contacts: z.array(contactSchema),
  notices: z.array(systemNoticeSchema),
  /** Unread messages, including offline messages, oldest first. */
  unread: z.array(chatMessageSchema),
  notInList: z.array(notInListEntrySchema),
  ignored: z.array(uinSchema),
  serverTime: z.string(),
});
export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>;

export const autoResponseSchema = z.object({
  status: statusSchema,
  text: z.string(),
});
export type AutoResponse = z.infer<typeof autoResponseSchema>;

export const requestResultSchemas = {
  'session.start': sessionSnapshotSchema,
  'status.set': z.object({ status: statusSchema }),
  'contact.add': z.object({ contact: contactSchema }),
  'contact.remove': z.object({}),
  'contact.rename': z.object({ contact: contactSchema }),
  'auth.request': z.object({}),
  'auth.respond': z.object({}),
  'notice.dismiss': z.object({}),
  'message.send': z.object({
    message: chatMessageSchema,
    /** Present when the recipient is in an away-like status. */
    autoResponse: autoResponseSchema.nullable(),
  }),
  'message.markRead': z.object({ count: z.number().int().min(0) }),
  'history.get': z.object({ messages: z.array(chatMessageSchema), hasMore: z.boolean() }),
  'search.users': z.object({ results: z.array(searchResultSchema) }),
  'profile.get': z.object({ profile: profileSchema }),
  'profile.update': z.object({ profile: profileSchema }),
  'away.get': z.object({ status: statusSchema, text: z.string() }),
  'settings.update': z.object({ settings: settingsSchema }),
  'ignore.add': z.object({}),
  'ignore.remove': z.object({}),
  'password.change': z.object({}),
  'ping': z.object({ serverTime: z.string() }),
} as const satisfies Record<keyof typeof requestPayloadSchemas, z.ZodType>;

export type RequestType = keyof typeof requestPayloadSchemas;
export const REQUEST_TYPES = Object.keys(requestPayloadSchemas) as RequestType[];

/** What a caller passes (defaults not yet applied). */
export type RequestInput<T extends RequestType> = z.input<(typeof requestPayloadSchemas)[T]>;
/** What a handler receives after validation. */
export type RequestPayload<T extends RequestType> = z.output<(typeof requestPayloadSchemas)[T]>;
export type RequestResult<T extends RequestType> = z.output<(typeof requestResultSchemas)[T]>;

export function isRequestType(value: string): value is RequestType {
  return Object.hasOwn(requestPayloadSchemas, value);
}
