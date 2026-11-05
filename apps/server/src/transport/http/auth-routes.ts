/** REST endpoints for registration and the sign-in session (cookie based). */
import {
  API_PATHS,
  SESSION_COOKIE,
  loginBodySchema,
  registerBodySchema,
  type RegisterResult,
  type SessionInfo,
} from '@openicq/protocol';
import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  LOGIN_FAILED_MESSAGE,
  type AuthService,
  type AuthenticatedSession,
  type LoginOutcome,
} from '../../application/auth-service.ts';
import { describeDevice } from '../../domain/device.ts';
import { DomainError } from '../../domain/errors.ts';
import type { OriginPolicy } from '../origin-policy.ts';
import type { SlidingWindowRateLimiter } from '../rate-limiter.ts';
import { describeZodError } from '../validation.ts';
import type { ConnectionLifecycle } from '../ws/connection-lifecycle.ts';
import { sendError } from './errors.ts';

export const NOT_SIGNED_IN_MESSAGE = 'You are not signed in.';

export interface AuthRoutesDeps {
  readonly auth: AuthService;
  readonly lifecycle: ConnectionLifecycle;
  readonly origins: OriginPolicy;
  readonly cookieSecure: boolean;
  readonly loginLimiter: SlidingWindowRateLimiter;
  readonly registerLimiter: SlidingWindowRateLimiter;
}

export type Guard = (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;

export function originGuard(origins: OriginPolicy): Guard {
  return async (request, reply) => {
    if (origins.isAllowed(request.headers.origin)) return undefined;
    request.log.warn({ origin: request.headers.origin }, 'request origin rejected');
    return sendError(reply, 'forbidden', 'Request origin is not allowed.');
  };
}

function rateGuard(limiter: SlidingWindowRateLimiter): Guard {
  return async (request, reply) => {
    const decision = limiter.attempt(request.ip);
    if (decision.allowed) return undefined;
    reply.header('retry-after', String(Math.ceil(decision.retryAfterMs / 1000)));
    return sendError(reply, 'rate_limited', 'Too many attempts. Please wait a while and try again.');
  };
}

/** The signed-in session behind the request's cookie, or null. */
export function sessionOf(auth: AuthService, request: FastifyRequest): AuthenticatedSession | null {
  return auth.authenticate(request.cookies[SESSION_COOKIE]);
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRoutesDeps): void {
  const cookieBase: CookieSerializeOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: deps.cookieSecure,
  };
  const checkOrigin = originGuard(deps.origins);

  app.post(API_PATHS.register, { onRequest: [checkOrigin, rateGuard(deps.registerLimiter)] }, async (request, reply) => {
    const body = registerBodySchema.safeParse(request.body);
    if (!body.success) return sendError(reply, 'bad_request', describeZodError(body.error));
    const result: RegisterResult = await deps.auth.register(body.data);
    request.log.info({ uin: result.uin }, 'user registered');
    return reply.code(201).send(result);
  });

  app.post(API_PATHS.login, { onRequest: [checkOrigin, rateGuard(deps.loginLimiter)] }, async (request, reply) => {
    // Every sign-in failure, a malformed body included, gets the same answer.
    // The log names the login that failed, never the password.
    const body = loginBodySchema.safeParse(request.body);
    if (!body.success) {
      request.log.warn('sign-in failed, malformed body');
      return sendError(reply, 'unauthorized', LOGIN_FAILED_MESSAGE);
    }
    let outcome: LoginOutcome;
    try {
      outcome = await deps.auth.login({ ...body.data, device: describeDevice(request.headers['user-agent']) });
    } catch (error) {
      if (error instanceof DomainError && error.code === 'unauthorized') request.log.warn({ login: body.data.login }, 'sign-in failed');
      throw error;
    }
    const options =
      outcome.cookieMaxAgeSeconds === null ? cookieBase : { ...cookieBase, maxAge: outcome.cookieMaxAgeSeconds };
    reply.setCookie(SESSION_COOKIE, outcome.token, options);
    const info: SessionInfo = { uin: outcome.uin };
    return reply.send(info);
  });

  /** Signs out the current session only; its sockets get `session.closed` (`signed_out`) and close with 4003. */
  app.post(API_PATHS.logout, { onRequest: [checkOrigin] }, async (request, reply) => {
    const sessionId = deps.auth.logout(request.cookies[SESSION_COOKIE]);
    if (sessionId !== null) deps.lifecycle.closeSessions([sessionId], 'signed_out');
    reply.clearCookie(SESSION_COOKIE, cookieBase);
    return reply.code(204).send();
  });

  app.get(API_PATHS.session, async (request, reply) => {
    const session = sessionOf(deps.auth, request);
    if (session === null) {
      if (request.cookies[SESSION_COOKIE] !== undefined) reply.clearCookie(SESSION_COOKIE, cookieBase);
      return sendError(reply, 'unauthorized', NOT_SIGNED_IN_MESSAGE);
    }
    const info: SessionInfo = { uin: session.uin };
    return reply.send(info);
  });
}
