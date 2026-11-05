import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config.ts';

describe('loadConfig', () => {
  it('applies the documented defaults', () => {
    const config = loadConfig({}, '/srv/icq/apps/server');
    expect(config).toEqual({
      port: 5190,
      host: '127.0.0.1',
      databasePath: '/srv/icq/apps/server/data/openicq.db',
      uinStart: 100000,
      allowedOrigins: ['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:5190', 'http://localhost:5190'],
      cookieSecure: false,
      clientDistDir: '/srv/icq/apps/client/dist',
      filesDir: '/srv/icq/apps/server/data/files',
      maxFileBytes: 100 * 1024 * 1024,
      maxUserStorageBytes: 2 * 1024 * 1024 * 1024,
      maxTotalStorageBytes: 0,
      logLevel: 'info',
    });
  });

  it('puts the files next to the database, or in the temp folder for :memory:', () => {
    expect(loadConfig({ DATABASE_PATH: '/var/lib/openicq/main.db' }).filesDir).toBe('/var/lib/openicq/files');
    expect(loadConfig({ DATABASE_PATH: ':memory:' }).filesDir).toBe(join(tmpdir(), 'openicq-files'));
    expect(loadConfig({ FILES_DIR: 'uploads' }, '/srv').filesDir).toBe('/srv/uploads');
  });

  it('works with what the desktop app passes', () => {
    const config = loadConfig(
      {
        PORT: '5190',
        HOST: '0.0.0.0',
        DATABASE_PATH: '/Users/me/Library/openICQ/openicq.db',
        ALLOWED_ORIGINS: 'http://127.0.0.1:5190,http://192.168.1.5:5190',
        CLIENT_DIST_DIR: '/Applications/openICQ.app/client',
        LOG_LEVEL: 'warn',
      },
      '/Users/me/Library/openICQ',
    );
    expect(config).toMatchObject({ host: '0.0.0.0', filesDir: '/Users/me/Library/openICQ/files', logLevel: 'warn' });
  });

  it('parses explicit values and keeps :memory: as is', () => {
    const config = loadConfig({
      PORT: '6000',
      DATABASE_PATH: ':memory:',
      UIN_START: '200000',
      ALLOWED_ORIGINS: 'https://icq.example.com, http://localhost:3000',
      COOKIE_SECURE: 'true',
      MAX_FILE_BYTES: '1048576',
      MAX_USER_STORAGE_BYTES: '5000000',
      MAX_TOTAL_STORAGE_BYTES: '9000000000',
      LOG_LEVEL: 'debug',
    });
    expect(config).toMatchObject({
      port: 6000,
      databasePath: ':memory:',
      uinStart: 200000,
      allowedOrigins: ['https://icq.example.com', 'http://localhost:3000'],
      cookieSecure: true,
      maxFileBytes: 1048576,
      maxUserStorageBytes: 5000000,
      maxTotalStorageBytes: 9000000000,
      logLevel: 'debug',
    });
  });

  it('fails loudly and names every invalid variable', () => {
    const env = {
      PORT: 'abc',
      ALLOWED_ORIGINS: 'http://x.com/path',
      COOKIE_SECURE: 'maybe',
      MAX_FILE_BYTES: '0',
      FILES_DIR: ' ',
      MAX_USER_STORAGE_BYTES: '0',
      MAX_TOTAL_STORAGE_BYTES: '-1',
    };
    expect(() => loadConfig(env)).toThrow(ConfigError);
    try {
      loadConfig(env);
    } catch (error) {
      for (const name of Object.keys(env)) expect(String(error)).toMatch(name);
    }
  });
});
