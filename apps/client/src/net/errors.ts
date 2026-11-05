import type { ErrorCode } from '@openicq/protocol';

/**
 * Failure codes a client call can end with: every server error code plus the
 * failures that only exist on this side of the wire.
 */
export type ClientErrorCode = ErrorCode | 'network' | 'invalid_response' | 'connection_closed';

/** The single error type thrown by ApiClient and IcqConnection. */
export class IcqError extends Error {
  readonly code: ClientErrorCode;
  /** HTTP status for REST failures, WebSocket close code for socket failures. */
  readonly status: number | null;

  constructor(code: ClientErrorCode, message: string, status: number | null = null, options?: ErrorOptions) {
    super(message, options);
    this.name = 'IcqError';
    this.code = code;
    this.status = status;
  }
}

export function isIcqError(value: unknown): value is IcqError {
  return value instanceof IcqError;
}

/** Normalises anything caught into an IcqError so the UI always has a code and a message. */
export function toIcqError(value: unknown): IcqError {
  if (value instanceof IcqError) return value;
  if (value instanceof Error) return new IcqError('internal', value.message, null, { cause: value });
  return new IcqError('internal', String(value));
}
