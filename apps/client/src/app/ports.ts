/** The server-facing boundaries the controllers depend on, so tests can mock them (London school). */
import type { RequestInput, RequestResult, RequestType, ServerEvent } from '@openicq/protocol';
import type { ApiClient } from '../net/ApiClient';
import type { IcqError } from '../net/errors';
import type { CloseInfo, ConnectionState } from '../net/IcqConnection';

export type Api = Pick<ApiClient, 'login' | 'register' | 'logout' | 'session' | 'upload' | 'fileUrl'>;

export interface Connection {
  readonly isOpen: boolean;
  readonly state: ConnectionState;
  connect(): Promise<void>;
  disconnect(): void;
  request<T extends RequestType>(type: T, input: RequestInput<T>): Promise<RequestResult<T>>;
  onEvent(listener: (event: ServerEvent) => void): () => void;
  onStateChange(listener: (state: ConnectionState, info: CloseInfo | null) => void): () => void;
  onProblem(listener: (error: IcqError) => void): () => void;
  onReconnected(listener: () => void): () => void;
}
