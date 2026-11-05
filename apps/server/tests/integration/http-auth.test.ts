import { API_PATHS, SESSION_COOKIE, httpErrorBodySchema, sessionInfoSchema } from '@openicq/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EMAIL_TAKEN_MESSAGE, LOGIN_FAILED_MESSAGE } from '../../src/application/auth-service.ts';
import { MESSAGES } from '../../src/application/support.ts';
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

function errorOf(response: { json(): unknown }) {
  return httpErrorBodySchema.parse(response.json()).error;
}

describe('registration', () => {
  it('needs only a first name and a password, and hands out sequential ICQ numbers from UIN_START', async () => {
    const first = await post(API_PATHS.register, { firstName: 'Alice', password: PASSWORD });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toEqual({ uin: 100000 });
    expect(await server.register({ firstName: 'Bob', password: PASSWORD })).toBe(100001);
  });

  it('honours a custom UIN_START', async () => {
    const custom = await TestServer.start({ uinStart: 500000 });
    try {
      expect(await custom.register({ firstName: 'Carol', password: PASSWORD })).toBe(500000);
    } finally {
      await custom.stop();
    }
  });

  it('rejects invalid bodies with a readable message', async () => {
    const bad = await post(API_PATHS.register, { firstName: '', password: '123', nickname: '1bad' });
    expect(bad.statusCode).toBe(400);
    const error = errorOf(bad);
    expect(error.code).toBe('bad_request');
    expect(error.message).toMatch(/firstName/);
    expect(error.message).toMatch(/password/);
    expect(error.message).toMatch(/nickname/);
  });

  it('keeps nicknames unique without regard to case', async () => {
    await server.register({ firstName: 'Alice', nickname: 'alice.w', password: PASSWORD });
    const taken = await post(API_PATHS.register, { firstName: 'Other', nickname: 'ALICE.W', password: PASSWORD });
    expect(taken.statusCode).toBe(409);
    expect(errorOf(taken)).toEqual({ code: 'conflict', message: MESSAGES.nicknameTaken });
  });

  it('keeps emails unique without regard to case', async () => {
    await server.register({ firstName: 'Alice', email: 'alice@example.com', password: PASSWORD });
    const taken = await post(API_PATHS.register, { firstName: 'Other', email: 'Alice@Example.com', password: PASSWORD });
    expect(taken.statusCode).toBe(409);
    expect(errorOf(taken)).toEqual({ code: 'conflict', message: EMAIL_TAKEN_MESSAGE });
  });

  it('creates a pinned Favorites chat', async () => {
    const alice = await server.createUser('Alice');
    const { snapshot } = await server.connect(alice);
    expect(snapshot.chats).toHaveLength(1);
    expect(snapshot.chats[0]).toMatchObject({ type: 'favorites', pinned: true, title: '', peer: null, unread: 0 });
  });

  it('limits registrations to 5 per hour per IP', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await post(API_PATHS.register, { firstName: `U${i}`, password: PASSWORD })).statusCode).toBe(201);
    }
    const limited = await post(API_PATHS.register, { firstName: 'U6', password: PASSWORD });
    expect(limited.statusCode).toBe(429);
    expect(errorOf(limited).code).toBe('rate_limited');
    expect(limited.headers['retry-after']).toBeDefined();
  });
});

describe('sign-in', () => {
  it('signs in by ICQ number and by email, case-insensitively', async () => {
    const uin = await server.register({ firstName: 'Alice', email: 'alice@example.com', password: PASSWORD });
    for (const login of [String(uin), 'alice@example.com', 'ALICE@Example.COM', ` ${uin} `]) {
      const response = await server.loginResponse(login);
      expect(response.statusCode, login).toBe(200);
      expect(sessionInfoSchema.parse(response.json())).toEqual({ uin });
    }
  });

  it('gives the same answer for an unknown login, a wrong password and a malformed body', async () => {
    const uin = await server.register({ firstName: 'Alice', email: 'alice@example.com', password: PASSWORD });
    const failures = [
      await server.loginResponse(String(uin), 'wrong-password'),
      await server.loginResponse('999999'),
      await server.loginResponse('nobody@example.com'),
      await server.loginResponse('alice'),
      await post(API_PATHS.login, { login: 42 }),
    ];
    for (const response of failures) {
      expect(response.statusCode).toBe(401);
      expect(errorOf(response)).toEqual({ code: 'unauthorized', message: LOGIN_FAILED_MESSAGE });
    }
  });

  it('keepSignedIn gives a 30-day cookie, otherwise a browser-session cookie', async () => {
    const uin = await server.register({ firstName: 'Alice', password: PASSWORD });
    const kept = (await server.loginResponse(String(uin), PASSWORD, true)).cookies.find((c) => c.name === SESSION_COOKIE);
    expect(kept).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/', maxAge: 30 * 24 * 60 * 60 });
    const session = (await server.loginResponse(String(uin), PASSWORD, false)).cookies.find((c) => c.name === SESSION_COOKIE);
    expect(session?.maxAge).toBeUndefined();
    expect(session?.httpOnly).toBe(true);
  });

  it('keeps users signed in by default (keepSignedIn defaults to true)', async () => {
    const uin = await server.register({ firstName: 'Alice', password: PASSWORD });
    const response = await post(API_PATHS.login, { login: String(uin), password: PASSWORD });
    expect(response.cookies.find((c) => c.name === SESSION_COOKIE)?.maxAge).toBe(30 * 24 * 60 * 60);
  });

  it('reports the session and signs out only the current one', async () => {
    const alice = await server.createUser('Alice');
    const second = await server.login(alice.uin);
    const check = (cookie: string) => server.app.inject({ method: 'GET', url: API_PATHS.session, headers: { cookie } });
    expect((await check(alice.cookie)).json()).toEqual({ uin: alice.uin });

    const logout = await post(API_PATHS.logout, undefined, { origin: ORIGIN, cookie: alice.cookie });
    expect(logout.statusCode).toBe(204);
    expect((await check(alice.cookie)).statusCode).toBe(401);
    expect((await check(second)).statusCode).toBe(200);
  });

  it('refuses state-changing requests from a foreign or missing Origin', async () => {
    const variants: Record<string, string>[] = [{ origin: 'https://evil.example' }, {}];
    for (const headers of variants) {
      const response = await post(API_PATHS.register, { firstName: 'Mallory', password: PASSWORD }, headers);
      expect(response.statusCode).toBe(403);
      expect(errorOf(response).code).toBe('forbidden');
    }
  });

  it('limits sign-in attempts to 10 per 5 minutes per IP', async () => {
    for (let i = 0; i < 10; i += 1) expect((await server.loginResponse('100000', 'wrong')).statusCode).toBe(401);
    const limited = await server.loginResponse('100000', 'wrong');
    expect(limited.statusCode).toBe(429);
    expect(errorOf(limited).code).toBe('rate_limited');
  });
});

describe('health and static', () => {
  it('answers the health check', async () => {
    const response = await server.app.inject({ method: 'GET', url: API_PATHS.health });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });
    expect(response.headers['content-security-policy']).toMatch(/default-src 'self'/);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('answers unknown API paths with a JSON 404', async () => {
    const response = await server.app.inject({ method: 'GET', url: '/api/nothing' });
    expect(response.statusCode).toBe(404);
    expect(errorOf(response).code).toBe('not_found');
  });
});
