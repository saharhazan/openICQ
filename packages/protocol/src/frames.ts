/**
 * WebSocket wire frames. Every frame is one JSON text message.
 *
 * Client to server: `{ id, type, payload }`, where `id` correlates the reply.
 * Server to client: a `result`, an `error` (both carry `replyTo`) or an `event`.
 */
import { z } from 'zod';
import { protocolErrorSchema } from './domain.ts';
import { serverEventSchema } from './events.ts';

/** Largest accepted frame in bytes. Large enough for the longest message plus JSON overhead. */
export const MAX_FRAME_BYTES = 64 * 1024;

export const clientFrameSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.string().min(1).max(64),
  payload: z.unknown(),
});
export type ClientFrame = z.infer<typeof clientFrameSchema>;

export const serverFrameSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('result'), replyTo: z.string(), result: z.unknown() }),
  z.object({ kind: z.literal('error'), replyTo: z.string().nullable(), error: protocolErrorSchema }),
  z.object({ kind: z.literal('event'), event: serverEventSchema }),
]);
export type ServerFrame = z.infer<typeof serverFrameSchema>;

/** WebSocket close codes used by the server (4000 to 4999 is the application range). */
export const CLOSE_CODES = {
  unauthorized: 4001,
  otherLocation: 4002,
  signedOut: 4003,
  protocolViolation: 4004,
} as const;

/** Path of the WebSocket endpoint. */
export const WS_PATH = '/ws';
