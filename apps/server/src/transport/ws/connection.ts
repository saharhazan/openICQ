/** One WebSocket connection of a signed-in user. */
import type { ServerEvent, ServerEventOf, ServerFrame, Uin } from '@openicq/protocol';
import type { FastifyBaseLogger } from 'fastify';
import type { WebSocket } from 'ws';

export type KickReason = ServerEventOf<'session.kicked'>['reason'];

export interface ClientConnectionOptions {
  readonly socket: WebSocket;
  readonly uin: Uin;
  readonly tokenHash: string;
  readonly log: FastifyBaseLogger;
}

export class ClientConnection {
  readonly uin: Uin;
  /** The session this connection was authenticated with. */
  readonly tokenHash: string;
  readonly log: FastifyBaseLogger;
  private readonly socket: WebSocket;
  private sessionStarted = false;
  private answeredPing = true;

  constructor(options: ClientConnectionOptions) {
    this.socket = options.socket;
    this.uin = options.uin;
    this.tokenHash = options.tokenHash;
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
    this.send({ kind: 'event', event });
  }

  /** Tells the client why, then closes with the matching application close code. */
  kick(reason: KickReason, code: number): void {
    this.sessionStarted = false;
    this.sendEvent({ type: 'session.kicked', reason });
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
