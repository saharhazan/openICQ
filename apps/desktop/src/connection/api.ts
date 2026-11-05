/** The calls between the Connection Settings page and the main process. */
import type { ConnectionConfig } from '../main/connection-config.ts';

export const CONNECTION_GLOBAL = 'openicqConnection';

export const CONNECTION_IPC = {
  load: 'openicq-connection:load',
  save: 'openicq-connection:save',
  cancel: 'openicq-connection:cancel',
} as const;

export interface ConnectionView {
  /** The saved choice, or null on the first start. */
  config: ConnectionConfig | null;
  /** Addresses other computers can use when this one hosts and shares. */
  networkUrls: string[];
  /** Why the window is shown again (a server that failed to start, for example). */
  problem: string | null;
}

export type SaveResult = { ok: true } | { ok: false; error: string };

export interface ConnectionApi {
  load(): Promise<ConnectionView>;
  save(config: unknown): Promise<SaveResult>;
  cancel(): void;
}
