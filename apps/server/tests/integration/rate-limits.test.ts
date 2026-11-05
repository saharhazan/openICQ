import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GROUP_CREATE_RATE_LIMITED, WRITE_RATE_LIMITED } from '../../src/transport/ws/handlers.ts';
import { TestServer, type Connected, type TestUser } from './harness.ts';

let server: TestServer;
let alice: TestUser;
let a: Connected;

beforeEach(async () => {
  server = await TestServer.start();
  alice = await server.createUser('Alice');
  a = await server.connect(alice);
});

afterEach(async () => {
  await server.stop();
});

describe('per-user request limits', () => {
  it('allows 30 edits, reactions and deletes together per 10 seconds, on every device of the user', async () => {
    const bob = await server.createUser('Bob');
    const { chat } = await a.client.request('chat.direct', { uin: bob.uin });
    const { message } = await a.client.request('message.send', { chatId: chat.id, clientId: 'm', text: 'hello' });
    for (let i = 0; i < 15; i += 1) {
      await a.client.request('message.react', { messageId: message.id, reaction: i % 2 === 0 ? 'like' : null });
      await a.client.request('message.edit', { messageId: message.id, text: `hello ${i}` });
    }
    const phone = await server.connect(await server.login(alice.uin));
    const limited = { code: 'rate_limited', message: WRITE_RATE_LIMITED };
    expect(await phone.client.requestError('message.delete', { chatId: chat.id, messageIds: [message.id], forAll: true })).toEqual(limited);
    expect(await a.client.requestError('message.react', { messageId: message.id, reaction: 'funny' })).toEqual(limited);
    expect(await a.client.requestError('message.edit', { messageId: message.id, text: 'too fast' })).toEqual(limited);
    // Sending has its own limit and still works.
    expect((await a.client.request('message.send', { chatId: chat.id, clientId: 'n', text: 'still here' })).message.text).toBe('still here');
  });

  it('allows 10 new groups per hour per user', async () => {
    for (let i = 0; i < 10; i += 1) await a.client.request('group.create', { name: `Group ${i}` });
    expect(await a.client.requestError('group.create', { name: 'One more' })).toEqual({
      code: 'rate_limited',
      message: GROUP_CREATE_RATE_LIMITED,
    });
    const b = await server.connect(await server.createUser('Bob'));
    expect((await b.client.request('group.create', { name: 'Bob group' })).chat.title).toBe('Bob group');
  });
});
