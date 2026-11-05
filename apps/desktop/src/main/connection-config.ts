/**
 * How the desktop app reaches an openICQ server, saved in the user's app data:
 * either it hosts one itself (for this computer, or for the whole home or
 * office network), or it connects to a server somebody else runs.
 * ICQ 2001b kept the same choice under Preferences, Connections ("Server").
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';

export const DEFAULT_PORT = 5190;

export const connectionConfigSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('host'),
    port: z.number().int().min(1024).max(65_535),
    /** Listen on every network interface, so other computers can sign in. */
    shareOnNetwork: z.boolean(),
  }),
  z.object({
    mode: z.literal('connect'),
    /** An http(s) origin such as `http://192.168.1.20:5190`. */
    serverUrl: z.string().refine((value) => normalizeServerUrl(value) === value, 'Not a server address'),
  }),
]);
export type ConnectionConfig = z.infer<typeof connectionConfigSchema>;

export class ConnectionConfigError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ConnectionConfigError';
  }
}

/**
 * Turns what a user types ("192.168.1.20:5190", "chat.example.com",
 * "https://chat.example.com/") into an origin. Null for anything that is not a
 * plain http(s) server address (paths, credentials, other schemes).
 */
export function normalizeServerUrl(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const withScheme = hasScheme ? trimmed : `${defaultScheme(trimmed)}://${trimmed}`;
  if (!URL.canParse(withScheme)) return null;
  const url = new URL(withScheme);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;
  if (!url.hostname) return null;
  return url.origin;
}

/**
 * Without a scheme, servers at home (an IP address, `localhost`, a `.local` or
 * one-word name) are plain http; anything on the internet is https, so a typed
 * public name never travels in clear text.
 */
function defaultScheme(hostAndPort: string): 'http' | 'https' {
  const host = (hostAndPort.split('/')[0] ?? '').replace(/:\d+$/, '').toLowerCase();
  const local = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host === 'localhost' || host.endsWith('.local') || !host.includes('.');
  return local ? 'http' : 'https';
}

/** The saved settings, or null on the first start. A damaged file is an error the user must see. */
export async function loadConnectionConfig(file: string): Promise<ConnectionConfig | null> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw new ConnectionConfigError(`openICQ cannot read its connection settings (${file}).`, { cause: error });
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new ConnectionConfigError(`The connection settings file is damaged (${file}).`, { cause: error });
  }
  const parsed = connectionConfigSchema.safeParse(json);
  if (!parsed.success) throw new ConnectionConfigError(`The connection settings file is not valid (${file}).`);
  return parsed.data;
}

/** Writes atomically (temp file, then rename), so a crash never leaves half a file. */
export async function saveConnectionConfig(file: string, config: ConnectionConfig): Promise<void> {
  const valid = connectionConfigSchema.parse(config);
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  await writeFile(temp, `${JSON.stringify(valid, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temp, file);
}
