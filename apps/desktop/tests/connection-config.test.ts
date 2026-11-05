import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { networkUrlsFor, parseConnectionChoice } from '../src/main/connection-choice.ts';
import {
  ConnectionConfigError,
  loadConnectionConfig,
  normalizeServerUrl,
  saveConnectionConfig,
} from '../src/main/connection-config.ts';

describe('normalizeServerUrl', () => {
  it('accepts what people type and returns an origin', () => {
    expect(normalizeServerUrl('192.168.1.20:5190')).toBe('http://192.168.1.20:5190');
    expect(normalizeServerUrl('  chat.example.com ')).toBe('https://chat.example.com');
    expect(normalizeServerUrl('chat.example.com:5190')).toBe('https://chat.example.com:5190');
    expect(normalizeServerUrl('localhost:5190')).toBe('http://localhost:5190');
    expect(normalizeServerUrl('homeserver:5190')).toBe('http://homeserver:5190');
    expect(normalizeServerUrl('mac-mini.local:5190')).toBe('http://mac-mini.local:5190');
    expect(normalizeServerUrl('http://chat.example.com')).toBe('http://chat.example.com');
    expect(normalizeServerUrl('https://chat.example.com/')).toBe('https://chat.example.com');
    expect(normalizeServerUrl('HTTP://Chat.Example.com:80')).toBe('http://chat.example.com');
  });

  it('refuses anything that is not a plain http(s) server address', () => {
    for (const bad of ['', 'file:///etc/passwd', 'javascript:alert(1)', 'ftp://host', 'http://host/path', 'http://u:p@host', 'http://host?x=1']) {
      expect(normalizeServerUrl(bad), bad).toBeNull();
    }
  });
});

describe('parseConnectionChoice', () => {
  it('normalizes a server address and validates a hosted port', () => {
    expect(parseConnectionChoice({ mode: 'connect', serverUrl: '10.0.0.5:5190' })).toEqual({
      config: { mode: 'connect', serverUrl: 'http://10.0.0.5:5190' },
    });
    expect(parseConnectionChoice({ mode: 'host', port: 5190, shareOnNetwork: true })).toEqual({
      config: { mode: 'host', port: 5190, shareOnNetwork: true },
    });
  });

  it('answers with the hint to show for invalid input', () => {
    expect(parseConnectionChoice({ mode: 'connect', serverUrl: 'file:///x' })).toEqual({
      error: 'Enter the address of an openICQ server, for example 192.168.1.20:5190.',
    });
    expect(parseConnectionChoice({ mode: 'host', port: 80, shareOnNetwork: false })).toEqual({ error: 'Enter a port between 1024 and 65535.' });
    expect(parseConnectionChoice({ mode: 'host', port: Number.NaN, shareOnNetwork: false })).toHaveProperty('error');
    expect(parseConnectionChoice(null)).toHaveProperty('error');
  });
});

describe('networkUrlsFor', () => {
  it('lists the addresses friends use, only when hosting and sharing', () => {
    expect(networkUrlsFor({ mode: 'host', port: 5190, shareOnNetwork: true }, ['192.168.1.20'])).toEqual(['http://192.168.1.20:5190']);
    expect(networkUrlsFor({ mode: 'host', port: 5190, shareOnNetwork: false }, ['192.168.1.20'])).toEqual([]);
    expect(networkUrlsFor({ mode: 'connect', serverUrl: 'http://x' }, ['192.168.1.20'])).toEqual([]);
    expect(networkUrlsFor(null, ['192.168.1.20'])).toEqual([]);
  });
});

describe('connection settings file', () => {
  it('returns null on the first start and round-trips a saved choice', async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'openicq-config-')), 'nested', 'connection.json');
    expect(await loadConnectionConfig(file)).toBeNull();
    await saveConnectionConfig(file, { mode: 'host', port: 6000, shareOnNetwork: true });
    expect(await loadConnectionConfig(file)).toEqual({ mode: 'host', port: 6000, shareOnNetwork: true });
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ mode: 'host', port: 6000, shareOnNetwork: true });
  });

  it('reports a damaged or invalid file instead of silently starting over', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'openicq-config-'));
    const broken = join(dir, 'broken.json');
    await writeFile(broken, '{ not json');
    await expect(loadConnectionConfig(broken)).rejects.toBeInstanceOf(ConnectionConfigError);
    const invalid = join(dir, 'invalid.json');
    await writeFile(invalid, JSON.stringify({ mode: 'connect', serverUrl: 'file:///etc/passwd' }));
    await expect(loadConnectionConfig(invalid)).rejects.toThrow('The connection settings file is not valid');
  });
});
