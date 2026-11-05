/** Security headers added to every HTTP response. */
import type { FastifyInstance } from 'fastify';

export const SECURITY_HEADERS = {
  'content-security-policy':
    "default-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self' data:; " +
    "style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
} as const;

export function registerSecurityHeaders(app: FastifyInstance): void {
  app.addHook('onRequest', (_request, reply, done) => {
    reply.headers(SECURITY_HEADERS);
    done();
  });
}
