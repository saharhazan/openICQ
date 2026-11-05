/**
 * Domain vocabulary shared by the ICQ client and server.
 *
 * Every value that crosses the network is described here with a zod schema,
 * so both sides validate the same rules at their boundary.
 */
import { z } from 'zod';

/** Field length limits. Shared so the UI can enforce them before the server does. */
export const LIMITS = {
  nickname: 20,
  personName: 32,
  email: 64,
  passwordMin: 6,
  passwordMax: 64,
  /** ICQ 2001b: "Message exceeds server limit (450 chars)." */
  messageText: 450,
  /** ICQ 2000b/2001b: RealAwayMessage range 0..500. */
  awayMessage: 500,
  reason: 500,
  about: 1000,
  city: 40,
  country: 40,
  homepage: 120,
  searchResults: 50,
  historyPageMax: 100,
  historyPageDefault: 50,
} as const;

export const UIN_MIN = 10000;
export const UIN_MAX = 2_147_483_647;

export const uinSchema = z.number().int().min(UIN_MIN).max(UIN_MAX);
export type Uin = z.infer<typeof uinSchema>;

// These patterns exist to match control characters, which is what no-control-regex forbids.
/** Control characters except tab, line feed and carriage return. */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
/** Control characters including line breaks (single-line fields). */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_SINGLE_LINE_CHARS = /[\u0000-\u001f\u007f]/;

/** A single-line, trimmed text field such as a nickname or a city. */
export function singleLine(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .refine((value) => !FORBIDDEN_SINGLE_LINE_CHARS.test(value), 'Contains control characters');
}

/** A multi-line text field such as a message or an away message. */
export function multiLine(max: number) {
  return z
    .string()
    .max(max)
    .refine((value) => !FORBIDDEN_CONTROL_CHARS.test(value), 'Contains control characters');
}

/**
 * ICQ statuses. `invisible` is the classic "Privacy (Invisible)" mode and
 * `offline` is never set by a user directly: it means "not connected".
 */
export const STATUSES = ['online', 'ffc', 'away', 'na', 'occupied', 'dnd', 'invisible', 'offline'] as const;
export const statusSchema = z.enum(STATUSES);
export type Status = z.infer<typeof statusSchema>;

export const settableStatusSchema = z.enum(['online', 'ffc', 'away', 'na', 'occupied', 'dnd', 'invisible']);
export type SettableStatus = z.infer<typeof settableStatusSchema>;

/** Statuses that carry an away message (auto-response). */
export const AWAY_STATUSES = ['away', 'na', 'occupied', 'dnd'] as const;
export type AwayStatus = (typeof AWAY_STATUSES)[number];
export const awayStatusSchema = z.enum(AWAY_STATUSES);

export function isAwayStatus(status: Status): status is AwayStatus {
  return (AWAY_STATUSES as readonly Status[]).includes(status);
}

/**
 * Statuses that carry a status message: the four away-like ones plus
 * Free For Chat ("Chat Mode Message"). Choosing one of them opens the
 * "Change / Confirm ... Message" dialog, and others can read the message.
 */
export const STATUS_MESSAGE_STATUSES = ['away', 'na', 'occupied', 'dnd', 'ffc'] as const;
export type StatusMessageStatus = (typeof STATUS_MESSAGE_STATUSES)[number];

export function hasStatusMessage(status: Status): status is StatusMessageStatus {
  return (STATUS_MESSAGE_STATUSES as readonly Status[]).includes(status);
}

/** Statuses in which normal (non-urgent) messages arrive silently, "to the Contact List". */
export const SILENT_DELIVERY_STATUSES = ['occupied', 'dnd'] as const;

export const genderSchema = z.enum(['unspecified', 'female', 'male']);
export type Gender = z.infer<typeof genderSchema>;

const emailOrEmpty = z
  .string()
  .trim()
  .max(LIMITS.email)
  .refine((value) => value === '' || z.email().safeParse(value).success, 'Invalid email address');

const homepageOrEmpty = z
  .string()
  .trim()
  .max(LIMITS.homepage)
  .refine((value) => value === '' || /^https?:\/\/[^\s]+$/i.test(value), 'Homepage must start with http:// or https://');

/** Public user details, as shown in "User Details" and search results. */
export const profileSchema = z.object({
  uin: uinSchema,
  nickname: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  /** Empty when the owner chose to hide it. */
  email: z.string(),
  gender: genderSchema,
  age: z.number().int().min(0).max(150).nullable(),
  country: z.string(),
  city: z.string(),
  homepage: z.string(),
  about: z.string(),
  authRequired: z.boolean(),
  webAware: z.boolean(),
});
export type Profile = z.infer<typeof profileSchema>;

/** The fields a user may edit on their own details. */
export const profileUpdateSchema = z
  .object({
    nickname: singleLine(LIMITS.nickname).min(1),
    firstName: singleLine(LIMITS.personName),
    lastName: singleLine(LIMITS.personName),
    email: emailOrEmpty,
    gender: genderSchema,
    age: z.number().int().min(0).max(150).nullable(),
    country: singleLine(LIMITS.country),
    city: singleLine(LIMITS.city),
    homepage: homepageOrEmpty,
    about: multiLine(LIMITS.about),
  })
  .partial();
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

/** Client-side behaviour preferences, stored on the server so they follow the user. */
export const preferencesSchema = z.object({
  soundsEnabled: z.boolean(),
  /** Open the message window automatically instead of blinking the contact. */
  popupIncoming: z.boolean(),
  /** Minutes of inactivity before switching to Away. 0 disables. */
  autoAwayMinutes: z.number().int().min(0).max(240),
  /** Minutes in Away mode before switching to N/A ("minutes of Away mode"). 0 disables. */
  autoNaMinutes: z.number().int().min(0).max(240),
});
export type Preferences = z.infer<typeof preferencesSchema>;

/** Stored status message per status that carries one. */
export const awayMessagesSchema = z.object({
  away: z.string(),
  na: z.string(),
  occupied: z.string(),
  dnd: z.string(),
  ffc: z.string(),
});
export type AwayMessages = z.infer<typeof awayMessagesSchema>;

/** Private settings of the signed-in user. */
export const settingsSchema = z.object({
  authRequired: z.boolean(),
  webAware: z.boolean(),
  hideEmail: z.boolean(),
  preferences: preferencesSchema,
  awayMessages: awayMessagesSchema,
});
export type Settings = z.infer<typeof settingsSchema>;

export const settingsUpdateSchema = z
  .object({
    authRequired: z.boolean(),
    webAware: z.boolean(),
    hideEmail: z.boolean(),
    preferences: preferencesSchema.partial(),
    awayMessages: z
      .object({
        away: multiLine(LIMITS.awayMessage),
        na: multiLine(LIMITS.awayMessage),
        occupied: multiLine(LIMITS.awayMessage),
        dnd: multiLine(LIMITS.awayMessage),
        ffc: multiLine(LIMITS.awayMessage),
      })
      .partial(),
  })
  .partial();
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

/** One entry of the signed-in user's contact list, as the owner sees it. */
export const contactSchema = z.object({
  uin: uinSchema,
  /** The owner's local alias for the contact (defaults to the contact's nickname). */
  nickname: z.string(),
  /** Status as visible to the owner. `offline` while authorization is pending. */
  status: statusSchema,
  /** True until the contact grants authorization. */
  awaitingAuth: z.boolean(),
});
export type Contact = z.infer<typeof contactSchema>;

export const messageKindSchema = z.enum(['normal', 'auto']);
export type MessageKind = z.infer<typeof messageKindSchema>;

export const chatMessageSchema = z.object({
  id: z.number().int().positive(),
  from: uinSchema,
  to: uinSchema,
  text: z.string(),
  kind: messageKindSchema,
  /** ISO 8601 timestamp set by the server. */
  sentAt: z.string(),
  /** True when the message was stored while the recipient was offline. */
  deliveredOffline: z.boolean(),
  /**
   * "Send Urgent" to an Occupied user. Non-urgent messages to Occupied/DND
   * users are "sent to the Contact List": shown without sound or pop-up.
   */
  urgent: z.boolean(),
  read: z.boolean(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const NOTICE_KINDS = ['auth_request', 'auth_granted', 'auth_denied', 'added_you'] as const;
export const noticeKindSchema = z.enum(NOTICE_KINDS);
export type NoticeKind = z.infer<typeof noticeKindSchema>;

/** A "System Notice": authorization traffic and "you were added" events. */
export const systemNoticeSchema = z.object({
  id: z.number().int().positive(),
  kind: noticeKindSchema,
  from: uinSchema,
  fromNickname: z.string(),
  reason: z.string(),
  createdAt: z.string(),
});
export type SystemNotice = z.infer<typeof systemNoticeSchema>;

/** A sender of unread messages who is not in the owner's contact list. */
export const notInListEntrySchema = z.object({
  uin: uinSchema,
  nickname: z.string(),
});
export type NotInListEntry = z.infer<typeof notInListEntrySchema>;

export const searchQuerySchema = z.discriminatedUnion('by', [
  z.object({ by: z.literal('uin'), uin: uinSchema }),
  z.object({ by: z.literal('email'), email: z.string().trim().min(3).max(LIMITS.email) }),
  z
    .object({
      by: z.literal('details'),
      nickname: singleLine(LIMITS.nickname).default(''),
      firstName: singleLine(LIMITS.personName).default(''),
      lastName: singleLine(LIMITS.personName).default(''),
    })
    .refine((q) => q.nickname !== '' || q.firstName !== '' || q.lastName !== '', 'Enter at least one search field'),
]);
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchResultSchema = z.object({
  uin: uinSchema,
  nickname: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  authRequired: z.boolean(),
  /** Known only when the user is "Web Aware"; null otherwise. */
  online: z.boolean().nullable(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const ERROR_CODES = [
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'not_connected',
  'timeout',
  'internal',
] as const;
export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const protocolErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
});
export type ProtocolError = z.infer<typeof protocolErrorSchema>;
