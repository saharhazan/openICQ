import { LIMITS } from '@openicq/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MESSAGE_RATE_LIMITED } from '../../src/transport/ws/handlers.ts';
import { DEFAULT_AWAY_MESSAGES } from '../../src/domain/defaults.ts';
import { TestServer } from './harness.ts';

let server: TestServer;

beforeEach(async () => {
  server = await TestServer.start();
});

afterEach(async () => {
  await server.stop();
});

describe('messages', () => {
  it('are delivered live in both directions', async () => {
    const alice = await server.createUser('Alice');
    const bob = await server.createUser('Bob');
    const { client: aliceClient } = await server.connect(alice);
    const { client: bobClient } = await server.connect(bob);

    const sent = await aliceClient.request('message.send', { to: bob.uin, text: 'Hi Bob!\nHow are you?' });
    expect(sent.message).toMatchObject({ from: alice.uin, to: bob.uin, kind: 'normal', deliveredOffline: false, read: false });
    expect(sent.autoResponse).toBeNull();
    expect((await bobClient.nextEvent('message')).message).toEqual(sent.message);

    const reply = await bobClient.request('message.send', { to: alice.uin, text: 'Uh-oh! Fine, thanks.' });
    expect((await aliceClient.nextEvent('message')).message).toEqual(reply.message);
    expect(reply.message.id).toBeGreaterThan(sent.message.id);
  });

  it('sent while offline arrive in the next snapshot, with notInList for strangers', async () => {
    const alice = await server.createUser('Alice');
    const carol = await server.createUser('Carol');
    const { client: aliceClient } = await server.connect(alice);

    const first = await aliceClient.request('message.send', { to: carol.uin, text: 'You there?' });
    const second = await aliceClient.request('message.send', { to: carol.uin, text: 'Call me.' });
    expect(first.message.deliveredOffline).toBe(true);

    const { client: carolClient, snapshot } = await server.connect(carol);
    expect(snapshot.unread.map((message) => message.text)).toEqual(['You there?', 'Call me.']);
    expect(snapshot.unread.every((message) => message.deliveredOffline && !message.read)).toBe(true);
    expect(snapshot.unread.map((message) => message.id)).toEqual([first.message.id, second.message.id]);
    expect(snapshot.notInList).toEqual([{ uin: alice.uin, nickname: 'Alice' }]);

    expect(await carolClient.request('message.markRead', { from: alice.uin })).toEqual({ count: 2 });
    expect(await carolClient.request('message.markRead', { from: alice.uin })).toEqual({ count: 0 });
    const after = await carolClient.request('session.start', { status: 'online' });
    expect(after.unread).toEqual([]);
    expect(after.notInList).toEqual([]);
    const history = await carolClient.request('history.get', { uin: alice.uin });
    expect(history.messages.every((message) => message.read)).toBe(true);
  });

  it('a sender who is a contact is not listed in notInList', async () => {
    const alice = await server.createUser('Alice');
    const carol = await server.createUser('Carol');
    const { client: carolClient } = await server.connect(carol);
    await carolClient.request('contact.add', { uin: alice.uin });
    carolClient.close();
    await carolClient.closed;

    const { client: aliceClient } = await server.connect(alice);
    await aliceClient.request('message.send', { to: carol.uin, text: 'hey' });
    const { snapshot } = await server.connect(carol);
    expect(snapshot.unread).toHaveLength(1);
    expect(snapshot.notInList).toEqual([]);
  });

  it('carry the auto-response of an Away recipient', async () => {
    const alice = await server.createUser('Alice');
    const bob = await server.createUser('Bob');
    const { client: aliceClient } = await server.connect(alice);
    const { client: bobClient } = await server.connect(bob, 'away');

    const defaultAway = await aliceClient.request('message.send', { to: bob.uin, text: 'ping' });
    expect(defaultAway.autoResponse).toEqual({ status: 'away', text: DEFAULT_AWAY_MESSAGES.away });

    await bobClient.request('status.set', { status: 'na', awayMessage: 'At lunch until 2.' });
    const custom = await aliceClient.request('message.send', { to: bob.uin, text: 'ping again' });
    expect(custom.autoResponse).toEqual({ status: 'na', text: 'At lunch until 2.' });
    expect(await aliceClient.request('away.get', { uin: bob.uin })).toEqual({ status: 'na', text: 'At lunch until 2.' });

    const settings = (await bobClient.request('session.start', { status: 'online' })).settings;
    expect(settings.awayMessages.na).toBe('At lunch until 2.');
    expect((await aliceClient.request('message.send', { to: bob.uin, text: 'now?' })).autoResponse).toBeNull();
    expect(await aliceClient.request('away.get', { uin: bob.uin })).toEqual({ status: 'online', text: '' });
  });

  it('Free For Chat stores its own message, readable with away.get, without an auto-response', async () => {
    const alice = await server.createUser('Alice');
    const bob = await server.createUser('Bob');
    const { client: aliceClient } = await server.connect(alice);
    const { client: bobClient } = await server.connect(bob, 'ffc');

    expect(await aliceClient.request('away.get', { uin: bob.uin })).toEqual({ status: 'ffc', text: DEFAULT_AWAY_MESSAGES.ffc });
    await bobClient.request('status.set', { status: 'ffc', awayMessage: 'Talk to me about ICQ' });
    expect(await aliceClient.request('away.get', { uin: bob.uin })).toEqual({ status: 'ffc', text: 'Talk to me about ICQ' });
    expect((await aliceClient.request('message.send', { to: bob.uin, text: 'hi' })).autoResponse).toBeNull();

    const settings = (await bobClient.request('session.start', { status: 'ffc' })).settings;
    expect(settings.awayMessages.ffc).toBe('Talk to me about ICQ');
    expect(
      await bobClient.requestError('status.set', { status: 'away', awayMessage: 'y'.repeat(LIMITS.awayMessage + 1) }),
    ).toMatchObject({ code: 'bad_request' });
  });

  it('carry the urgent flag in the result, the live event, the snapshot and the history', async () => {
    const alice = await server.createUser('Alice');
    const bob = await server.createUser('Bob');
    const { client: aliceClient } = await server.connect(alice);
    const { client: bobClient } = await server.connect(bob, 'occupied');

    const urgent = await aliceClient.request('message.send', { to: bob.uin, text: 'Call me now', urgent: true });
    const normal = await aliceClient.request('message.send', { to: bob.uin, text: 'Whenever' });
    expect(urgent.message.urgent).toBe(true);
    expect(normal.message.urgent).toBe(false);
    expect(urgent.autoResponse).toMatchObject({ status: 'occupied' });
    expect((await bobClient.nextEvent('message')).message.urgent).toBe(true);
    expect((await bobClient.nextEvent('message')).message.urgent).toBe(false);

    const snapshot = await bobClient.request('session.start', { status: 'occupied' });
    expect(snapshot.unread.map((message) => message.urgent)).toEqual([true, false]);
    const history = await aliceClient.request('history.get', { uin: bob.uin });
    expect(history.messages.map((message) => message.urgent)).toEqual([true, false]);
  });

  it('never mark a message urgent for a recipient in DND', async () => {
    const alice = await server.createUser('Alice');
    const bob = await server.createUser('Bob');
    const { client: aliceClient } = await server.connect(alice);
    const { client: bobClient } = await server.connect(bob, 'dnd');
    const sent = await aliceClient.request('message.send', { to: bob.uin, text: 'Urgent!', urgent: true });
    expect(sent.message.urgent).toBe(false);
    expect(sent.autoResponse).toEqual({ status: 'dnd', text: DEFAULT_AWAY_MESSAGES.dnd });
    expect((await bobClient.nextEvent('message')).message.urgent).toBe(false);
  });

  it('are limited to 450 characters, the original server limit', async () => {
    const alice = await server.createUser('Alice');
    const bob = await server.createUser('Bob');
    const { client } = await server.connect(alice);
    const longest = 'x'.repeat(LIMITS.messageText);
    expect(LIMITS.messageText).toBe(450);
    expect((await client.request('message.send', { to: bob.uin, text: longest })).message.text).toBe(longest);
    expect(await client.requestError('message.send', { to: bob.uin, text: `${longest}x` })).toMatchObject({
      code: 'bad_request',
    });
  });

  it('reject yourself and unknown recipients', async () => {
    const alice = await server.createUser('Alice');
    const { client } = await server.connect(alice);
    expect(await client.requestError('message.send', { to: alice.uin, text: 'me' })).toMatchObject({ code: 'bad_request' });
    expect(await client.requestError('message.send', { to: 999999, text: 'who' })).toMatchObject({ code: 'not_found' });
  });

  it('are limited to 10 per 10 seconds per connection', async () => {
    const alice = await server.createUser('Alice');
    const bob = await server.createUser('Bob');
    const { client } = await server.connect(alice);
    for (let i = 0; i < 10; i += 1) {
      await client.request('message.send', { to: bob.uin, text: `message ${i}` });
    }
    expect(await client.requestError('message.send', { to: bob.uin, text: 'one too many' })).toEqual({
      code: 'rate_limited',
      message: MESSAGE_RATE_LIMITED,
    });

    // Reconnecting does not reset the limit: it is kept per UIN.
    const { client: again } = await server.connect(alice);
    expect(await again.requestError('message.send', { to: bob.uin, text: 'after reconnect' })).toMatchObject({
      code: 'rate_limited',
    });
  });
});

describe('history', () => {
  it('pages from the newest, oldest first within a page', async () => {
    const alice = await server.createUser('Alice');
    const bob = await server.createUser('Bob');
    const { client: aliceClient } = await server.connect(alice);
    const { client: bobClient } = await server.connect(bob);
    const texts: string[] = [];
    for (let i = 1; i <= 7; i += 1) {
      const text = `m${i}`;
      texts.push(text);
      await (i % 2 === 0 ? bobClient : aliceClient).request('message.send', {
        to: i % 2 === 0 ? alice.uin : bob.uin,
        text,
      });
    }

    const newest = await aliceClient.request('history.get', { uin: bob.uin, limit: 3 });
    expect(newest.messages.map((message) => message.text)).toEqual(['m5', 'm6', 'm7']);
    expect(newest.hasMore).toBe(true);

    const middle = await aliceClient.request('history.get', { uin: bob.uin, limit: 3, beforeId: newest.messages[0]?.id });
    expect(middle.messages.map((message) => message.text)).toEqual(['m2', 'm3', 'm4']);
    expect(middle.hasMore).toBe(true);

    const oldest = await aliceClient.request('history.get', { uin: bob.uin, limit: 3, beforeId: middle.messages[0]?.id });
    expect(oldest.messages.map((message) => message.text)).toEqual(['m1']);
    expect(oldest.hasMore).toBe(false);

    const all = await bobClient.request('history.get', { uin: alice.uin });
    expect(all.messages.map((message) => message.text)).toEqual(texts);
    expect(all.hasMore).toBe(false);
  });
});
