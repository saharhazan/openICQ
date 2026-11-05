import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestServer } from './harness.ts';

let server: TestServer;

beforeEach(async () => {
  server = await TestServer.start();
});

afterEach(async () => {
  await server.stop();
});

describe('adding a contact without authorization', () => {
  it('sends added_you and shows live presence', async () => {
    const alice = await server.createUser('Alice');
    const bob = await server.createUser('Bob', { authRequired: false });
    const { client: aliceClient } = await server.connect(alice);
    const { client: bobClient } = await server.connect(bob, 'away');

    const { contact } = await aliceClient.request('contact.add', { uin: bob.uin });
    expect(contact).toEqual({ uin: bob.uin, nickname: 'Bob', status: 'away', awaitingAuth: false });

    const { notice } = await bobClient.nextEvent('notice');
    expect(notice).toMatchObject({ kind: 'added_you', from: alice.uin, fromNickname: 'Alice', reason: '' });

    await bobClient.request('status.set', { status: 'dnd' });
    expect(await aliceClient.nextEvent('presence')).toEqual({ type: 'presence', uin: bob.uin, status: 'dnd' });

    bobClient.close();
    expect(await aliceClient.nextEvent('presence')).toEqual({ type: 'presence', uin: bob.uin, status: 'offline' });
    const { contact: again } = await aliceClient.request('contact.rename', { uin: bob.uin, nickname: 'Bobby' });
    expect(again).toEqual({ uin: bob.uin, nickname: 'Bobby', status: 'offline', awaitingAuth: false });
  });

  it('rejects self, unknown UINs and duplicates', async () => {
    const alice = await server.createUser('Alice');
    const bob = await server.createUser('Bob');
    const { client } = await server.connect(alice);
    expect(await client.requestError('contact.add', { uin: alice.uin })).toMatchObject({ code: 'bad_request' });
    expect(await client.requestError('contact.add', { uin: 999999 })).toMatchObject({ code: 'not_found' });
    await client.request('contact.add', { uin: bob.uin });
    expect(await client.requestError('contact.add', { uin: bob.uin })).toMatchObject({ code: 'conflict' });
  });

  it('remove is a soft delete and re-adding revives the entry', async () => {
    const alice = await server.createUser('Alice');
    const bob = await server.createUser('Bob');
    const { client } = await server.connect(alice);
    await client.request('contact.add', { uin: bob.uin, nickname: 'B' });
    await client.request('contact.remove', { uin: bob.uin });
    expect(await client.requestError('contact.remove', { uin: bob.uin })).toMatchObject({ code: 'not_found' });

    const { contact } = await client.request('contact.add', { uin: bob.uin });
    expect(contact.nickname).toBe('Bob');
    const { contacts } = await client.request('session.start', { status: 'online' });
    expect(contacts.map((entry) => entry.uin)).toEqual([bob.uin]);
  });
});

describe('adding a contact that requires authorization', () => {
  it('stays offline until granted, then sends contact.updated and auth_granted', async () => {
    const alice = await server.createUser('Alice');
    const bob = await server.createUser('Bob', { authRequired: true });
    const { client: aliceClient } = await server.connect(alice);
    const { client: bobClient } = await server.connect(bob);

    const { contact } = await aliceClient.request('contact.add', { uin: bob.uin, reason: 'Hi Bob, it is Alice' });
    expect(contact).toEqual({ uin: bob.uin, nickname: 'Bob', status: 'offline', awaitingAuth: true });

    const { notice } = await bobClient.nextEvent('notice');
    expect(notice).toMatchObject({ kind: 'auth_request', from: alice.uin, fromNickname: 'Alice', reason: 'Hi Bob, it is Alice' });

    await bobClient.request('status.set', { status: 'away' });
    await aliceClient.expectNoEvent('presence');

    await bobClient.request('auth.respond', { noticeId: notice.id, grant: true });
    expect((await aliceClient.nextEvent('contact.updated')).contact).toEqual({
      uin: bob.uin,
      nickname: 'Bob',
      status: 'away',
      awaitingAuth: false,
    });
    expect((await aliceClient.nextEvent('notice')).notice).toMatchObject({ kind: 'auth_granted', from: bob.uin });

    await bobClient.request('status.set', { status: 'online' });
    expect(await aliceClient.nextEvent('presence')).toEqual({ type: 'presence', uin: bob.uin, status: 'online' });

    // The request is resolved: it cannot be answered twice and is gone from the snapshot.
    expect(await bobClient.requestError('auth.respond', { noticeId: notice.id, grant: true })).toMatchObject({
      code: 'not_found',
    });
    expect((await bobClient.request('session.start', { status: 'online' })).notices).toEqual([]);
  });

  it('deny sends auth_denied with the reason and keeps the contact awaiting', async () => {
    const alice = await server.createUser('Alice');
    const bob = await server.createUser('Bob', { authRequired: true });
    const { client: aliceClient } = await server.connect(alice);
    const { client: bobClient } = await server.connect(bob);

    await aliceClient.request('contact.add', { uin: bob.uin, reason: 'please' });
    const { notice } = await bobClient.nextEvent('notice');
    await bobClient.request('auth.respond', { noticeId: notice.id, grant: false, reason: 'I do not know you' });

    expect((await aliceClient.nextEvent('notice')).notice).toMatchObject({
      kind: 'auth_denied',
      from: bob.uin,
      reason: 'I do not know you',
    });
    await aliceClient.expectNoEvent('contact.updated');
    const { contacts } = await aliceClient.request('session.start', { status: 'online' });
    expect(contacts).toEqual([{ uin: bob.uin, nickname: 'Bob', status: 'offline', awaitingAuth: true }]);
  });

  it('delivers the request in the snapshot when the target was offline, and re-sends it on auth.request', async () => {
    const alice = await server.createUser('Alice');
    const bob = await server.createUser('Bob', { authRequired: true });
    const { client: aliceClient } = await server.connect(alice);
    await aliceClient.request('contact.add', { uin: bob.uin, reason: 'first' });
    await aliceClient.request('auth.request', { uin: bob.uin, reason: 'second' });

    const { client: bobClient, snapshot } = await server.connect(bob);
    expect(snapshot.notices).toHaveLength(1);
    expect(snapshot.notices[0]).toMatchObject({ kind: 'auth_request', from: alice.uin, reason: 'second' });

    const id = snapshot.notices[0]?.id ?? 0;
    await bobClient.request('notice.dismiss', { noticeId: id });
    expect((await bobClient.request('session.start', { status: 'online' })).notices).toEqual([]);
    expect(await bobClient.requestError('notice.dismiss', { noticeId: id })).toMatchObject({ code: 'not_found' });
  });

  it('removing a contact withdraws its pending request', async () => {
    const alice = await server.createUser('Alice');
    const bob = await server.createUser('Bob', { authRequired: true });
    const { client: aliceClient } = await server.connect(alice);
    await aliceClient.request('contact.add', { uin: bob.uin, reason: 'hi' });
    await aliceClient.request('contact.remove', { uin: bob.uin });
    const { snapshot } = await server.connect(bob);
    expect(snapshot.notices).toEqual([]);
  });

  it('repeated adds leave one notice per sender, not a pile', async () => {
    const alice = await server.createUser('Alice');
    const bob = await server.createUser('Bob', { authRequired: false });
    const { client: aliceClient } = await server.connect(alice);
    for (let i = 0; i < 3; i += 1) {
      await aliceClient.request('contact.add', { uin: bob.uin });
      await aliceClient.request('contact.remove', { uin: bob.uin });
    }
    const { snapshot } = await server.connect(bob);
    expect(snapshot.notices.map((notice) => notice.kind)).toEqual(['added_you']);
  });

  it('auth.request is refused for a contact that is already authorized', async () => {
    const alice = await server.createUser('Alice');
    const bob = await server.createUser('Bob', { authRequired: false });
    const { client } = await server.connect(alice);
    await client.request('contact.add', { uin: bob.uin });
    expect(await client.requestError('auth.request', { uin: bob.uin })).toMatchObject({ code: 'bad_request' });
  });
});

describe('privacy', () => {
  it('invisible hides presence from everyone', async () => {
    const alice = await server.createUser('Alice');
    const bob = await server.createUser('Bob');
    const { client: aliceClient } = await server.connect(alice);
    await aliceClient.request('contact.add', { uin: bob.uin });

    const { client: bobClient } = await server.connect(bob, 'invisible');
    await aliceClient.expectNoEvent('presence');
    const { contacts } = await aliceClient.request('session.start', { status: 'online' });
    expect(contacts[0]?.status).toBe('offline');

    // A message reveals nothing either: it counts as an offline message for the sender, yet arrives live.
    const sent = await aliceClient.request('message.send', { to: bob.uin, text: 'are you invisible?' });
    expect(sent.message.deliveredOffline).toBe(true);
    expect((await bobClient.nextEvent('message')).message.text).toBe('are you invisible?');

    await bobClient.request('status.set', { status: 'online' });
    expect(await aliceClient.nextEvent('presence')).toEqual({ type: 'presence', uin: bob.uin, status: 'online' });
    await bobClient.request('status.set', { status: 'invisible' });
    expect(await aliceClient.nextEvent('presence')).toEqual({ type: 'presence', uin: bob.uin, status: 'offline' });
  });

  it('ignore hides presence at once and drops messages; unignore restores presence', async () => {
    const alice = await server.createUser('Alice');
    const bob = await server.createUser('Bob');
    const { client: aliceClient } = await server.connect(alice);
    const { client: bobClient } = await server.connect(bob);
    await aliceClient.request('contact.add', { uin: bob.uin });
    await bobClient.nextEvent('notice');

    await bobClient.request('ignore.add', { uin: alice.uin });
    expect(await aliceClient.nextEvent('presence')).toEqual({ type: 'presence', uin: bob.uin, status: 'offline' });

    const sent = await aliceClient.request('message.send', { to: bob.uin, text: 'hello?' });
    expect(sent.message.text).toBe('hello?');
    expect(sent.message.deliveredOffline).toBe(true);
    expect(sent.autoResponse).toBeNull();
    await bobClient.expectNoEvent('message');

    const bobView = await bobClient.request('session.start', { status: 'online' });
    expect(bobView.ignored).toEqual([alice.uin]);
    expect(bobView.unread).toEqual([]);
    expect(bobView.notInList).toEqual([]);
    expect((await bobClient.request('history.get', { uin: alice.uin })).messages).toEqual([]);
    expect((await aliceClient.request('history.get', { uin: bob.uin })).messages.map((m) => m.text)).toEqual(['hello?']);

    // An ignored user's authorization request never reaches the owner either.
    await aliceClient.request('contact.remove', { uin: bob.uin });
    await aliceClient.request('contact.add', { uin: bob.uin });
    await bobClient.expectNoEvent('notice');

    await bobClient.request('ignore.remove', { uin: alice.uin });
    expect(await aliceClient.nextEvent('presence')).toEqual({ type: 'presence', uin: bob.uin, status: 'online' });
    expect((await bobClient.request('session.start', { status: 'online' })).ignored).toEqual([]);
  });

  it('ignore rejects yourself and unknown users', async () => {
    const alice = await server.createUser('Alice');
    const { client } = await server.connect(alice);
    expect(await client.requestError('ignore.add', { uin: alice.uin })).toMatchObject({ code: 'bad_request' });
    expect(await client.requestError('ignore.add', { uin: 999999 })).toMatchObject({ code: 'not_found' });
  });
});
