import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TYPING_RATE_LIMITED } from '../../src/transport/ws/handlers.ts';
import { TestServer, type Connected, type TestUser } from './harness.ts';

let server: TestServer;
let alice: TestUser;
let bob: TestUser;
let a: Connected;
let chatId: number;

beforeEach(async () => {
  server = await TestServer.start();
  alice = await server.createUser('Alice');
  bob = await server.createUser('Bob');
  a = await server.connect(alice);
  chatId = (await a.client.request('chat.direct', { uin: bob.uin })).chat.id;
});

afterEach(async () => {
  await server.stop();
});

async function say(text: string, from: Connected = a) {
  return (await from.client.request('message.send', { chatId, clientId: text, text })).message;
}

function chatIn(snapshot: Connected['snapshot']) {
  const chat = snapshot.chats.find((entry) => entry.id === chatId);
  if (chat === undefined) throw new Error(`chat ${chatId} is not in the snapshot`);
  return chat;
}

describe('delivery marks', () => {
  it('reports delivered when the message reaches a connection of the peer', async () => {
    const b = await server.connect(bob);
    const message = await say('hello');
    await b.client.nextEvent('message');
    expect(await a.client.nextEvent('delivered')).toEqual({ type: 'delivered', chatId, uin: bob.uin, messageId: message.id });
  });

  it('reports delivered when an offline peer loads the snapshot', async () => {
    const message = await say('while you were away');
    await a.client.expectNoEvent('delivered');
    const b = await server.connect(bob);
    expect(await a.client.nextEvent('delivered')).toMatchObject({ uin: bob.uin, messageId: message.id });
    expect(chatIn(b.snapshot)).toMatchObject({ unread: 1, peerDeliveredId: 0, lastReadId: 0 });
    const after = await a.client.request('chat.history', { chatId });
    expect(after.readMarks).toContainEqual({ uin: bob.uin, lastReadId: 0, lastDeliveredId: message.id });
  });

  it('shows the peer marks in the chat row', async () => {
    const message = await say('hi');
    const b = await server.connect(bob);
    await b.client.request('chat.read', { chatId, messageId: message.id });
    const row = chatIn(await a.client.request('session.start', {}));
    expect(row).toMatchObject({ peerDeliveredId: message.id, peerReadId: message.id });
  });
});

describe('read marks and unread counts', () => {
  it('counts unread messages of others and moves the read mark forward only', async () => {
    const b = await server.connect(bob);
    const first = await say('one');
    const second = await say('two');
    await say('mine', b);
    expect(chatIn(await b.client.request('session.start', {})).unread).toBe(2);

    await b.client.request('chat.read', { chatId, messageId: second.id });
    expect(await a.client.nextEvent('read')).toEqual({ type: 'read', chatId, uin: bob.uin, messageId: second.id });
    await b.client.request('chat.read', { chatId, messageId: first.id });
    await a.client.expectNoEvent('read');
    expect(chatIn(await b.client.request('session.start', {}))).toMatchObject({ unread: 0, lastReadId: second.id });
  });

  it('does not count deleted, hidden or cleared messages', async () => {
    const b = await server.connect(bob);
    const deleted = await say('deleted');
    const hidden = await say('hidden');
    await say('counted');
    await a.client.request('message.delete', { chatId, messageIds: [deleted.id], forAll: true });
    await b.client.request('message.delete', { chatId, messageIds: [hidden.id], forAll: false });
    expect(chatIn(await b.client.request('session.start', {})).unread).toBe(1);
    await b.client.request('chat.clear', { chatId });
    const cleared = chatIn(await b.client.request('session.start', {}));
    expect(cleared).toMatchObject({ unread: 0, lastMessage: null });
    expect((await b.client.request('chat.history', { chatId })).messages).toEqual([]);
    expect((await a.client.request('chat.history', { chatId })).messages).toHaveLength(3);
  });

  it('tells my other devices about reads, mark as unread and clear', async () => {
    const message = await say('hi');
    const b1 = await server.connect(bob);
    const b2 = await server.connect(await server.login(bob.uin));
    await b1.client.request('chat.read', { chatId, messageId: message.id });
    expect(await b2.client.nextEvent('read')).toMatchObject({ uin: bob.uin, messageId: message.id });
    await b1.client.expectNoEvent('read');

    await b1.client.request('chat.markUnread', { chatId });
    expect((await b2.client.nextEvent('chat.updated')).chat).toMatchObject({ id: chatId, markedUnread: true });
    await b1.client.request('chat.read', { chatId, messageId: message.id });
    expect((await b2.client.nextEvent('chat.updated')).chat).toMatchObject({ id: chatId, markedUnread: false });

    await b1.client.request('chat.clear', { chatId });
    expect(await b2.client.nextEvent('messages.removed')).toEqual({ type: 'messages.removed', chatId, messageIds: [message.id] });
  });
});

describe('marks across a block', () => {
  it('sends no read to a peer the reader blocked, and still tells the reader devices', async () => {
    const b = await server.connect(bob);
    const otherBob = await server.connect(await server.login(bob.uin));
    const message = await say('before the block');
    await a.client.nextEvent('delivered');
    await b.client.request('user.block', { uin: alice.uin, blocked: true });
    await b.client.request('chat.read', { chatId, messageId: message.id });
    expect(await otherBob.client.nextEvent('read')).toMatchObject({ uin: bob.uin, messageId: message.id });
    await a.client.expectNoEvent('read');
  });

  it('sends neither delivered nor read to a peer who blocked the reader', async () => {
    const message = await say('while Bob is away');
    await a.client.request('user.block', { uin: bob.uin, blocked: true });
    const b = await server.connect(bob);
    expect(chatIn(b.snapshot).id).toBe(chatId);
    await b.client.request('chat.read', { chatId, messageId: message.id });
    await a.client.expectNoEvent('delivered');
    await a.client.expectNoEvent('read');
  });
});

describe('typing', () => {
  it('relays typing to the other members only, at most once every 2 seconds per chat', async () => {
    const b = await server.connect(bob);
    const mine = await server.connect(await server.login(alice.uin));
    await say('open the chat for Bob');
    await a.client.request('typing', { chatId });
    expect(await b.client.nextEvent('typing')).toEqual({ type: 'typing', chatId, uin: alice.uin });
    await mine.client.expectNoEvent('typing');
    expect(await a.client.requestError('typing', { chatId })).toEqual({ code: 'rate_limited', message: TYPING_RATE_LIMITED });
  });

  it('is not relayed to a peer who does not have the chat in the list yet', async () => {
    const b = await server.connect(bob);
    await a.client.request('typing', { chatId });
    await b.client.expectNoEvent('typing');
  });
});
