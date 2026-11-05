import { API_PATHS, CLOSE_CODES, MAX_FRAME_BYTES, sessionSnapshotSchema } from '@openicq/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_AWAY_MESSAGES, DEFAULT_PREFERENCES } from '../../src/domain/defaults.ts';
import { PASSWORD_RATE_LIMITED } from '../../src/transport/ws/handlers.ts';
import { ORIGIN, PASSWORD, TestServer } from './harness.ts';

let server: TestServer;

beforeEach(async () => {
  server = await TestServer.start();
});

afterEach(async () => {
  await server.stop();
});

describe('WebSocket authentication', () => {
  it('closes a socket without a session cookie with 4001', async () => {
    const client = await server.open();
    expect((await client.closed).code).toBe(CLOSE_CODES.unauthorized);
  });

  it('closes a socket with an invalid cookie with 4001', async () => {
    const client = await server.open({ cookie: 'icq_session=forged-token' });
    expect((await client.closed).code).toBe(CLOSE_CODES.unauthorized);
  });

  it('rejects a foreign or missing Origin even with a valid cookie', async () => {
    const alice = await server.createUser('Alice');
    const foreign = await server.open({ cookie: alice.cookie, origin: 'https://evil.example' });
    expect((await foreign.closed).code).toBe(CLOSE_CODES.unauthorized);
    const missing = await server.open({ cookie: alice.cookie, origin: null });
    expect((await missing.closed).code).toBe(CLOSE_CODES.unauthorized);
  });
});

describe('session.start', () => {
  it('rejects every other request before session.start', async () => {
    const alice = await server.createUser('Alice');
    const client = await server.open({ cookie: alice.cookie });
    for (const [type, payload] of [
      ['ping', {}],
      ['message.send', { to: 100001, text: 'hi' }],
    ] as const) {
      expect(await client.requestError(type, payload)).toMatchObject({ code: 'unauthorized' });
    }
  });

  it('returns the full snapshot with defaults', async () => {
    const alice = await server.createUser('Alice', { firstName: 'Alice', email: 'alice@example.com', about: 'Hi' });
    const { snapshot } = await server.connect(alice, 'ffc');

    expect(sessionSnapshotSchema.parse(snapshot)).toEqual({
      self: {
        uin: alice.uin,
        nickname: 'Alice',
        firstName: 'Alice',
        lastName: '',
        email: 'alice@example.com',
        gender: 'unspecified',
        age: null,
        country: '',
        city: '',
        homepage: '',
        about: 'Hi',
        authRequired: false,
        webAware: false,
      },
      settings: {
        authRequired: false,
        webAware: false,
        hideEmail: false,
        preferences: DEFAULT_PREFERENCES,
        awayMessages: DEFAULT_AWAY_MESSAGES,
      },
      status: 'ffc',
      contacts: [],
      notices: [],
      unread: [],
      notInList: [],
      ignored: [],
      serverTime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });

  it('answers ping with the server time', async () => {
    const alice = await server.createUser('Alice');
    const { client } = await server.connect(alice);
    expect((await client.request('ping', {})).serverTime).toMatch(/Z$/);
  });
});

describe('frame validation', () => {
  it('answers a frame that is not JSON with an error without replyTo', async () => {
    const alice = await server.createUser('Alice');
    const { client } = await server.connect(alice);
    client.sendRaw('this is not json');
    const frame = await client.nextOrphanError();
    expect(frame).toEqual({ kind: 'error', replyTo: null, error: { code: 'bad_request', message: 'Frame is not valid JSON.' } });
  });

  it('answers a malformed frame, keeping the id when it is usable', async () => {
    const alice = await server.createUser('Alice');
    const { client } = await server.connect(alice);
    client.sendRaw(JSON.stringify({ type: 'ping', payload: {} }));
    const frame = await client.nextOrphanError();
    expect(frame.kind === 'error' && frame.error.code).toBe('bad_request');
    expect(frame.kind === 'error' && frame.error.message).toMatch(/^id: /);
  });

  it('rejects unknown types and invalid payloads with bad_request and a readable message', async () => {
    const alice = await server.createUser('Alice');
    const { client } = await server.connect(alice);

    expect(await client.requestError('contact.explode', {})).toEqual({
      code: 'bad_request',
      message: 'Unknown request type "contact.explode".',
    });
    expect(await client.requestError('toString', {})).toMatchObject({ code: 'bad_request' });

    const invalid = await client.requestError('message.send', { to: 42, text: '   ' });
    expect(invalid.code).toBe('bad_request');
    expect(invalid.message).toMatch(/to: /);
    expect(invalid.message).toMatch(/Message is empty/);

    expect(await client.requestError('ping', { extra: true })).toMatchObject({ code: 'bad_request' });
  });

  it('closes the socket when a frame exceeds MAX_FRAME_BYTES', async () => {
    const alice = await server.createUser('Alice');
    const { client } = await server.connect(alice);
    client.sendRaw('x'.repeat(MAX_FRAME_BYTES + 1));
    expect((await client.closed).code).toBe(1009);
  });
});

describe('one live connection per UIN', () => {
  it('a second sign-in kicks the first with 4002 and watchers see no flicker', async () => {
    const alice = await server.createUser('Alice');
    const bob = await server.createUser('Bob');
    const { client: bobClient } = await server.connect(bob);
    const { client: first } = await server.connect(alice);
    await bobClient.request('contact.add', { uin: alice.uin });

    const secondCookie = await server.login(alice.uin);
    const second = await server.open({ cookie: secondCookie });
    const snapshot = await second.request('session.start', { status: 'online' });
    expect(snapshot.self.uin).toBe(alice.uin);

    expect(await first.nextEvent('session.kicked')).toEqual({ type: 'session.kicked', reason: 'other_location' });
    expect((await first.closed).code).toBe(CLOSE_CODES.otherLocation);
    await bobClient.expectNoEvent('presence');

    // The new connection is the live one: it still receives events.
    await bobClient.request('message.send', { to: alice.uin, text: 'still there?' });
    expect((await second.nextEvent('message')).message.text).toBe('still there?');
  });

  it('logout kicks the live socket with 4003 and watchers see offline', async () => {
    const alice = await server.createUser('Alice');
    const bob = await server.createUser('Bob');
    const { client: bobClient } = await server.connect(bob);
    const { client: aliceClient } = await server.connect(alice);
    await bobClient.request('contact.add', { uin: alice.uin });

    const response = await server.app.inject({
      method: 'POST',
      url: API_PATHS.logout,
      headers: { origin: ORIGIN, cookie: alice.cookie },
    });
    expect(response.statusCode).toBe(204);

    expect(await aliceClient.nextEvent('session.kicked')).toEqual({ type: 'session.kicked', reason: 'signed_out' });
    expect((await aliceClient.closed).code).toBe(CLOSE_CODES.signedOut);
    expect(await bobClient.nextEvent('presence')).toEqual({ type: 'presence', uin: alice.uin, status: 'offline' });

    const reconnect = await server.open({ cookie: alice.cookie });
    expect((await reconnect.closed).code).toBe(CLOSE_CODES.unauthorized);
  });
});

describe('password.change', () => {
  it('verifies the current password and signs out every other session', async () => {
    const alice = await server.createUser('Alice');
    const otherCookie = await server.login(alice.uin);
    const otherSocket = await server.open({ cookie: otherCookie });
    const { client } = await server.connect(alice);

    expect(await client.requestError('password.change', { currentPassword: 'nope', newPassword: 'newpass1' })).toMatchObject({
      code: 'forbidden',
    });
    await client.request('password.change', { currentPassword: PASSWORD, newPassword: 'newpass1' });
    expect(await otherSocket.nextEvent('session.kicked')).toEqual({ type: 'session.kicked', reason: 'signed_out' });
    expect((await otherSocket.closed).code).toBe(CLOSE_CODES.signedOut);

    const other = await server.app.inject({ method: 'GET', url: API_PATHS.session, headers: { cookie: otherCookie } });
    expect(other.statusCode).toBe(401);
    const current = await server.app.inject({ method: 'GET', url: API_PATHS.session, headers: { cookie: alice.cookie } });
    expect(current.statusCode).toBe(200);

    await expect(server.login(alice.uin, PASSWORD)).rejects.toThrow(/401/);
    await expect(server.login(alice.uin, 'newpass1')).resolves.toMatch(/^icq_session=/);
  });

  it('is limited to 5 attempts per 15 minutes', async () => {
    const alice = await server.createUser('Alice');
    const { client } = await server.connect(alice);
    for (let i = 0; i < 5; i += 1) {
      expect(await client.requestError('password.change', { currentPassword: 'wrong1', newPassword: 'newpass1' })).toMatchObject({
        code: 'forbidden',
      });
    }
    expect(await client.requestError('password.change', { currentPassword: PASSWORD, newPassword: 'newpass1' })).toEqual({
      code: 'rate_limited',
      message: PASSWORD_RATE_LIMITED,
    });
  });
});

describe('heartbeat', () => {
  it('terminates a socket that stops answering pings, and its user goes offline', async () => {
    const fast = await TestServer.start({}, { heartbeatMs: 50 });
    try {
      const alice = await fast.createUser('Alice');
      const bob = await fast.createUser('Bob');
      const { client: bobClient } = await fast.connect(bob);
      await bobClient.request('contact.add', { uin: alice.uin });
      const dead = await fast.open({ cookie: alice.cookie, autoPong: false });
      await dead.request('session.start', { status: 'online' });
      expect(await bobClient.nextEvent('presence')).toEqual({ type: 'presence', uin: alice.uin, status: 'online' });

      expect((await dead.closed).code).toBe(1006);
      expect(await bobClient.nextEvent('presence')).toEqual({ type: 'presence', uin: alice.uin, status: 'offline' });
      await bobClient.request('ping', {});
    } finally {
      await fast.stop();
    }
  });
});
