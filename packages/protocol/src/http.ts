/**
 * REST endpoints: sign-up and sign-in before a WebSocket exists, and files.
 * The session travels in an HttpOnly cookie, never in JavaScript.
 */
import { z } from 'zod';
import { LIMITS, attachmentSchema, emailSchema, nicknameSchema, protocolErrorSchema, singleLine, uinSchema } from './domain.ts';

export const API_PATHS = {
  register: '/api/auth/register',
  login: '/api/auth/login',
  logout: '/api/auth/logout',
  session: '/api/auth/session',
  /** POST multipart (field `file`) to upload; GET `${files}/:id` to download. */
  files: '/api/files',
  health: '/api/health',
} as const;

export const SESSION_COOKIE = 'openicq_session';

/** Sign-up without SMS: a name and a password; a nickname and an email are optional. */
export const registerBodySchema = z.object({
  firstName: singleLine(LIMITS.personName).min(1, 'First name is required'),
  lastName: singleLine(LIMITS.personName).default(''),
  nickname: nicknameSchema.nullable().default(null),
  email: z.union([z.literal(''), emailSchema]).default(''),
  password: z.string().min(LIMITS.passwordMin).max(LIMITS.passwordMax),
});
export type RegisterBody = z.input<typeof registerBodySchema>;

export const registerResultSchema = z.object({ uin: uinSchema });
export type RegisterResult = z.infer<typeof registerResultSchema>;

/** "Sign in by password": the login is an ICQ# or an email. */
export const loginBodySchema = z.object({
  login: z.string().trim().min(1).max(LIMITS.email),
  password: z.string().min(1).max(LIMITS.passwordMax),
  /** "Keep me signed in" (on by default in ICQ New). */
  keepSignedIn: z.boolean().default(true),
});
export type LoginBody = z.input<typeof loginBodySchema>;

export const sessionInfoSchema = z.object({ uin: uinSchema });
export type SessionInfo = z.infer<typeof sessionInfoSchema>;

/** What an upload is for: avatars are visible to every signed-in user, attachments to the chat's members. */
export const FILE_PURPOSES = ['attachment', 'avatar'] as const;
export const filePurposeSchema = z.enum(FILE_PURPOSES);
export type FilePurpose = z.infer<typeof filePurposeSchema>;

export const uploadResultSchema = z.object({ file: attachmentSchema });
export type UploadResult = z.infer<typeof uploadResultSchema>;

export const httpErrorBodySchema = z.object({ error: protocolErrorSchema });
export type HttpErrorBody = z.infer<typeof httpErrorBodySchema>;
