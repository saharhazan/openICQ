import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { API_PATHS, SESSION_COOKIE, httpErrorBodySchema, sessionInfoSchema } from '@openicq/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOGIN_FAILED_MESSAGE } from '../../src/application/auth-service.ts';
import { ORIGIN, PASSWORD, TestServer } from './harness.ts';

let server: TestServer;

beforeEach(async () => {
  server = await TestServer.start();
});

afterEach(async () => {
  await server.stop();
});

function post(url: string, payload: object | undefined, headers: Record<string, string> = { origin: ORIGIN }) {
  return server.app.inject({ method: 'POST', url, headers, payload });
}

describe('registration', () => {
  it('hands out sequential UINs starting at UIN_START', async () => {
    const first = await server.register({ nickname: 'Alice', password: PASSWORD });
    const second = await server.register({ nickname: 'Bob', password: PASSWORD });
    expect(first).toBe(100000);
    expect(second).toBe(100001);
  });

  it('honours a custom UIN_START', async () => {
    const custom = await TestServer.start({ uinStart: 500000 });
    try {
      expect(await custom.register({ nickname: 'Carol', password: PASSWORD })).toBe(500000);
    } finally {
      await custom.stop();
    }
  });

  it('returns 201 with the UIN and rejects invalid bodies with a readable message', async () => {
    const ok = await post(API_PATHS.register, { nickname: 'Dave', password: PASSWORD });
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toEqual({ uin: 100000 });

    const bad = await post(API_PATHS.register, { nickname: '', password: '123' });
    expect(bad.statusCode).toBe(400);
    const body = httpErrorBodySchema.parse(bad.json());
    expect(body.error.code).toBe('bad_request');
    expect(body.error.message).toMatch(/nickname/);
    expect(body.error.message).toMatch(/password/);
  });

  it('does not require authorization unless asked to, like the original default', async () => {
    const uin = await server.register({ nickname: 'Eve', password: PASSWORD });
    const cookie = await server.login(uin);
    const client = await server.open({ cookie });
    const snapshot = await client.request('session.start', { status: 'online' });
    expect(snapshot.settings.authRequired).toBe(false);
    expect(snapshot.self.authRequired).toBe(false);
  });

  it('limits registrations to 5 per hour per IP', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await post(API_PATHS.register, { nickname: `U${i}`, password: PASSWORD })).statusCode).toBe(201);
    }
    const limited = await post(API_PATHS.register, { nickname: 'U6', password: PASSWORD });
    expect(limited.statusCode).toBe(429);
    expect(httpErrorBodySchema.parse(limited.json()).error.code).toBe('rate_limited');
    expect(limited.headers['retry-after']).toBeDefined();
  });
});

describe('login and session', () => {
  it('sets an HttpOnly SameSite=Strict session cookie and returns SessionInfo', async () => {
    const uin = await server.register({ nickname: 'Alice', password: PASSWORD });
    const response = await post(API_PATHS.login, { uin, password: PASSWORD });
    expect(response.statusCode).toBe(200);
    expect(sessionInfoSchema.parse(response.json())).toEqual({ uin, nickname: 'Alice' });

    const cookie = response.cookies.find((entry) => entry.name === SESSION_COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/' });
    expect(cookie?.maxAge).toBeUndefined();
    expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('gives a 30-day persistent cookie with "Save password"', async () => {
    const uin = await server.register({ nickname: 'Alice', password: PASSWORD });
    const response = await post(API_PATHS.login, { uin, password: PASSWORD, remember: true });
    const cookie = response.cookies.find((entry) => entry.name === SESSION_COOKIE);
    expect(cookie?.maxAge).toBe(30 * 24 * 60 * 60);
  });

  it('answers every failure with the same generic message', async () => {
    const uin = await server.register({ nickname: 'Alice', password: PASSWORD });
    for (const payload of [
      { uin, password: 'wrong-password' },
      { uin: 999999, password: PASSWORD },
      { uin: 'abc', password: '' },
    ]) {
      const response = await post(API_PATHS.login, payload);
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: { code: 'unauthorized', message: LOGIN_FAILED_MESSAGE } });
      expect(response.cookies).toHaveLength(0);
    }
  });

  it('limits sign-in attempts to 10 per 5 minutes per IP', async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await post(API_PATHS.login, { uin: 999999, password: 'nope' })).statusCode).toBe(401);
    }
    const limited = await post(API_PATHS.login, { uin: 999999, password: 'nope' });
    expect(limited.statusCode).toBe(429);
    expect(httpErrorBodySchema.parse(limited.json()).error.code).toBe('rate_limited');
  });

  it('reports the session for a valid cookie and 401 otherwise', async () => {
    const alice = await server.createUser('Alice');
    const ok = await server.app.inject({ method: 'GET', url: API_PATHS.session, headers: { cookie: alice.cookie } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ uin: alice.uin, nickname: 'Alice' });

    const none = await server.app.inject({ method: 'GET', url: API_PATHS.session });
    expect(none.statusCode).toBe(401);
    expect(httpErrorBodySchema.parse(none.json()).error.code).toBe('unauthorized');
  });

  it('logout revokes the token and clears the cookie', async () => {
    const alice = await server.createUser('Alice');
    const response = await post(API_PATHS.logout, undefined, { origin: ORIGIN, cookie: alice.cookie });
    expect(response.statusCode).toBe(204);
    const cleared = response.cookies.find((entry) => entry.name === SESSION_COOKIE);
    expect(cleared?.value).toBe('');

    const after = await server.app.inject({ method: 'GET', url: API_PATHS.session, headers: { cookie: alice.cookie } });
    expect(after.statusCode).toBe(401);
  });
});

describe('cross-cutting HTTP rules', () => {
  it('rejects state-changing requests from a foreign or missing Origin with 403', async () => {
    const headerSets: Record<string, string>[] = [{ origin: 'https://evil.example' }, {}];
    for (const headers of headerSets) {
      for (const url of [API_PATHS.register, API_PATHS.login, API_PATHS.logout]) {
        const response = await post(url, { nickname: 'X', password: PASSWORD }, headers);
        expect(response.statusCode).toBe(403);
        expect(httpErrorBodySchema.parse(response.json()).error.code).toBe('forbidden');
      }
    }
  });

  it('adds the security headers to every response', async () => {
    for (const url of [API_PATHS.health, '/api/does-not-exist']) {
      const response = await server.app.inject({ method: 'GET', url });
      expect(response.headers['content-security-policy']).toBe(
        "default-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self' data:; " +
          "style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      );
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
    }
  });

  it('serves health and JSON 404s', async () => {
    const health = await server.app.inject({ method: 'GET', url: API_PATHS.health });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: 'ok' });

    const missing = await server.app.inject({ method: 'GET', url: '/api/nope' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: { code: 'not_found', message: 'Not found.' } });
  });

  it('answers malformed JSON with bad_request', async () => {
    const response = await server.app.inject({
      method: 'POST',
      url: API_PATHS.register,
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(response.statusCode).toBe(400);
    expect(httpErrorBodySchema.parse(response.json()).error.code).toBe('bad_request');
  });
});

describe('client build', () => {
  it('serves the build with SPA fallback for non-API routes', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'icq-dist-'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>ICQ</title>');
    writeFileSync(join(dist, 'app.js'), 'export {};');
    const withClient = await TestServer.start({ clientDistDir: dist });
    try {
      const root = await withClient.app.inject({ method: 'GET', url: '/' });
      expect(root.statusCode).toBe(200);
      expect(root.body).toContain('<title>ICQ</title>');

      const asset = await withClient.app.inject({ method: 'GET', url: '/app.js' });
      expect(asset.statusCode).toBe(200);
      expect(asset.body).toBe('export {};');

      const deepLink = await withClient.app.inject({ method: 'GET', url: '/contacts/123' });
      expect(deepLink.statusCode).toBe(200);
      expect(deepLink.body).toContain('<title>ICQ</title>');

      const api = await withClient.app.inject({ method: 'GET', url: '/api/unknown' });
      expect(api.statusCode).toBe(404);
      expect(api.json()).toEqual({ error: { code: 'not_found', message: 'Not found.' } });
    } finally {
      await withClient.stop();
      rmSync(dist, { recursive: true, force: true });
    }
  });
});
