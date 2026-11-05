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
import { LOGIN_FAILED_MESSAGE, type AuthService } from '../../application/auth-service.ts';
import type { OriginPolicy } from '../origin-policy.ts';
import type { SlidingWindowRateLimiter } from '../rate-limiter.ts';
import { describeZodError } from '../validation.ts';
import type { ConnectionLifecycle } from '../ws/connection-lifecycle.ts';
import { sendError } from './errors.ts';

export interface AuthRoutesDeps {
  readonly auth: AuthService;
  readonly lifecycle: ConnectionLifecycle;
  readonly origins: OriginPolicy;
  readonly cookieSecure: boolean;
  readonly loginLimiter: SlidingWindowRateLimiter;
  readonly registerLimiter: SlidingWindowRateLimiter;
}

type Guard = (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;

function originGuard(origins: OriginPolicy): Guard {
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
    const body = loginBodySchema.safeParse(request.body);
    if (!body.success) return sendError(reply, 'unauthorized', LOGIN_FAILED_MESSAGE);
    const outcome = await deps.auth.login(body.data);
    const options =
      outcome.cookieMaxAgeSeconds === null ? cookieBase : { ...cookieBase, maxAge: outcome.cookieMaxAgeSeconds };
    reply.setCookie(SESSION_COOKIE, outcome.token, options);
    const info: SessionInfo = outcome.session;
    return reply.send(info);
  });

  app.post(API_PATHS.logout, { onRequest: [checkOrigin] }, async (request, reply) => {
    const tokenHash = deps.auth.logout(request.cookies[SESSION_COOKIE]);
    if (tokenHash !== null) deps.lifecycle.endSession(tokenHash);
    reply.clearCookie(SESSION_COOKIE, cookieBase);
    return reply.code(204).send();
  });

  app.get(API_PATHS.session, async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    const session = deps.auth.authenticate(token);
    if (session === null) {
      if (token !== undefined) reply.clearCookie(SESSION_COOKIE, cookieBase);
      return sendError(reply, 'unauthorized', 'You are not signed in.');
    }
    const info: SessionInfo = { uin: session.uin, nickname: session.nickname };
    return reply.send(info);
  });
}
