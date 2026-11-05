/** What the Connection Settings page may send, and the addresses it shows. No Electron here, so it is unit-tested. */
import { connectionConfigSchema, normalizeServerUrl, type ConnectionConfig } from './connection-config.ts';
import { lanAddresses } from './network.ts';

const SERVER_HINT = 'Enter the address of an openICQ server, for example 192.168.1.20:5190.';
const PORT_HINT = 'Enter a port between 1024 and 65535.';

/** Validates what the page sends. The page is ours, but the main process trusts no renderer. */
export function parseConnectionChoice(raw: unknown): { config: ConnectionConfig } | { error: string } {
  if (typeof raw !== 'object' || raw === null) return { error: SERVER_HINT };
  const mode: unknown = Reflect.get(raw, 'mode');
  if (mode === 'connect') {
    const typed: unknown = Reflect.get(raw, 'serverUrl');
    const serverUrl = typeof typed === 'string' ? normalizeServerUrl(typed) : null;
    return serverUrl ? { config: { mode: 'connect', serverUrl } } : { error: SERVER_HINT };
  }
  const parsed = connectionConfigSchema.safeParse(raw);
  return parsed.success ? { config: parsed.data } : { error: PORT_HINT };
}

/** The addresses friends type in, when this computer hosts and shares. */
export function networkUrlsFor(config: ConnectionConfig | null, lan: readonly string[] = lanAddresses()): string[] {
  if (!config || config.mode !== 'host' || !config.shareOnNetwork) return [];
  return lan.map((address) => `http://${address}:${config.port}`);
}
