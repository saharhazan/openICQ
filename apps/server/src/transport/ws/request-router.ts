/**
 * Request router: parses a frame, validates its payload against the protocol
 * map, runs the handler for its type and answers with exactly one `result` or `error`.
 */
import {
  clientFrameSchema,
  isRequestType,
  requestPayloadSchemas,
  type ErrorCode,
  type RequestPayload,
  type RequestResult,
  type RequestType,
  type ServerFrame,
  type Uin,
} from '@openicq/protocol';
import type { z } from 'zod';
import { DomainError } from '../../domain/errors.ts';
import { describeZodError } from '../validation.ts';
import type { ClientConnection } from './connection.ts';

export interface RequestContext {
  readonly uin: Uin;
  readonly connection: ClientConnection;
}

export type RequestHandler<T extends RequestType> = (
  context: RequestContext,
  payload: RequestPayload<T>,
) => RequestResult<T> | Promise<RequestResult<T>>;

export type RequestHandlers = { readonly [T in RequestType]: RequestHandler<T> };

export function errorFrame(replyTo: string | null, code: ErrorCode, message: string): ServerFrame {
  return { kind: 'error', replyTo, error: { code, message } };
}

/** The id of a frame that failed validation, when it still has a usable one. */
function salvageId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('id' in value)) return null;
  const { id } = value;
  return typeof id === 'string' && id.length > 0 && id.length <= 64 ? id : null;
}

function parseJson(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    // Not JSON: the caller answers with a bad_request frame, which is the visible outcome.
    return { ok: false };
  }
}

export class RequestRouter {
  private readonly handlers: RequestHandlers;

  constructor(handlers: RequestHandlers) {
    this.handlers = handlers;
  }

  async handle(connection: ClientConnection, raw: string): Promise<void> {
    if (!connection.isOpen) {
      connection.log.debug('frame ignored, connection is closing');
      return;
    }
    const json = parseJson(raw);
    if (!json.ok) {
      connection.send(errorFrame(null, 'bad_request', 'Frame is not valid JSON.'));
      return;
    }
    const frame = clientFrameSchema.safeParse(json.value);
    if (!frame.success) {
      connection.send(errorFrame(salvageId(json.value), 'bad_request', describeZodError(frame.error)));
      return;
    }
    const { id, type, payload } = frame.data;
    if (!isRequestType(type)) {
      connection.send(errorFrame(id, 'bad_request', `Unknown request type "${type}".`));
      return;
    }
    if (!connection.started && type !== 'session.start') {
      connection.send(errorFrame(id, 'unauthorized', 'Send session.start before any other request.'));
      return;
    }
    const startedAt = performance.now();
    const reply = await this.execute(type, { uin: connection.uin, connection }, id, payload);
    connection.send(reply);
    connection.log.debug(
      {
        type,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        outcome: reply.kind === 'error' ? reply.error.code : 'ok',
      },
      'ws request',
    );
  }

  private async execute<T extends RequestType>(
    type: T,
    context: RequestContext,
    id: string,
    rawPayload: unknown,
  ): Promise<ServerFrame> {
    // Both maps are keyed by the same request type, so the schema for `type` yields RequestPayload<T>.
    // TypeScript cannot correlate two indexed accesses on a generic key, hence the cast.
    const schema = requestPayloadSchemas[type] as unknown as z.ZodType<RequestPayload<T>>;
    const payload = schema.safeParse(rawPayload);
    if (!payload.success) return errorFrame(id, 'bad_request', describeZodError(payload.error));
    const handler: RequestHandler<T> = this.handlers[type];
    try {
      const result = await handler(context, payload.data);
      return { kind: 'result', replyTo: id, result };
    } catch (error) {
      if (error instanceof DomainError) return errorFrame(id, error.code, error.message);
      context.connection.log.error({ err: error, type }, 'ws request failed');
      return errorFrame(id, 'internal', 'Internal server error.');
    }
  }
}
