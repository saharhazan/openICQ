import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MESSAGES } from '../../src/application/support.ts';
import { MESSAGE_RATE_LIMITED } from '../../src/transport/ws/handlers.ts';
import { TestServer, type Connected, type TestUser } from './harness.ts';

let server: TestServer;
let alice: TestUser;
let a: Connected;

beforeEach(async () => {
  server = await TestServer.start();
  alice = await server.createUser('Alice', { lastName: 'Liddell', nickname: 'alice.l', email: 'alice@example.com' });
  a = await server.connect(alice);
});

afterEach(async () => {
  await server.stop();
});

describe('user.search', () => {
  it('finds by exact ICQ number, nickname prefix or part of the name, without the searcher', async () => {
    const bob = await server.createUser('Bob', { lastName: 'Builder', nickname: 'bobby', email: 'bob@example.com' });
    const b = await server.connect(bob);
    const uins = async (query: string) => (await b.client.request('user.search', { query })).users.map((user) => user.uin);
    expect(await uins(String(alice.uin))).toEqual([alice.uin]);
    expect(await uins('alice@exa')).toEqual([]);
    expect(await uins('ali')).toEqual([alice.uin]);
    expect(await uins('lidd')).toEqual([alice.uin]);
    expect(await uins('Alice Lid')).toEqual([alice.uin]);
    expect(await uins('bob')).toEqual([]);
    expect(await uins('100')).toEqual([]);
  });

  it('never matches an email, so search cannot tell whether an address has an account', async () => {
    const b = await server.connect(await server.createUser('Bob'));
    for (const query of ['alice@example.com', 'ALICE@example.com']) {
      expect((await b.client.request('user.search', { query })).users).toEqual([]);
    }
  });

  it('returns at most 50 users and treats LIKE wildcards literally', async () => {
    for (let i = 0; i < 52; i += 1) await server.register({ firstName: `Zed${i}`, password: 'secret123' });
    expect((await a.client.request('user.search', { query: 'zed' })).users).toHaveLength(50);
    expect((await a.client.request('user.search', { query: '%%' })).users).toEqual([]);
    // 52 real scrypt registrations: slow when the whole suite runs in parallel.
  }, 30_000);

  it('rejects queries shorter than 2 characters', async () => {
    expect(await a.client.requestError('user.search', { query: 'a' })).toMatchObject({ code: 'bad_request' });
  });
});

describe('contacts', () => {
  it('adds and removes contacts and tells my other devices', async () => {
    const bob = await server.createUser('Bob');
    const other = await server.connect(await server.login(alice.uin));
    const { user } = await a.client.request('contact.add', { uin: bob.uin });
    expect(user).toMatchObject({ uin: bob.uin, isContact: true, blocked: false });
    expect(await other.client.nextEvent('contacts.changed')).toEqual({ type: 'contacts.changed', contacts: [bob.uin] });
    expect((await a.client.request('session.start', {})).contacts).toEqual([bob.uin]);

    await a.client.request('contact.remove', { uin: bob.uin });
    expect(await other.client.nextEvent('contacts.changed')).toEqual({ type: 'contacts.changed', contacts: [] });
    expect(await a.client.requestError('contact.remove', { uin: bob.uin })).toMatchObject({ code: 'not_found' });
    expect(await a.client.requestError('contact.add', { uin: alice.uin })).toMatchObject({ code: 'bad_request' });
    expect(await a.client.requestError('contact.add', { uin: 999999 })).toMatchObject({ code: 'not_found' });
  });
});

describe('blocks', () => {
  it('marks the user blocked for the blocker and hides the blocker presence from them', async () => {
    const bob = await server.createUser('Bob');
    const b = await server.connect(bob);
    await b.client.request('contact.add', { uin: alice.uin });
    expect((await b.client.request('user.get', { uin: alice.uin })).user.presence.online).toBe(true);
    const { user } = await a.client.request('user.block', { uin: bob.uin, blocked: true });
    expect(user.blocked).toBe(true);
    expect(await b.client.nextEvent('presence')).toEqual({ type: 'presence', uin: alice.uin, presence: { online: false, lastSeen: null } });
    expect((await b.client.request('user.get', { uin: alice.uin })).user.presence).toEqual({ online: false, lastSeen: null });
    expect(await a.client.requestError('user.block', { uin: alice.uin, blocked: true })).toMatchObject({ code: 'bad_request' });
  });

  it('a user who blocked the inviter is refused when added to a group', async () => {
    const bob = await server.createUser('Bob');
    const b = await server.connect(bob);
    await b.client.request('user.block', { uin: alice.uin, blocked: true });
    const { chat } = await a.client.request('group.create', { name: 'G' });
    expect(await a.client.request('group.addMembers', { chatId: chat.id, uins: [bob.uin] })).toEqual({ added: [], refused: [bob.uin] });
  });
});

describe('profile', () => {
  it('updates the profile and tells peers and my other devices', async () => {
    const bob = await server.createUser('Bob');
    const b = await server.connect(bob);
    await b.client.request('contact.add', { uin: alice.uin });
    const other = await server.connect(await server.login(alice.uin));
    const { me } = await a.client.request('profile.update', { firstName: 'Alicia', about: 'Hello', nickname: 'alicia' });
    expect(me).toMatchObject({ firstName: 'Alicia', about: 'Hello', nickname: 'alicia', email: 'alice@example.com' });
    expect((await b.client.nextEvent('user.updated')).user).toMatchObject({ uin: alice.uin, firstName: 'Alicia', isContact: true });
    expect((await other.client.nextEvent('user.updated')).user).toMatchObject({ uin: alice.uin, nickname: 'alicia' });
    expect((await a.client.request('profile.update', { nickname: null })).me.nickname).toBeNull();
  });

  it('refuses a nickname someone else has', async () => {
    await server.createUser('Bob', { nickname: 'bobby' });
    expect(await a.client.requestError('profile.update', { nickname: 'BOBBY' })).toEqual({ code: 'conflict', message: MESSAGES.nicknameTaken });
  });

  it('checks nicknames', async () => {
    await server.createUser('Bob', { nickname: 'bobby' });
    expect(await a.client.request('nickname.check', { nickname: 'bobby' })).toEqual({ available: false, reason: 'taken' });
    expect(await a.client.request('nickname.check', { nickname: 'alice.l' })).toEqual({ available: true, reason: null });
    expect(await a.client.request('nickname.check', { nickname: '9lives' })).toEqual({ available: false, reason: 'invalid' });
    expect(await a.client.request('nickname.check', { nickname: 'free.name' })).toEqual({ available: true, reason: null });
  });

  it('stores the group invite setting', async () => {
    expect(await a.client.request('settings.update', { groupInvites: 'contacts' })).toEqual({ settings: { groupInvites: 'contacts' } });
    expect((await a.client.request('session.start', {})).settings).toEqual({ groupInvites: 'contacts' });
  });
});

describe('message rate limit', () => {
  it('allows 20 messages in 10 seconds per user, across devices', async () => {
    const favorites = a.snapshot.chats.find((chat) => chat.type === 'favorites');
    if (favorites === undefined) throw new Error('no favorites');
    const other = await server.connect(await server.login(alice.uin));
    for (let i = 0; i < 20; i += 1) {
      const sender = i % 2 === 0 ? a : other;
      await sender.client.request('message.send', { chatId: favorites.id, clientId: `m${i}`, text: `note ${i}` });
    }
    expect(await a.client.requestError('message.send', { chatId: favorites.id, clientId: 'x', text: 'too many' })).toEqual({
      code: 'rate_limited',
      message: MESSAGE_RATE_LIMITED,
    });
  });
});
