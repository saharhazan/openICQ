import { API_PATHS, CLOSE_CODES, sessionSnapshotSchema } from '@openicq/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PASSWORD_RATE_LIMITED } from '../../src/transport/ws/handlers.ts';
import { ORIGIN, PASSWORD, TestServer } from './harness.ts';

const FIREFOX_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0';

let server: TestServer;

beforeEach(async () => {
  server = await TestServer.start();
});

afterEach(async () => {
  await server.stop();
});

describe('WebSocket authentication', () => {
  it('closes a socket without a valid session cookie with 4001', async () => {
    expect((await (await server.open()).closed).code).toBe(CLOSE_CODES.unauthorized);
    expect((await (await server.open({ cookie: 'openicq_session=forged' })).closed).code).toBe(CLOSE_CODES.unauthorized);
  });

  it('rejects a foreign or missing Origin even with a valid cookie', async () => {
    const alice = await server.createUser('Alice');
    expect((await (await server.open({ cookie: alice.cookie, origin: 'https://evil.example' })).closed).code).toBe(
      CLOSE_CODES.unauthorized,
    );
    expect((await (await server.open({ cookie: alice.cookie, origin: null })).closed).code).toBe(CLOSE_CODES.unauthorized);
  });

  it('rejects every request before session.start', async () => {
    const alice = await server.createUser('Alice');
    const client = await server.open({ cookie: alice.cookie });
    expect(await client.requestError('ping', {})).toMatchObject({ code: 'unauthorized' });
  });

  it('answers malformed frames and closes on binary frames with 4004', async () => {
    const alice = await server.createUser('Alice');
    const { client } = await server.connect(alice);
    client.sendRaw('not json');
    expect((await client.nextOrphanError()).kind).toBe('error');
    expect(await client.requestError('no.such.request', {})).toMatchObject({ code: 'bad_request' });
    expect(await client.requestError('chat.read', { chatId: 'x' })).toMatchObject({ code: 'bad_request' });
    client.sendRaw(Buffer.from([1, 2, 3]));
    expect((await client.closed).code).toBe(CLOSE_CODES.protocolViolation);
  });
});

describe('session.start', () => {
  it('returns the snapshot: me, settings, chats, users and contacts', async () => {
    const alice = await server.createUser('Alice', { lastName: 'Liddell', nickname: 'alice.l', email: 'alice@example.com' });
    const { snapshot } = await server.connect(alice);
    const parsed = sessionSnapshotSchema.parse(snapshot);
    expect(parsed.me).toEqual({
      uin: alice.uin,
      nickname: 'alice.l',
      firstName: 'Alice',
      lastName: 'Liddell',
      about: '',
      avatarFileId: null,
      email: 'alice@example.com',
    });
    expect(parsed.settings).toEqual({ groupInvites: 'everybody' });
    expect(parsed.contacts).toEqual([]);
    expect(parsed.chats.map((chat) => chat.type)).toEqual(['favorites']);
  });
});

describe('many devices', () => {
  it('keeps every session and socket connected; a new sign-in disconnects nobody', async () => {
    const alice = await server.createUser('Alice');
    const laptop = await server.connect(alice);
    const phoneCookie = await server.login(alice.uin, PASSWORD, true, FIREFOX_WINDOWS);
    const phone = await server.connect(phoneCookie);
    expect(await laptop.client.request('ping', {})).toHaveProperty('serverTime');
    expect(await phone.client.request('ping', {})).toHaveProperty('serverTime');
  });

  it('lists sessions with a short device description, the current one first', async () => {
    const alice = await server.createUser('Alice');
    await server.login(alice.uin, PASSWORD, true, FIREFOX_WINDOWS);
    const { client } = await server.connect(alice);
    const { sessions } = await client.request('sessions.list', {});
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({ current: true, device: 'Chrome on macOS' });
    expect(sessions[1]).toMatchObject({ current: false, device: 'Firefox on Windows' });
  });

  it('sessions.close revokes the token and closes its sockets with session.closed and 4002', async () => {
    const alice = await server.createUser('Alice');
    const laptop = await server.connect(alice);
    const phoneCookie = await server.login(alice.uin, PASSWORD, true, FIREFOX_WINDOWS);
    const phone = await server.connect(phoneCookie);
    const { sessions } = await laptop.client.request('sessions.list', {});
    const other = sessions.find((session) => !session.current);
    if (other === undefined) throw new Error('expected a second session');

    await laptop.client.request('sessions.close', { sessionId: other.id });
    expect(await phone.client.nextEvent('session.closed')).toEqual({ type: 'session.closed', reason: 'closed_remotely' });
    expect((await phone.client.closed).code).toBe(CLOSE_CODES.sessionClosed);
    const check = await server.app.inject({ method: 'GET', url: API_PATHS.session, headers: { cookie: phoneCookie } });
    expect(check.statusCode).toBe(401);
    expect((await laptop.client.request('sessions.list', {})).sessions).toHaveLength(1);
  });

  it('refuses to close the current session or a foreign one through sessions.close', async () => {
    const alice = await server.createUser('Alice');
    const bob = await server.createUser('Bob');
    const { client } = await server.connect(alice);
    const mine = (await client.request('sessions.list', {})).sessions[0];
    if (mine === undefined) throw new Error('expected a session');
    expect(await client.requestError('sessions.close', { sessionId: mine.id })).toMatchObject({ code: 'bad_request' });
    const bobs = (await (await server.connect(bob)).client.request('sessions.list', {})).sessions[0];
    if (bobs === undefined) throw new Error('expected a session');
    expect(await client.requestError('sessions.close', { sessionId: bobs.id })).toMatchObject({ code: 'not_found' });
  });

  it('closes every other session with { others: true }', async () => {
    const alice = await server.createUser('Alice');
    const laptop = await server.connect(alice);
    const phone = await server.connect(await server.login(alice.uin));
    const tablet = await server.connect(await server.login(alice.uin));
    await laptop.client.request('sessions.close', { others: true });
    expect((await phone.client.closed).code).toBe(CLOSE_CODES.sessionClosed);
    expect((await tablet.client.closed).code).toBe(CLOSE_CODES.sessionClosed);
    expect((await laptop.client.request('sessions.list', {})).sessions).toHaveLength(1);
  });

  it('logout closes only the current session, with signed_out and 4003', async () => {
    const alice = await server.createUser('Alice');
    const laptop = await server.connect(alice);
    const phone = await server.connect(await server.login(alice.uin));
    await server.app.inject({ method: 'POST', url: API_PATHS.logout, headers: { origin: ORIGIN, cookie: alice.cookie } });
    expect(await laptop.client.nextEvent('session.closed')).toEqual({ type: 'session.closed', reason: 'signed_out' });
    expect((await laptop.client.closed).code).toBe(CLOSE_CODES.signedOut);
    expect(await phone.client.request('ping', {})).toHaveProperty('serverTime');
  });

  it('password.change verifies the old password and closes the other sessions', async () => {
    const alice = await server.createUser('Alice');
    const laptop = await server.connect(alice);
    const phone = await server.connect(await server.login(alice.uin));
    expect(await laptop.client.requestError('password.change', { oldPassword: 'wrong', newPassword: 'newpass1' })).toMatchObject({
      code: 'forbidden',
    });
    await laptop.client.request('password.change', { oldPassword: PASSWORD, newPassword: 'newpass1' });
    expect((await phone.client.closed).code).toBe(CLOSE_CODES.sessionClosed);
    expect((await server.loginResponse(String(alice.uin), 'newpass1')).statusCode).toBe(200);
    expect((await server.loginResponse(String(alice.uin), PASSWORD)).statusCode).toBe(401);
  });

  it('limits password change attempts', async () => {
    const alice = await server.createUser('Alice');
    const { client } = await server.connect(alice);
    for (let i = 0; i < 5; i += 1) await client.requestError('password.change', { oldPassword: 'wrong', newPassword: 'newpass1' });
    expect(await client.requestError('password.change', { oldPassword: PASSWORD, newPassword: 'newpass1' })).toEqual({
      code: 'rate_limited',
      message: PASSWORD_RATE_LIMITED,
    });
  });
});

describe('presence', () => {
  it('is online while any connection is open; lastSeen is set when the last one closes', async () => {
    const alice = await server.createUser('Alice');
    const bob = await server.createUser('Bob');
    const watcher = await server.connect(bob);
    await watcher.client.request('contact.add', { uin: alice.uin });

    const first = await server.connect(alice);
    expect(await watcher.client.nextEvent('presence')).toMatchObject({ uin: alice.uin, presence: { online: true } });
    const second = await server.connect(await server.login(alice.uin));
    first.client.close();
    await first.client.closed;
    await watcher.client.expectNoEvent('presence');
    expect((await watcher.client.request('user.get', { uin: alice.uin })).user.presence.online).toBe(true);

    second.client.close();
    const offline = await watcher.client.nextEvent('presence');
    expect(offline.presence.online).toBe(false);
    expect(offline.presence.lastSeen).not.toBeNull();
    expect((await watcher.client.request('user.get', { uin: alice.uin })).user.presence).toEqual(offline.presence);
  });

  it('reaches direct chat peers and group co-members, not strangers', async () => {
    const alice = await server.createUser('Alice');
    const peer = await server.connect(await server.createUser('Peer'));
    const groupmate = await server.connect(await server.createUser('Groupmate'));
    const stranger = await server.connect(await server.createUser('Stranger'));
    // The first message shows the direct chat to Alice too; only then does it link the two.
    const { chat } = await peer.client.request('chat.direct', { uin: alice.uin });
    await peer.client.request('message.send', { chatId: chat.id, clientId: 'hi', text: 'hi' });
    await groupmate.client.request('group.create', { name: 'Club', memberUins: [alice.uin] });

    await server.connect(alice);
    expect(await peer.client.nextEvent('presence')).toMatchObject({ uin: alice.uin, presence: { online: true } });
    expect(await groupmate.client.nextEvent('presence')).toMatchObject({ uin: alice.uin, presence: { online: true } });
    await stranger.client.expectNoEvent('presence');
  });

  it('gives no presence or profile stream through a direct chat the other side never saw', async () => {
    const victim = await server.createUser('Victim');
    const prober = await server.connect(await server.createUser('Prober'));
    const { chat } = await prober.client.request('chat.direct', { uin: victim.uin });

    const v = await server.connect(victim);
    await v.client.request('profile.update', { about: 'new about' });
    await prober.client.expectNoEvent('presence');
    await prober.client.expectNoEvent('user.updated');

    // Hiding the chat again ends the stream the same way.
    await v.client.request('message.send', { chatId: chat.id, clientId: 'hello', text: 'hello' });
    await v.client.request('profile.update', { about: 'visible now' });
    expect((await prober.client.nextEvent('user.updated')).user.about).toBe('visible now');
    await v.client.request('chat.remove', { chatId: chat.id });
    v.client.close();
    await v.client.closed;
    await prober.client.expectNoEvent('presence');
  });
});

describe('ordering', () => {
  it('delivers the reply before the events the request caused on the same socket', async () => {
    const alice = await server.createUser('Alice');
    const bob = await server.createUser('Bob');
    const a = await server.connect(alice);
    await server.connect(bob);
    const { chat } = await a.client.request('chat.direct', { uin: bob.uin });
    const sent = await a.client.request('message.send', { chatId: chat.id, clientId: 'c1', text: 'hi' });
    await a.client.nextEvent('delivered');
    const replyIndex = a.client.log.findIndex((frame) => frame.kind === 'result' && JSON.stringify(frame.result).includes('"c1"'));
    const deliveredIndex = a.client.log.findIndex((frame) => frame.kind === 'event' && frame.event.type === 'delivered');
    expect(sent.message.clientId).toBe('c1');
    expect(replyIndex).toBeGreaterThanOrEqual(0);
    expect(deliveredIndex).toBeGreaterThan(replyIndex);
  });
});
