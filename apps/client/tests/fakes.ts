/** Test doubles of the server-facing ports (London school: mock at the boundary). */
import { vi, type Mock } from 'vitest';
import type { ServerEvent } from '@openicq/protocol';
import type { Api, Connection } from '../src/app/ports';
import type { CloseInfo, ConnectionState } from '../src/net/IcqConnection';
import type { IcqError } from '../src/net/errors';

export interface FakeConnection {
  readonly isOpen: boolean;
  request: Mock<(type: string, input: unknown) => Promise<unknown>>;
  connect: Mock<() => Promise<void>>;
  disconnect: Mock<() => void>;
  /** The same object, typed as the port the controllers take. */
  readonly port: Connection;
  emit(event: ServerEvent): void;
  close(state: ConnectionState, info: CloseInfo | null): void;
  reconnect(): void;
  setOpen(open: boolean): void;
}

export function fakeConnection(): FakeConnection {
  let open = true;
  const events = new Set<(event: ServerEvent) => void>();
  const states = new Set<(state: ConnectionState, info: CloseInfo | null) => void>();
  const problems = new Set<(error: IcqError) => void>();
  const reconnects = new Set<() => void>();
  const connection = {
    get isOpen() {
      return open;
    },
    get state(): ConnectionState {
      return open ? 'open' : 'closed';
    },
    connect: vi.fn<() => Promise<void>>(async () => {
      open = true;
    }),
    disconnect: vi.fn<() => void>(() => {
      open = false;
    }),
    request: vi.fn<(type: string, input: unknown) => Promise<unknown>>(),
    onEvent: (listener: (event: ServerEvent) => void) => {
      events.add(listener);
      return () => events.delete(listener);
    },
    onStateChange: (listener: (state: ConnectionState, info: CloseInfo | null) => void) => {
      states.add(listener);
      return () => states.delete(listener);
    },
    onProblem: (listener: (error: IcqError) => void) => {
      problems.add(listener);
      return () => problems.delete(listener);
    },
    onReconnected: (listener: () => void) => {
      reconnects.add(listener);
      return () => reconnects.delete(listener);
    },
    emit: (event: ServerEvent) => events.forEach((listener) => listener(event)),
    close: (state: ConnectionState, info: CloseInfo | null) => states.forEach((listener) => listener(state, info)),
    reconnect: () => reconnects.forEach((listener) => listener()),
    setOpen: (value: boolean) => {
      open = value;
    },
  };
  // Safe: the object implements every Connection member; request is a mock standing in for the generic method.
  const port = connection as unknown as Connection;
  return Object.assign(connection, { port });
}

export function fakeApi() {
  return {
    login: vi.fn().mockResolvedValue({ uin: 100001 }),
    register: vi.fn().mockResolvedValue({ uin: 100500 }),
    logout: vi.fn().mockResolvedValue(undefined),
    session: vi.fn().mockResolvedValue(null),
    upload: vi.fn(),
    fileUrl: (id: number) => `/api/files/${id}`,
  } satisfies Record<keyof Api, unknown>;
}
