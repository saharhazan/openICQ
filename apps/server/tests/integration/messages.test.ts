import { messageSchema } from '@openicq/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_MESSAGE } from '../../src/application/message-service.ts';
import { MESSAGES } from '../../src/application/support.ts';
import { TestServer, type Connected, type TestUser } from './harness.ts';

let server: TestServer;
let alice: TestUser;
let bob: TestUser;
let a: Connected;
let b: Connected;

beforeEach(async () => {
  server = await TestServer.start();
  alice = await server.createUser('Alice');
  bob = await server.createUser('Bob');
  a = await server.connect(alice);
  b = await server.connect(bob);
});

afterEach(async () => {
  await server.stop();
});

async function openDirect(): Promise<number> {
  const { chat } = await a.client.request('chat.direct', { uin: bob.uin });
  return chat.id;
}

async function send(text: string, extra: { replyToId?: number; attachmentFileIds?: number[] } = {}, from: Connected = a, chatId?: number) {
  const id = chatId ?? (await openDirect());
  return (await from.client.request('message.send', { chatId: id, clientId: `cid-${text}`, text, ...extra })).message;
}

describe('direct chat lifecycle', () => {
  it('has one chat per pair; it reaches the peer only with the first message', async () => {
    const { chat, users } = await a.client.request('chat.direct', { uin: bob.uin });
    expect(chat).toMatchObject({ type: 'direct', peer: bob.uin, lastMessage: null, unread: 0 });
    expect(users.map((user) => user.uin)).toContain(bob.uin);
    expect((await b.client.request('chat.direct', { uin: alice.uin })).chat.id).toBe(chat.id);

    const fresh = await server.createUser('Carol');
    const carol = await server.connect(fresh);
    const { chat: withCarol } = await a.client.request('chat.direct', { uin: fresh.uin });
    const carolSnapshot = await carol.client.request('session.start', {});
    expect(carolSnapshot.chats.map((entry) => entry.id)).not.toContain(withCarol.id);

    await a.client.request('message.send', { chatId: withCarol.id, clientId: 'x', text: 'Hello Carol' });
    const event = await carol.client.nextEvent('message');
    expect(event.chat).toMatchObject({ id: withCarol.id, peer: alice.uin, unread: 1 });
    expect(event.message).toMatchObject({ text: 'Hello Carol', sender: alice.uin, clientId: null });
    expect(event.users.map((user) => user.uin)).toContain(alice.uin);
  });

  it('opening a chat with yourself opens Favorites', async () => {
    const { chat } = await a.client.request('chat.direct', { uin: alice.uin });
    expect(chat.type).toBe('favorites');
  });

  it('chat.remove hides a direct chat until the next message; Favorites cannot be removed', async () => {
    const chatId = await openDirect();
    await send('first', {}, a, chatId);
    await b.client.request('chat.remove', { chatId });
    expect((await b.client.request('session.start', {})).chats.map((chat) => chat.id)).not.toContain(chatId);
    await send('second', {}, a, chatId);
    expect((await b.client.nextEvent('message', (event) => event.message.text === 'second')).chat.id).toBe(chatId);
    expect((await b.client.request('session.start', {})).chats.map((chat) => chat.id)).toContain(chatId);

    const favorites = a.snapshot.chats.find((chat) => chat.type === 'favorites');
    expect(await a.client.requestError('chat.remove', { chatId: favorites?.id })).toMatchObject({ code: 'bad_request' });
  });

  it('tells my other devices that a chat was hidden', async () => {
    const chatId = await openDirect();
    const other = await server.connect(await server.login(alice.uin));
    await a.client.request('chat.remove', { chatId });
    expect(await other.client.nextEvent('chat.removed')).toEqual({ type: 'chat.removed', chatId });
    await a.client.expectNoEvent('chat.removed');
  });

  it('pins and mutes per viewer and orders pinned chats first', async () => {
    const chatId = await openDirect();
    const other = await server.connect(await server.login(alice.uin));
    const { chat } = await a.client.request('chat.update', { chatId, pinned: true, muted: true });
    expect(chat).toMatchObject({ pinned: true, muted: true });
    expect((await other.client.nextEvent('chat.updated')).chat).toMatchObject({ id: chatId, pinned: true });
    const order = (await a.client.request('session.start', {})).chats.map((entry) => entry.type);
    expect(order).toEqual(['favorites', 'direct']);
    await send('ping', {}, a, chatId);
    expect((await b.client.nextEvent('message')).chat).toMatchObject({ pinned: false, muted: false });
  });
});

describe('sending', () => {
  it('echoes the message to the sender and pushes it to the peer and my other devices', async () => {
    const other = await server.connect(await server.login(alice.uin));
    const message = await send('Hello');
    expect(messageSchema.parse(message)).toMatchObject({ text: 'Hello', clientId: 'cid-Hello', sender: alice.uin, deleted: false });
    expect((await b.client.nextEvent('message')).message.id).toBe(message.id);
    const mine = await other.client.nextEvent('message');
    expect(mine.message.clientId).toBe('cid-Hello');
    expect(mine.chat.unread).toBe(0);
    await a.client.expectNoEvent('message');
  });

  it('gives messages globally increasing ids', async () => {
    const first = await send('one');
    const group = await a.client.request('group.create', { name: 'G', memberUins: [] });
    const second = await send('two', {}, a, group.chat.id);
    expect(second.id).toBeGreaterThan(first.id);
  });

  it('needs text or a file', async () => {
    const chatId = await openDirect();
    expect(await a.client.requestError('message.send', { chatId, clientId: 'x', text: '   ' })).toEqual({
      code: 'bad_request',
      message: EMPTY_MESSAGE,
    });
  });

  it('refuses chats the sender is not in, without revealing them', async () => {
    const chatId = await openDirect();
    const carol = await server.connect(await server.createUser('Carol'));
    expect(await carol.client.requestError('message.send', { chatId, clientId: 'x', text: 'hi' })).toEqual({
      code: 'not_found',
      message: MESSAGES.chatNotFound,
    });
    expect(await carol.client.requestError('chat.history', { chatId })).toMatchObject({ code: 'not_found' });
  });

  it('replies only within the same chat and carries a preview', async () => {
    const original = await send('question');
    const reply = await send('answer', { replyToId: original.id });
    expect(reply.replyTo).toEqual({ messageId: original.id, sender: alice.uin, text: 'question', hasAttachments: false, deleted: false });

    const favorites = a.snapshot.chats.find((chat) => chat.type === 'favorites');
    expect(
      await a.client.requestError('message.send', { chatId: favorites?.id, clientId: 'x', text: 'y', replyToId: original.id }),
    ).toMatchObject({ code: 'bad_request' });
  });

  it('forwards copies that name the first author, also when forwarded again', async () => {
    const chatId = await openDirect();
    const original = await send('from Bob', {}, b, chatId);
    const favorites = a.snapshot.chats.find((chat) => chat.type === 'favorites');
    if (favorites === undefined) throw new Error('no favorites');
    const { messages } = await a.client.request('message.forward', { fromChatId: chatId, messageIds: [original.id], toChatId: favorites.id });
    expect(messages[0]).toMatchObject({ chatId: favorites.id, sender: alice.uin, forwardedFrom: bob.uin, text: 'from Bob' });

    const again = await a.client.request('message.forward', {
      fromChatId: favorites.id,
      messageIds: [messages[0]?.id ?? 0],
      toChatId: chatId,
    });
    expect(again.messages[0]).toMatchObject({ forwardedFrom: bob.uin, sender: alice.uin });
    expect((await b.client.nextEvent('message', (event) => event.message.forwardedFrom === bob.uin)).message.text).toBe('from Bob');
  });
});

describe('editing and deleting', () => {
  it('edits only your own messages, sets editedAt and tells everyone', async () => {
    const message = await send('typo');
    const { message: edited } = await a.client.request('message.edit', { messageId: message.id, text: 'fixed' });
    expect(edited.text).toBe('fixed');
    expect(edited.editedAt).not.toBeNull();
    expect((await b.client.nextEvent('message.updated')).message).toMatchObject({ id: message.id, text: 'fixed' });
    expect(await b.client.requestError('message.edit', { messageId: message.id, text: 'mine now' })).toMatchObject({
      code: 'forbidden',
    });
  });

  it('delete for me hides it for me only and tells my other devices', async () => {
    const message = await send('secret');
    const chatId = message.chatId;
    const other = await server.connect(await server.login(alice.uin));
    await a.client.request('message.delete', { chatId, messageIds: [message.id], forAll: false });
    expect(await other.client.nextEvent('messages.removed')).toEqual({ type: 'messages.removed', chatId, messageIds: [message.id] });
    expect((await a.client.request('chat.history', { chatId })).messages).toHaveLength(0);
    expect((await b.client.request('chat.history', { chatId })).messages.map((entry) => entry.id)).toEqual([message.id]);
  });

  it('a message deleted for me or cleared does not come back through later updates', async () => {
    const hidden = await send('hidden');
    const cleared = await send('cleared');
    const chatId = hidden.chatId;
    await b.client.request('message.delete', { chatId, messageIds: [hidden.id], forAll: false });
    await a.client.request('message.edit', { messageId: hidden.id, text: 'edited' });
    await b.client.expectNoEvent('message.updated');
    await b.client.request('chat.clear', { chatId });
    await a.client.request('message.react', { messageId: cleared.id, reaction: 'like' });
    await b.client.expectNoEvent('message.updated');
    expect(await b.client.requestError('message.react', { messageId: cleared.id, reaction: 'sad' })).toMatchObject({
      code: 'not_found',
    });
  });

  it('delete for all leaves a tombstone without text, files or reactions', async () => {
    const message = await send('oops');
    await b.client.request('message.react', { messageId: message.id, reaction: 'funny' });
    await a.client.request('message.delete', { chatId: message.chatId, messageIds: [message.id], forAll: true });
    const event = await b.client.nextEvent('message.updated', (entry) => entry.message.deleted);
    expect(event.message).toMatchObject({ id: message.id, deleted: true, text: '', attachments: [], reactions: [] });
    expect(await a.client.requestError('message.edit', { messageId: message.id, text: 'back' })).toMatchObject({
      code: 'bad_request',
    });
  });

  it("refuses delete for all on another user's message in a direct chat", async () => {
    const message = await send('mine');
    expect(await b.client.requestError('message.delete', { chatId: message.chatId, messageIds: [message.id], forAll: true })).toMatchObject({
      code: 'forbidden',
    });
  });
});

describe('reactions', () => {
  it('keeps one reaction per user and computes mine for each viewer', async () => {
    const message = await send('nice');
    const { message: reacted } = await b.client.request('message.react', { messageId: message.id, reaction: 'like' });
    expect(reacted.reactions).toEqual([{ reaction: 'like', count: 1, mine: true }]);
    expect((await a.client.nextEvent('message.updated')).message.reactions).toEqual([{ reaction: 'like', count: 1, mine: false }]);

    await a.client.request('message.react', { messageId: message.id, reaction: 'like' });
    expect((await b.client.nextEvent('message.updated')).message.reactions).toEqual([{ reaction: 'like', count: 2, mine: true }]);

    const { message: changed } = await b.client.request('message.react', { messageId: message.id, reaction: 'sad' });
    expect(changed.reactions).toEqual([
      { reaction: 'like', count: 1, mine: false },
      { reaction: 'sad', count: 1, mine: true },
    ]);
    const { message: removed } = await b.client.request('message.react', { messageId: message.id, reaction: null });
    expect(removed.reactions).toEqual([{ reaction: 'like', count: 1, mine: false }]);
  });
});

describe('blocks', () => {
  it('a blocked user gets forbidden when sending, and so does the blocker', async () => {
    const chatId = await openDirect();
    await b.client.request('user.block', { uin: alice.uin, blocked: true });
    expect(await a.client.requestError('message.send', { chatId, clientId: 'x', text: 'hi' })).toEqual({
      code: 'forbidden',
      message: MESSAGES.writeForbidden,
    });
    expect(await b.client.requestError('message.send', { chatId, clientId: 'x', text: 'hi' })).toMatchObject({ code: 'forbidden' });
    expect(await a.client.requestError('typing', { chatId })).toMatchObject({ code: 'forbidden' });
    await b.client.request('user.block', { uin: alice.uin, blocked: false });
    expect((await a.client.request('message.send', { chatId, clientId: 'x', text: 'hi' })).message.text).toBe('hi');
  });
});
