import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config.ts';

describe('loadConfig', () => {
  it('applies the documented defaults', () => {
    const config = loadConfig({}, '/srv/icq/apps/server');
    expect(config).toEqual({
      port: 5190,
      host: '127.0.0.1',
      databasePath: '/srv/icq/apps/server/data/icq.db',
      uinStart: 100000,
      allowedOrigins: ['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:5190', 'http://localhost:5190'],
      cookieSecure: false,
      clientDistDir: '/srv/icq/apps/client/dist',
      logLevel: 'info',
    });
  });

  it('parses explicit values and keeps :memory: as is', () => {
    const config = loadConfig({
      PORT: '6000',
      DATABASE_PATH: ':memory:',
      UIN_START: '200000',
      ALLOWED_ORIGINS: 'https://icq.example.com, http://localhost:3000',
      COOKIE_SECURE: 'true',
      LOG_LEVEL: 'debug',
    });
    expect(config).toMatchObject({
      port: 6000,
      databasePath: ':memory:',
      uinStart: 200000,
      allowedOrigins: ['https://icq.example.com', 'http://localhost:3000'],
      cookieSecure: true,
      logLevel: 'debug',
    });
  });

  it('fails loudly and names every invalid variable', () => {
    expect(() => loadConfig({ PORT: 'abc', ALLOWED_ORIGINS: 'http://x.com/path', COOKIE_SECURE: 'maybe' })).toThrow(ConfigError);
    try {
      loadConfig({ PORT: 'abc', ALLOWED_ORIGINS: 'http://x.com/path', COOKIE_SECURE: 'maybe' });
    } catch (error) {
      expect(String(error)).toMatch(/PORT/);
      expect(String(error)).toMatch(/ALLOWED_ORIGINS/);
      expect(String(error)).toMatch(/COOKIE_SECURE/);
    }
  });
});
