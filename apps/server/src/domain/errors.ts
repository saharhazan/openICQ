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

/** Raised by file storage when an upload goes over the size limit. Nothing is kept on disk. */
export class FileTooLargeError extends Error {
  readonly maxBytes: number;

  constructor(maxBytes: number) {
    super(`The upload is larger than ${maxBytes} bytes`);
    this.name = 'FileTooLargeError';
    this.maxBytes = maxBytes;
  }
}
