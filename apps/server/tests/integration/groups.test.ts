import type { Chat } from '@openicq/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INVALID_LINK_MESSAGE } from '../../src/application/group-support.ts';
import { MESSAGES } from '../../src/application/support.ts';
import { TestServer, type Connected, type TestUser } from './harness.ts';

let server: TestServer;
let owner: TestUser;
let o: Connected;

beforeEach(async () => {
  server = await TestServer.start();
  owner = await server.createUser('Owner');
  o = await server.connect(owner);
});

afterEach(async () => {
  await server.stop();
});

async function member(name: string): Promise<{ user: TestUser; conn: Connected }> {
  const user = await server.createUser(name);
  return { user, conn: await server.connect(user) };
}

async function createGroup(memberUins: number[], extra: { joinWithApproval?: boolean } = {}): Promise<Chat> {
  return (await o.client.request('group.create', { name: 'Club', about: 'About us', memberUins, ...extra })).chat;
}

async function eventsIn(conn: Connected, chatId: number) {
  const { messages } = await conn.client.request('chat.history', { chatId });
  return messages.map((message) => (message.event === null ? null : { type: message.event.type, target: message.event.target }));
}

describe('creating and editing groups', () => {
  it('makes the creator creator, writes service messages and pushes the chat to new members', async () => {
    const bob = await member('Bob');
    const chat = await createGroup([bob.user.uin]);
    expect(chat).toMatchObject({ type: 'group', title: 'Club' });
    expect(chat.group).toMatchObject({ myRole: 'creator', membersCount: 2, about: 'About us', pendingRequests: 0 });
    expect(chat.group?.inviteToken).toMatch(/^[A-Za-z0-9_-]{22}$/);

    const arrival = await bob.conn.client.nextEvent('message', (event) => event.message.event?.type === 'member_added');
    expect(arrival.chat.group).toMatchObject({ myRole: 'member', inviteToken: null });
    expect(await eventsIn(o, chat.id)).toEqual([
      { type: 'created', target: null },
      { type: 'member_added', target: bob.user.uin },
    ]);
  });

  it('lets admins edit the group, one service message per change', async () => {
    const bob = await member('Bob');
    const chat = await createGroup([bob.user.uin]);
    const { chat: updated } = await o.client.request('group.update', { chatId: chat.id, name: 'Club 2', rules: 'Be kind' });
    expect(updated).toMatchObject({ title: 'Club 2', group: { rules: 'Be kind' } });
    const renamed = await bob.conn.client.nextEvent('message', (event) => event.message.event?.type === 'renamed');
    expect(renamed.message.event).toMatchObject({ actor: owner.uin, value: 'Club 2' });
    expect(await bob.conn.client.requestError('group.update', { chatId: chat.id, name: 'Mine' })).toEqual({
      code: 'forbidden',
      message: MESSAGES.adminsOnly,
    });
  });
});

describe('adding members', () => {
  it('respects "Who can add me to groups" and returns the refused users', async () => {
    const open = await member('Open');
    const closed = await member('Closed');
    const picky = await member('Picky');
    const friend = await member('Friend');
    await closed.conn.client.request('settings.update', { groupInvites: 'nobody' });
    await picky.conn.client.request('settings.update', { groupInvites: 'contacts' });
    await friend.conn.client.request('settings.update', { groupInvites: 'contacts' });
    await friend.conn.client.request('contact.add', { uin: owner.uin });

    const chat = await createGroup([]);
    const result = await o.client.request('group.addMembers', {
      chatId: chat.id,
      uins: [open.user.uin, closed.user.uin, picky.user.uin, friend.user.uin],
    });
    expect(result.added.sort()).toEqual([open.user.uin, friend.user.uin].sort());
    expect(result.refused.sort()).toEqual([closed.user.uin, picky.user.uin].sort());
  });

  it('applies the same privacy rule at creation', async () => {
    const closed = await member('Closed');
    await closed.conn.client.request('settings.update', { groupInvites: 'nobody' });
    const chat = await createGroup([closed.user.uin]);
    expect(chat.group?.membersCount).toBe(1);
  });

  it('only admins add members', async () => {
    const bob = await member('Bob');
    const carol = await member('Carol');
    const chat = await createGroup([bob.user.uin]);
    expect(await bob.conn.client.requestError('group.addMembers', { chatId: chat.id, uins: [carol.user.uin] })).toMatchObject({
      code: 'forbidden',
    });
  });
});

describe('roles', () => {
  it('only the creator assigns admins; admins switch members to read only', async () => {
    const bob = await member('Bob');
    const carol = await member('Carol');
    const dave = await member('Dave');
    const chat = await createGroup([bob.user.uin, carol.user.uin, dave.user.uin]);
    await o.client.request('group.setRole', { chatId: chat.id, uin: bob.user.uin, role: 'admin' });
    const promoted = await bob.conn.client.nextEvent('message', (event) => event.message.event?.type === 'role_changed');
    expect(promoted.chat.group).toMatchObject({ myRole: 'admin' });
    expect(promoted.chat.group?.inviteToken).not.toBeNull();

    expect(await bob.conn.client.requestError('group.setRole', { chatId: chat.id, uin: carol.user.uin, role: 'admin' })).toMatchObject({
      code: 'forbidden',
    });
    await bob.conn.client.request('group.setRole', { chatId: chat.id, uin: carol.user.uin, role: 'readonly' });
    expect(await carol.conn.client.requestError('message.send', { chatId: chat.id, clientId: 'x', text: 'hi' })).toEqual({
      code: 'forbidden',
      message: MESSAGES.writeForbidden,
    });
    expect(await dave.conn.client.requestError('group.setRole', { chatId: chat.id, uin: carol.user.uin, role: 'member' })).toMatchObject({
      code: 'forbidden',
    });
    expect(await bob.conn.client.requestError('group.setRole', { chatId: chat.id, uin: owner.uin, role: 'member' })).toMatchObject({
      code: 'forbidden',
    });

    const { members } = await o.client.request('group.members', { chatId: chat.id });
    expect(members.map((entry) => [entry.uin, entry.role])).toEqual([
      [owner.uin, 'creator'],
      [bob.user.uin, 'admin'],
      [dave.user.uin, 'member'],
      [carol.user.uin, 'readonly'],
    ]);
  });

  it('lets admins delete the messages of others for all', async () => {
    const bob = await member('Bob');
    const chat = await createGroup([bob.user.uin]);
    const { message } = await bob.conn.client.request('message.send', { chatId: chat.id, clientId: 'x', text: 'spam' });
    await o.client.request('message.delete', { chatId: chat.id, messageIds: [message.id], forAll: true });
    expect((await bob.conn.client.nextEvent('message.updated')).message).toMatchObject({ id: message.id, deleted: true });
  });

  it('removes members; admins cannot remove admins', async () => {
    const bob = await member('Bob');
    const carol = await member('Carol');
    const chat = await createGroup([bob.user.uin, carol.user.uin]);
    await o.client.request('group.setRole', { chatId: chat.id, uin: bob.user.uin, role: 'admin' });
    await o.client.request('group.setRole', { chatId: chat.id, uin: carol.user.uin, role: 'admin' });
    expect(await bob.conn.client.requestError('group.removeMember', { chatId: chat.id, uin: carol.user.uin })).toMatchObject({
      code: 'forbidden',
    });
    await o.client.request('group.removeMember', { chatId: chat.id, uin: carol.user.uin });
    expect(await carol.conn.client.nextEvent('chat.removed')).toEqual({ type: 'chat.removed', chatId: chat.id });
    expect(await carol.conn.client.requestError('chat.history', { chatId: chat.id })).toMatchObject({ code: 'not_found' });
  });
});

describe('invite links', () => {
  it('previews and joins without approval', async () => {
    const chat = await createGroup([]);
    const token = chat.group?.inviteToken ?? '';
    const guest = await member('Guest');
    expect((await guest.conn.client.request('group.preview', { inviteToken: token })).group).toMatchObject({
      chatId: chat.id,
      title: 'Club',
      membersCount: 1,
      joinWithApproval: false,
      state: 'none',
    });
    const joined = await guest.conn.client.request('group.join', { inviteToken: token });
    expect(joined).toMatchObject({ state: 'member', chat: { id: chat.id, group: { myRole: 'member' } } });
    expect((await o.client.nextEvent('message', (event) => event.message.event?.type === 'joined_by_link')).message.sender).toBe(
      guest.user.uin,
    );
    expect((await guest.conn.client.request('group.preview', { inviteToken: token })).group.state).toBe('member');
  });

  it('a new member sees earlier history, but only messages after joining count as unread', async () => {
    const chat = await createGroup([]);
    for (const text of ['one', 'two', 'three']) await o.client.request('message.send', { chatId: chat.id, clientId: text, text });
    const guest = await member('Guest');
    const joined = await guest.conn.client.request('group.join', { inviteToken: chat.group?.inviteToken ?? '' });
    expect(joined.chat?.unread).toBe(0);
    const history = await guest.conn.client.request('chat.history', { chatId: chat.id });
    expect(history.messages.filter((message) => message.event === null).map((message) => message.text)).toEqual(['one', 'two', 'three']);
    await o.client.request('message.send', { chatId: chat.id, clientId: 'four', text: 'four' });
    expect((await guest.conn.client.nextEvent('message', (event) => event.message.text === 'four')).chat.unread).toBe(1);
  });

  it('files a join request with approval, which admins see and resolve', async () => {
    const chat = await createGroup([], { joinWithApproval: true });
    const token = chat.group?.inviteToken ?? '';
    const guest = await member('Guest');
    expect(await guest.conn.client.request('group.join', { inviteToken: token })).toEqual({ state: 'pending', chat: null });
    expect((await o.client.nextEvent('chat.updated')).chat.group?.pendingRequests).toBe(1);
    expect((await guest.conn.client.request('group.preview', { inviteToken: token })).group.state).toBe('pending');
    const { requests } = await o.client.request('group.requests', { chatId: chat.id });
    expect(requests.map((request) => request.uin)).toEqual([guest.user.uin]);

    await o.client.request('group.resolveRequest', { chatId: chat.id, uin: guest.user.uin, approve: true });
    const arrival = await guest.conn.client.nextEvent('message');
    expect(arrival.chat.id).toBe(chat.id);
    expect((await o.client.request('group.requests', { chatId: chat.id })).requests).toEqual([]);

    const other = await member('Other');
    await other.conn.client.request('group.join', { inviteToken: token });
    await o.client.request('group.resolveRequest', { chatId: chat.id, uin: other.user.uin, approve: false });
    expect((await other.conn.client.request('group.preview', { inviteToken: token })).group.state).toBe('none');
  });

  it('regenerating the link stops the old one', async () => {
    const chat = await createGroup([]);
    const old = chat.group?.inviteToken ?? '';
    const { inviteToken } = await o.client.request('group.regenerateLink', { chatId: chat.id });
    expect(inviteToken).not.toBe(old);
    const guest = await member('Guest');
    expect(await guest.conn.client.requestError('group.preview', { inviteToken: old })).toEqual({
      code: 'not_found',
      message: INVALID_LINK_MESSAGE,
    });
    expect((await guest.conn.client.request('group.join', { inviteToken })).state).toBe('member');
  });
});

describe('leaving', () => {
  it('shows "has left group" to administrators only, as in ICQ New', async () => {
    const bob = await member('Bob');
    const carol = await member('Carol');
    const dave = await member('Dave');
    const chat = await createGroup([bob.user.uin, carol.user.uin, dave.user.uin]);
    await o.client.request('group.setRole', { chatId: chat.id, uin: carol.user.uin, role: 'admin' });
    const before = (await bob.conn.client.request('session.start', {})).chats.find((c) => c.id === chat.id)?.unread;

    await dave.conn.client.request('chat.remove', { chatId: chat.id });
    const live = await carol.conn.client.nextEvent('message', (event) => event.message.event?.type === 'member_left');
    expect(live.message.sender).toBe(dave.user.uin);
    expect(await eventsIn(carol.conn, chat.id)).toContainEqual({ type: 'member_left', target: null });
    expect(await eventsIn(o, chat.id)).toContainEqual({ type: 'member_left', target: null });

    expect(await eventsIn(bob.conn, chat.id)).not.toContainEqual({ type: 'member_left', target: null });
    const after = (await bob.conn.client.request('session.start', {})).chats.find((c) => c.id === chat.id);
    expect(after?.unread).toBe(before);
    expect(after?.lastMessage?.event?.type).not.toBe('member_left');
  });

  it('hands the group to the most senior admin, or else the most senior member', async () => {
    const bob = await member('Bob');
    const carol = await member('Carol');
    const chat = await createGroup([bob.user.uin, carol.user.uin]);
    await o.client.request('group.setRole', { chatId: chat.id, uin: carol.user.uin, role: 'admin' });
    await o.client.request('chat.remove', { chatId: chat.id });
    const handover = await carol.conn.client.nextEvent(
      'message',
      (event) => event.message.event?.type === 'role_changed' && event.message.event.value === 'creator',
    );
    expect(handover.message.event?.target).toBe(carol.user.uin);
    expect(handover.chat.group?.myRole).toBe('creator');
    expect(await o.client.requestError('chat.history', { chatId: chat.id })).toMatchObject({ code: 'not_found' });

    await carol.conn.client.request('chat.remove', { chatId: chat.id });
    const { members } = await bob.conn.client.request('group.members', { chatId: chat.id });
    expect(members).toEqual([expect.objectContaining({ uin: bob.user.uin, role: 'creator' })]);
    expect(await eventsIn(bob.conn, chat.id)).toContainEqual({ type: 'member_left', target: null });
  });
});
