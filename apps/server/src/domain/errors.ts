import type { ErrorCode } from '@openicq/protocol';

/**
 * A business rule failure that the client is allowed to see. The transport
 * maps `code` to a protocol error and shows `message` to the user as is, so
 * the message must never contain internals.
 */
export class DomainError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}
