/**
 * Client to server requests over the WebSocket.
 *
 * Each request type has a payload schema (validated by the server) and a
 * result schema (validated by the client). Adding a request means adding one
 * entry to both maps; the router and the typed client pick it up from here.
 */
import { z } from 'zod';
import {
  LIMITS,
  accountSettingsSchema,
  assignableRoleSchema,
  chatSchema,
  groupInvitePolicySchema,
  idSchema,
  meSchema,
  memberSchema,
  messageSchema,
  multiLine,
  profileUpdateSchema,
  reactionSchema,
  readMarkSchema,
  sessionEntrySchema,
  singleLine,
  uinSchema,
  userSchema,
} from './domain.ts';

const emptySchema = z.object({}).strict();
const okSchema = z.object({}).strict();
const uinListSchema = z.array(uinSchema).max(LIMITS.membersPerRequest);
const messageIdListSchema = z.array(idSchema).min(1);
const inviteTokenSchema = z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/);

export const requestPayloadSchemas = {
  /** First request after connecting: returns everything the main window needs. */
  'session.start': emptySchema,

  /** One page of history, newest last. Also returns the read marks of the chat's members. */
  'chat.history': z.object({
    chatId: idSchema,
    beforeId: idSchema.optional(),
    limit: z.number().int().min(1).max(LIMITS.historyPageMax).default(LIMITS.historyPageDefault),
  }),
  /** Opens (or creates) the direct chat with a user. */
  'chat.direct': z.object({ uin: uinSchema }),
  'chat.read': z.object({ chatId: idSchema, messageId: idSchema }),
  'chat.markUnread': z.object({ chatId: idSchema }),
  'chat.update': z.object({ chatId: idSchema, pinned: z.boolean().optional(), muted: z.boolean().optional() }),
  /** "Clear history": hides every current message of the chat, for the viewer only. */
  'chat.clear': z.object({ chatId: idSchema }),
  /** Direct chat: "Hide" (comes back with the next message). Group: "Leave and delete". */
  'chat.remove': z.object({ chatId: idSchema }),
  /** Sent at most every few seconds while the user types. */
  typing: z.object({ chatId: idSchema }),

  'message.send': z.object({
    chatId: idSchema,
    /** Unique per sending client; lets the client match the echo to its pending bubble. */
    clientId: z.string().min(1).max(64),
    text: multiLine(LIMITS.messageText),
    replyToId: idSchema.optional(),
    attachmentFileIds: z.array(idSchema).max(LIMITS.attachmentsPerMessage).default([]),
  }),
  'message.forward': z.object({
    fromChatId: idSchema,
    messageIds: messageIdListSchema.max(LIMITS.forwardMessages),
    toChatId: idSchema,
  }),
  'message.edit': z.object({ messageId: idSchema, text: multiLine(LIMITS.messageText).min(1) }),
  /** "Delete for me" or "Delete for all". */
  'message.delete': z.object({
    chatId: idSchema,
    messageIds: messageIdListSchema.max(LIMITS.deleteMessages),
    forAll: z.boolean(),
  }),
  /** Null removes the viewer's reaction. One reaction per user per message. */
  'message.react': z.object({ messageId: idSchema, reaction: reactionSchema.nullable() }),

  /** By nickname, ICQ#, email or name. */
  'user.search': z.object({ query: singleLine(LIMITS.searchQueryMax).min(LIMITS.searchQueryMin) }),
  'user.get': z.object({ uin: uinSchema }),
  'user.block': z.object({ uin: uinSchema, blocked: z.boolean() }),
  'contact.add': z.object({ uin: uinSchema }),
  'contact.remove': z.object({ uin: uinSchema }),

  'profile.update': profileUpdateSchema,
  'nickname.check': z.object({ nickname: z.string().max(LIMITS.nicknameMax * 2) }),
  'settings.update': z.object({ groupInvites: groupInvitePolicySchema }).partial().strict(),
  'password.change': z.object({
    oldPassword: z.string().min(1).max(LIMITS.passwordMax),
    newPassword: z.string().min(LIMITS.passwordMin).max(LIMITS.passwordMax),
  }),
  'sessions.list': emptySchema,
  /** Closes one session, or every session but this one. */
  'sessions.close': z.union([z.object({ sessionId: idSchema }).strict(), z.object({ others: z.literal(true) }).strict()]),

  'group.create': z.object({
    name: singleLine(LIMITS.groupName).min(1, 'Group name is required'),
    about: multiLine(LIMITS.groupAbout).default(''),
    avatarFileId: idSchema.nullable().default(null),
    memberUins: uinListSchema.default([]),
    joinWithApproval: z.boolean().default(false),
    public: z.boolean().default(false),
  }),
  'group.update': z
    .object({
      chatId: idSchema,
      name: singleLine(LIMITS.groupName).min(1),
      about: multiLine(LIMITS.groupAbout),
      rules: multiLine(LIMITS.groupRules),
      avatarFileId: idSchema.nullable(),
      joinWithApproval: z.boolean(),
      public: z.boolean(),
    })
    .partial()
    .required({ chatId: true }),
  'group.members': z.object({ chatId: idSchema }),
  'group.addMembers': z.object({ chatId: idSchema, uins: uinListSchema.min(1) }),
  'group.removeMember': z.object({ chatId: idSchema, uin: uinSchema }),
  'group.setRole': z.object({ chatId: idSchema, uin: uinSchema, role: assignableRoleSchema }),
  /** "Generate new link": the old link stops working. */
  'group.regenerateLink': z.object({ chatId: idSchema }),
  /** What an invite link opens, before joining. */
  'group.preview': z.object({ inviteToken: inviteTokenSchema }),
  'group.join': z.object({ inviteToken: inviteTokenSchema }),
  'group.requests': z.object({ chatId: idSchema }),
  'group.resolveRequest': z.object({ chatId: idSchema, uin: uinSchema, approve: z.boolean() }),

  ping: emptySchema,
} as const;

export const sessionSnapshotSchema = z.object({
  me: meSchema,
  settings: accountSettingsSchema,
  /** Every chat in the viewer's list (hidden ones excluded). */
  chats: z.array(chatSchema),
  /** Every user the snapshot refers to: peers, contacts, last message senders. */
  users: z.array(userSchema),
  contacts: z.array(uinSchema),
  serverTime: z.string(),
});
export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>;

export const groupPreviewSchema = z.object({
  chatId: idSchema,
  title: z.string(),
  about: z.string(),
  avatarFileId: idSchema.nullable(),
  membersCount: z.number().int().nonnegative(),
  joinWithApproval: z.boolean(),
  /** "member" when already in, "pending" while a join request waits. */
  state: z.enum(['none', 'member', 'pending']),
});
export type GroupPreview = z.infer<typeof groupPreviewSchema>;

export const requestResultSchemas = {
  'session.start': sessionSnapshotSchema,
  'chat.history': z.object({
    messages: z.array(messageSchema),
    users: z.array(userSchema),
    readMarks: z.array(readMarkSchema),
    hasMore: z.boolean(),
  }),
  'chat.direct': z.object({ chat: chatSchema, users: z.array(userSchema) }),
  'chat.read': okSchema,
  'chat.markUnread': okSchema,
  'chat.update': z.object({ chat: chatSchema }),
  'chat.clear': okSchema,
  'chat.remove': okSchema,
  typing: okSchema,
  'message.send': z.object({ message: messageSchema }),
  'message.forward': z.object({ messages: z.array(messageSchema) }),
  'message.edit': z.object({ message: messageSchema }),
  'message.delete': okSchema,
  'message.react': z.object({ message: messageSchema }),
  'user.search': z.object({ users: z.array(userSchema) }),
  'user.get': z.object({ user: userSchema }),
  'user.block': z.object({ user: userSchema }),
  'contact.add': z.object({ user: userSchema }),
  'contact.remove': okSchema,
  'profile.update': z.object({ me: meSchema }),
  'nickname.check': z.object({ available: z.boolean(), reason: z.enum(['taken', 'invalid']).nullable() }),
  'settings.update': z.object({ settings: accountSettingsSchema }),
  'password.change': okSchema,
  'sessions.list': z.object({ sessions: z.array(sessionEntrySchema) }),
  'sessions.close': okSchema,
  'group.create': z.object({ chat: chatSchema, users: z.array(userSchema) }),
  'group.update': z.object({ chat: chatSchema }),
  'group.members': z.object({ members: z.array(memberSchema), users: z.array(userSchema) }),
  /** Users whose "Who can add me to groups" refused the invitation get an invite link instead. */
  'group.addMembers': z.object({ added: z.array(uinSchema), refused: z.array(uinSchema) }),
  'group.removeMember': okSchema,
  'group.setRole': okSchema,
  'group.regenerateLink': z.object({ inviteToken: z.string() }),
  'group.preview': z.object({ group: groupPreviewSchema }),
  'group.join': z.object({ state: z.enum(['member', 'pending']), chat: chatSchema.nullable() }),
  'group.requests': z.object({
    requests: z.array(z.object({ uin: uinSchema, requestedAt: z.string() })),
    users: z.array(userSchema),
  }),
  'group.resolveRequest': okSchema,
  ping: z.object({ serverTime: z.string() }),
} as const satisfies Record<keyof typeof requestPayloadSchemas, z.ZodType>;

export type RequestType = keyof typeof requestPayloadSchemas;
export const REQUEST_TYPES = Object.keys(requestPayloadSchemas) as RequestType[];

/** What a caller passes (defaults not yet applied). */
export type RequestInput<T extends RequestType> = z.input<(typeof requestPayloadSchemas)[T]>;
/** What the server handler receives (after parsing). */
export type RequestPayload<T extends RequestType> = z.output<(typeof requestPayloadSchemas)[T]>;
export type RequestResult<T extends RequestType> = z.output<(typeof requestResultSchemas)[T]>;

export function isRequestType(value: string): value is RequestType {
  return Object.hasOwn(requestPayloadSchemas, value);
}

