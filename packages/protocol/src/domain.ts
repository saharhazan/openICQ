/**
 * Domain vocabulary shared by the openICQ client and server: the ICQ New
 * (2020-2024) model of users, chats, messages, groups and files.
 *
 * Values come from the ICQ New research (docs/research/icq-new-findings.md):
 * nickname rules, the six default reactions, roles, limits. Where the original
 * left something open (edit time limit, file size) the choice is documented here.
 */
import { z } from 'zod';

export const UIN_MIN = 10_000;
export const UIN_MAX = 2_147_483_647;

/** An ICQ number. Still the account id in ICQ New, shown under the profile and usable to sign in. */
export const uinSchema = z.number().int().min(UIN_MIN).max(UIN_MAX);
export type Uin = z.infer<typeof uinSchema>;

/** Ids of chats, messages, files and sessions. */
export const idSchema = z.number().int().positive();
export type Id = z.infer<typeof idSchema>;

export const isoDateSchema = z.iso.datetime();

export const LIMITS = {
  personName: 64,
  /** "About me": up to 120 characters (ICQ New profile). */
  about: 120,
  /** Nickname length, server-adjustable in the original; these are its defaults. */
  nicknameMin: 5,
  nicknameMax: 30,
  email: 254,
  passwordMin: 6,
  passwordMax: 64,
  /** The original kept drafts up to 10,000 characters; messages share the limit. */
  messageText: 10_000,
  groupName: 64,
  groupAbout: 1_000,
  groupRules: 1_000,
  searchQueryMin: 2,
  searchQueryMax: 64,
  searchResults: 50,
  historyPageMax: 100,
  historyPageDefault: 50,
  attachmentsPerMessage: 10,
  forwardMessages: 100,
  deleteMessages: 100,
  membersPerRequest: 100,
  groupMembersMax: 25_000,
  /** Not known for the original; 100 MB, configurable on the server. */
  fileMaxBytes: 100 * 1024 * 1024,
  fileName: 255,
} as const;

// Control characters: C0 controls except tab and newline (multi-line), and DEL.
// eslint-disable-next-line no-control-regex -- matching control characters is the point of this pattern
const SINGLE_LINE_FORBIDDEN = /[\u0000-\u001f\u007f]/;
// eslint-disable-next-line no-control-regex -- matching control characters is the point of this pattern
const MULTI_LINE_FORBIDDEN = /[\u0000-\u0008\u000b-\u001f\u007f]/;

/** Trimmed single-line text without control characters. */
export function singleLine(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .refine((value) => !SINGLE_LINE_FORBIDDEN.test(value), 'Control characters are not allowed');
}

/** Multi-line text (tabs and newlines allowed) without other control characters. Not trimmed. */
export function multiLine(max: number) {
  return z
    .string()
    .max(max)
    .refine((value) => !MULTI_LINE_FORBIDDEN.test(value), 'Control characters are not allowed');
}

/**
 * ICQ New nickname rules: 5 to 30 characters, a-z, 0-9, dot and underscore,
 * starting with a Latin letter. Stored and compared in lower case.
 */
export const NICKNAME_PATTERN = /^[a-z][a-z0-9._]*$/;
export const nicknameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(LIMITS.nicknameMin, `Nickname must be at least ${LIMITS.nicknameMin} characters`)
  .max(LIMITS.nicknameMax, `Nickname must be at most ${LIMITS.nicknameMax} characters`)
  .regex(NICKNAME_PATTERN, 'Use a-z, 0-9, dot and underscore, starting with a letter');

export const emailSchema = z.string().trim().toLowerCase().max(LIMITS.email).pipe(z.email());

/** Last seen: "Online", "Seen 5 minutes ago", "Have never been here". */
export const presenceSchema = z.object({
  online: z.boolean(),
  lastSeen: isoDateSchema.nullable(),
});
export type Presence = z.infer<typeof presenceSchema>;

/** Another user as the viewer sees them. */
export const userSchema = z.object({
  uin: uinSchema,
  nickname: z.string().nullable(),
  firstName: z.string(),
  lastName: z.string(),
  about: z.string(),
  avatarFileId: idSchema.nullable(),
  presence: presenceSchema,
  /** In the viewer's contacts. */
  isContact: z.boolean(),
  /** The viewer blocked this user. */
  blocked: z.boolean(),
});
export type User = z.infer<typeof userSchema>;

/** The signed-in user's own profile. */
export const meSchema = z.object({
  uin: uinSchema,
  nickname: z.string().nullable(),
  firstName: z.string(),
  lastName: z.string(),
  about: z.string(),
  avatarFileId: idSchema.nullable(),
  email: z.string(),
});
export type Me = z.infer<typeof meSchema>;

export const profileUpdateSchema = z
  .object({
    firstName: singleLine(LIMITS.personName).min(1, 'First name is required'),
    lastName: singleLine(LIMITS.personName),
    about: multiLine(LIMITS.about),
    /** Null removes the nickname. */
    nickname: nicknameSchema.nullable(),
    avatarFileId: idSchema.nullable(),
  })
  .partial()
  .strict();
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

/** "Who can add me to groups" (ICQ New Privacy). */
export const GROUP_INVITE_POLICIES = ['everybody', 'contacts', 'nobody'] as const;
export const groupInvitePolicySchema = z.enum(GROUP_INVITE_POLICIES);
export type GroupInvitePolicy = z.infer<typeof groupInvitePolicySchema>;

/** Settings kept on the server (the rest are per device, like in the original desktop app). */
export const accountSettingsSchema = z.object({
  groupInvites: groupInvitePolicySchema,
});
export type AccountSettings = z.infer<typeof accountSettingsSchema>;

/** The six default ICQ New reactions: Like, Super, Funny, Oops, Sad, Scandalous. */
export const REACTIONS = ['like', 'super', 'funny', 'oops', 'sad', 'scandalous'] as const;
export const reactionSchema = z.enum(REACTIONS);
export type Reaction = z.infer<typeof reactionSchema>;

export const CHAT_TYPES = ['direct', 'group', 'favorites'] as const;
export const chatTypeSchema = z.enum(CHAT_TYPES);
export type ChatType = z.infer<typeof chatTypeSchema>;

/** Server roles. The UI shows Creator, Admin, Read only, and nothing for members. */
export const MEMBER_ROLES = ['creator', 'admin', 'member', 'readonly'] as const;
export const memberRoleSchema = z.enum(MEMBER_ROLES);
export type MemberRole = z.infer<typeof memberRoleSchema>;
/** Roles an admin can give with "Assign admin role" and "Ban to write". */
export const ASSIGNABLE_ROLES = ['admin', 'member', 'readonly'] as const;
export const assignableRoleSchema = z.enum(ASSIGNABLE_ROLES);

export const memberSchema = z.object({
  uin: uinSchema,
  role: memberRoleSchema,
  joinedAt: isoDateSchema,
});
export type Member = z.infer<typeof memberSchema>;

export const ATTACHMENT_KINDS = ['image', 'file'] as const;
export const attachmentSchema = z.object({
  fileId: idSchema,
  name: z.string(),
  mime: z.string(),
  size: z.number().int().nonnegative(),
  kind: z.enum(ATTACHMENT_KINDS),
  /** Images only. */
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

/** Group service messages ("chat_event" in the original). */
export const CHAT_EVENT_TYPES = [
  'created',
  'member_added',
  'member_removed',
  'member_left',
  'joined_by_link',
  'role_changed',
  'renamed',
  'about_changed',
  'rules_changed',
  'avatar_changed',
  'link_changed',
  'approval_changed',
] as const;
export const chatEventSchema = z.object({
  type: z.enum(CHAT_EVENT_TYPES),
  actor: uinSchema,
  target: uinSchema.nullable(),
  /** New name, new role and so on. */
  value: z.string().nullable(),
});
export type ChatEvent = z.infer<typeof chatEventSchema>;

export const replyPreviewSchema = z.object({
  messageId: idSchema,
  sender: uinSchema,
  /** First characters of the quoted text; empty for a deleted message. */
  text: z.string(),
  hasAttachments: z.boolean(),
  deleted: z.boolean(),
});
export type ReplyPreview = z.infer<typeof replyPreviewSchema>;

export const reactionCountSchema = z.object({
  reaction: reactionSchema,
  count: z.number().int().positive(),
  /** The viewer chose this reaction. */
  mine: z.boolean(),
});
export type ReactionCount = z.infer<typeof reactionCountSchema>;

export const messageSchema = z.object({
  id: idSchema,
  chatId: idSchema,
  sender: uinSchema,
  /** Echo of the sender's client id, so the sending client can match its pending bubble. */
  clientId: z.string().nullable(),
  text: z.string(),
  /** Set for group service messages; text is then empty. */
  event: chatEventSchema.nullable(),
  replyTo: replyPreviewSchema.nullable(),
  /** "Forwarded from %1". */
  forwardedFrom: uinSchema.nullable(),
  attachments: z.array(attachmentSchema),
  reactions: z.array(reactionCountSchema),
  editedAt: isoDateSchema.nullable(),
  /** "Delete for all": the bubble stays as a tombstone without content. */
  deleted: z.boolean(),
  sentAt: isoDateSchema,
});
export type Message = z.infer<typeof messageSchema>;

export const groupInfoSchema = z.object({
  about: z.string(),
  rules: z.string(),
  /** "Join with Approval". */
  joinWithApproval: z.boolean(),
  /** "Public chat": can be found in the search. */
  public: z.boolean(),
  membersCount: z.number().int().nonnegative(),
  myRole: memberRoleSchema,
  /** Invite link token; admins only, null otherwise. */
  inviteToken: z.string().nullable(),
  /** Join requests waiting for approval; admins only, 0 otherwise. */
  pendingRequests: z.number().int().nonnegative(),
});
export type GroupInfo = z.infer<typeof groupInfoSchema>;

/** One row of the chat list, with what the viewer needs to draw it. */
export const chatSchema = z.object({
  id: idSchema,
  type: chatTypeSchema,
  /** Group name; empty for direct chats and Favorites (the client names those). */
  title: z.string(),
  /** The other user of a direct chat. */
  peer: uinSchema.nullable(),
  avatarFileId: idSchema.nullable(),
  group: groupInfoSchema.nullable(),
  lastMessage: messageSchema.nullable(),
  unread: z.number().int().nonnegative(),
  /** "Mark as unread". Cleared by reading. */
  markedUnread: z.boolean(),
  /** Highest message id the viewer has read. */
  lastReadId: z.number().int().nonnegative(),
  /** Direct chats: how far the peer has received and read. 0 otherwise. */
  peerDeliveredId: z.number().int().nonnegative(),
  peerReadId: z.number().int().nonnegative(),
  pinned: z.boolean(),
  muted: z.boolean(),
  /** Last activity, for ordering. */
  updatedAt: isoDateSchema,
});
export type Chat = z.infer<typeof chatSchema>;

/** Where each member's read and delivery marks are (read heads under messages). */
export const readMarkSchema = z.object({
  uin: uinSchema,
  lastReadId: z.number().int().nonnegative(),
  lastDeliveredId: z.number().int().nonnegative(),
});
export type ReadMark = z.infer<typeof readMarkSchema>;

export const sessionEntrySchema = z.object({
  id: idSchema,
  current: z.boolean(),
  /** A short device description from the user agent ("Chrome on macOS"). */
  device: z.string(),
  createdAt: isoDateSchema,
  lastSeenAt: isoDateSchema,
});
export type SessionEntry = z.infer<typeof sessionEntrySchema>;

export const ERROR_CODES = [
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'too_large',
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
