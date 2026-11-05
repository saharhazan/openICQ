/** One WebSocket connection of a signed-in user. A user may have many, on many devices. */
import type { ServerEvent, ServerFrame } from '@openicq/protocol';
import type { FastifyBaseLogger } from 'fastify';
import type { WebSocket } from 'ws';
import type { ConnectionId } from '../../domain/ports.ts';
import type { Uin } from '../../domain/vocabulary.ts';

export type SessionClosedReason = 'closed_remotely' | 'signed_out';

export interface ClientConnectionOptions {
  readonly id: ConnectionId;
  readonly socket: WebSocket;
  readonly uin: Uin;
  readonly sessionId: number;
  readonly log: FastifyBaseLogger;
}

export class ClientConnection {
  readonly id: ConnectionId;
  readonly uin: Uin;
  /** The sign-in session this connection was authenticated with. */
  readonly sessionId: number;
  readonly log: FastifyBaseLogger;
  private readonly socket: WebSocket;
  private sessionStarted = false;
  private answeredPing = true;
  /** While requests of this connection run, its events wait, so a reply always precedes the events it caused. */
  private holds = 0;
  private heldEvents: ServerEvent[] = [];

  constructor(options: ClientConnectionOptions) {
    this.id = options.id;
    this.socket = options.socket;
    this.uin = options.uin;
    this.sessionId = options.sessionId;
    this.log = options.log;
  }

  /** True after a successful `session.start`. */
  get started(): boolean {
    return this.sessionStarted;
  }

  get isOpen(): boolean {
    return this.socket.readyState === this.socket.OPEN;
  }

  markStarted(): void {
    this.sessionStarted = true;
  }

  send(frame: ServerFrame): void {
    if (!this.isOpen) {
      this.log.debug({ kind: frame.kind }, 'frame dropped, socket is not open');
      return;
    }
    this.socket.send(JSON.stringify(frame), (error) => {
      if (error) this.log.warn({ err: error, kind: frame.kind }, 'failed to send frame');
    });
  }

  sendEvent(event: ServerEvent): void {
    if (this.holds > 0) this.heldEvents.push(event);
    else this.send({ kind: 'event', event });
  }

  holdEvents(): void {
    this.holds += 1;
  }

  /** Ends one hold; the last one flushes the waiting events in order. */
  releaseEvents(): void {
    this.holds = Math.max(0, this.holds - 1);
    if (this.holds > 0) return;
    const waiting = this.heldEvents;
    this.heldEvents = [];
    for (const event of waiting) this.send({ kind: 'event', event });
  }

  /** Tells the client its session ended, then closes with the matching application close code. */
  endSession(reason: SessionClosedReason, code: number): void {
    this.sessionStarted = false;
    this.holds = 0;
    this.releaseEvents();
    this.send({ kind: 'event', event: { type: 'session.closed', reason } });
    this.close(code, reason);
  }

  close(code: number, reason: string): void {
    if (this.socket.readyState === this.socket.OPEN || this.socket.readyState === this.socket.CONNECTING) {
      this.socket.close(code, reason);
    }
  }

  terminate(): void {
    this.socket.terminate();
  }

  /** Heartbeat step: false when the previous ping went unanswered, otherwise sends the next ping. */
  ping(): boolean {
    if (!this.answeredPing) return false;
    this.answeredPing = false;
    if (this.isOpen) this.socket.ping();
    return true;
  }

  markAlive(): void {
    this.answeredPing = true;
  }
}
