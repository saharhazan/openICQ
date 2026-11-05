import { mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { API_PATHS } from '@openicq/protocol';
import { describe, expect, it } from 'vitest';
import { PortInUseError, startEmbeddedServer } from '../src/main/embedded-server.ts';

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => (typeof address === 'object' && address ? resolve(address.port) : reject(new Error('no port'))));
    });
  });
}

async function setup() {
  const dataDir = await mkdtemp(join(tmpdir(), 'openicq-embedded-'));
  const clientDir = await mkdtemp(join(tmpdir(), 'openicq-client-'));
  await writeFile(join(clientDir, 'index.html'), '<!doctype html><title>openICQ</title>');
  return { dataDir, clientDir, port: await freePort() };
}

describe('startEmbeddedServer', () => {
  it('serves the client and the API on this computer, and accepts only its own origin', async () => {
    const { dataDir, clientDir, port } = await setup();
    const server = await startEmbeddedServer({ port, shareOnNetwork: false, dataDir, clientDir });
    try {
      expect(server.localUrl).toBe(`http://127.0.0.1:${port}`);
      expect(server.networkUrls).toEqual([]);
      const health = await fetch(`${server.localUrl}${API_PATHS.health}`, { signal: AbortSignal.timeout(5_000) });
      expect(health.status).toBe(200);
      const page = await fetch(`${server.localUrl}/`, { signal: AbortSignal.timeout(5_000) });
      expect(await page.text()).toContain('<title>openICQ</title>');
      const foreign = await fetch(`${server.localUrl}${API_PATHS.register}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://evil.example' },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(5_000),
      });
      expect(foreign.status).toBe(403);
    } finally {
      await server.close();
    }
  });

  it('explains a port that is already taken', async () => {
    const { dataDir, clientDir, port } = await setup();
    const first = await startEmbeddedServer({ port, shareOnNetwork: false, dataDir, clientDir });
    try {
      const second = await setup();
      await expect(startEmbeddedServer({ port, shareOnNetwork: false, dataDir: second.dataDir, clientDir })).rejects.toBeInstanceOf(PortInUseError);
    } finally {
      await first.close();
    }
  });
});
