/** Network facts for a hosted server: the addresses friends use, and the origins the server accepts. */
import { networkInterfaces } from 'node:os';

type Interfaces = ReturnType<typeof networkInterfaces>;

/** Home and office networks (RFC 1918). A public or VPN address is never offered to friends. */
function isPrivate(address: string): boolean {
  const [a = 0, b = 0] = address.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** The computer's private IPv4 addresses on the local network (no loopback, link-local or public ones). */
export function lanAddresses(interfaces: Interfaces = networkInterfaces()): string[] {
  const found = new Set<string>();
  for (const list of Object.values(interfaces)) {
    for (const entry of list ?? []) {
      if (entry.family !== 'IPv4' || entry.internal || !isPrivate(entry.address)) continue;
      found.add(entry.address);
    }
  }
  return [...found].sort();
}

/**
 * The browser origins the hosted server accepts (its WebSocket and REST origin check):
 * this computer always, the network addresses only when sharing is on.
 */
export function hostedOrigins(port: number, lan: readonly string[]): string[] {
  const hosts = ['127.0.0.1', 'localhost', ...lan];
  return hosts.map((host) => `http://${host}:${port}`);
}
