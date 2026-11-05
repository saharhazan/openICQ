/** HTTP error bodies (`{ error: { code, message } }`) and the global error handler. */
import type { ErrorCode, HttpErrorBody } from '@openicq/protocol';
import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify';
import { DomainError } from '../../domain/errors.ts';

const HTTP_STATUS: Readonly<Record<ErrorCode, number>> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  not_connected: 409,
  timeout: 504,
  internal: 500,
};

export function sendError(reply: FastifyReply, code: ErrorCode, message: string): FastifyReply {
  const body: HttpErrorBody = { error: { code, message } };
  return reply.code(HTTP_STATUS[code]).send(body);
}

/**
 * Domain errors keep their code. Client errors raised by Fastify itself (bad
 * JSON, body too large) keep their status. Anything else is logged with its
 * stack and answered as `internal` without details.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof DomainError) return sendError(reply, error.code, error.message);
    const status = error.statusCode;
    if (status !== undefined && status >= 400 && status < 500) {
      request.log.info({ err: error }, 'rejected malformed request');
      const body: HttpErrorBody = { error: { code: status === 429 ? 'rate_limited' : 'bad_request', message: error.message } };
      return reply.code(status).send(body);
    }
    request.log.error({ err: error }, 'unexpected error');
    return sendError(reply, 'internal', 'Internal server error.');
  });
}
