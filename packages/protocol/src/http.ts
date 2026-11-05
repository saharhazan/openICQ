/**
 * REST endpoints used before a WebSocket exists: registration and sign-in.
 * The session itself travels in an HttpOnly cookie, never in JavaScript.
 */
import { z } from 'zod';
import { LIMITS, multiLine, protocolErrorSchema, singleLine, uinSchema } from './domain.ts';

export const API_PATHS = {
  register: '/api/auth/register',
  login: '/api/auth/login',
  logout: '/api/auth/logout',
  session: '/api/auth/session',
  health: '/api/health',
} as const;

export const SESSION_COOKIE = 'icq_session';

export const registerBodySchema = z.object({
  nickname: singleLine(LIMITS.nickname).min(1, 'Nickname is required'),
  firstName: singleLine(LIMITS.personName).default(''),
  lastName: singleLine(LIMITS.personName).default(''),
  email: z
    .string()
    .trim()
    .max(LIMITS.email)
    .refine((value) => value === '' || z.email().safeParse(value).success, 'Invalid email address')
    .default(''),
  password: z.string().min(LIMITS.passwordMin).max(LIMITS.passwordMax),
  /** Default "All users may add me to their Contact List". */
  authRequired: z.boolean().default(false),
  about: multiLine(LIMITS.about).default(''),
});
export type RegisterBody = z.input<typeof registerBodySchema>;

export const registerResultSchema = z.object({ uin: uinSchema });
export type RegisterResult = z.infer<typeof registerResultSchema>;

export const loginBodySchema = z.object({
  uin: uinSchema,
  password: z.string().min(1).max(LIMITS.passwordMax),
  /** "Save password": keep the session cookie across browser restarts. */
  remember: z.boolean().default(false),
});
export type LoginBody = z.input<typeof loginBodySchema>;

export const sessionInfoSchema = z.object({
  uin: uinSchema,
  nickname: z.string(),
});
export type SessionInfo = z.infer<typeof sessionInfoSchema>;

export const httpErrorBodySchema = z.object({ error: protocolErrorSchema });
export type HttpErrorBody = z.infer<typeof httpErrorBodySchema>;
