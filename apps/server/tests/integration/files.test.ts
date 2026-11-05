import { readdirSync } from 'node:fs';
import { httpErrorBodySchema } from '@openicq/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UPLOAD_RATE_LIMITED } from '../../src/transport/http/file-routes.ts';
import { GIF_3X2, PNG_1X1, TestServer, type TestUser } from './harness.ts';

let server: TestServer;
let alice: TestUser;

beforeEach(async () => {
  server = await TestServer.start({ maxFileBytes: 64 * 1024 });
  alice = await server.createUser('Alice');
});

afterEach(async () => {
  await server.stop();
});

function errorOf(response: { json(): unknown }) {
  return httpErrorBodySchema.parse(response.json()).error;
}

describe('upload', () => {
  it('detects images by content, with width and height', async () => {
    const png = await server.upload(alice.cookie, PNG_1X1, { name: 'photo.dat', mime: 'application/pdf' });
    expect(png).toMatchObject({ kind: 'image', mime: 'image/png', width: 1, height: 1, size: PNG_1X1.length, name: 'photo.dat' });
    const gif = await server.upload(alice.cookie, GIF_3X2, { name: 'anim.gif' });
    expect(gif).toMatchObject({ kind: 'image', mime: 'image/gif', width: 3, height: 2 });
  });

  it('never trusts the name or the declared type for images', async () => {
    const fake = await server.upload(alice.cookie, Buffer.from('<svg onload="alert(1)"></svg>'), { name: 'x.png', mime: 'image/png' });
    expect(fake).toMatchObject({ kind: 'file', mime: 'application/octet-stream', width: null, height: null });
    const pdf = await server.upload(alice.cookie, Buffer.from('%PDF-1.4'), { name: '../../etc/report.pdf', mime: 'application/pdf' });
    expect(pdf).toMatchObject({ kind: 'file', mime: 'application/pdf', name: 'report.pdf' });
  });

  it('stores files under random names inside the files directory', async () => {
    await server.upload(alice.cookie, Buffer.from('hello'), { name: 'hello.txt' });
    const stored = readdirSync(server.filesDir);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatch(/^[0-9a-f]{32}$/);
  });

  it('refuses files over MAX_FILE_BYTES with too_large and keeps nothing', async () => {
    const response = await server.uploadResponse(alice.cookie, Buffer.alloc(64 * 1024 + 1, 1));
    expect(response.statusCode).toBe(413);
    expect(errorOf(response).code).toBe('too_large');
    expect(readdirSync(server.filesDir)).toEqual([]);
    expect((await server.uploadResponse(alice.cookie, Buffer.alloc(64 * 1024, 1))).statusCode).toBe(201);
  });

  it('accepts files larger than the JSON body limit', async () => {
    expect((await server.uploadResponse(alice.cookie, Buffer.alloc(40 * 1024, 7))).statusCode).toBe(201);
  });

  it('refuses avatars that are not images, and bad requests', async () => {
    const avatar = await server.uploadResponse(alice.cookie, Buffer.from('text'), { purpose: 'avatar' });
    expect(avatar.statusCode).toBe(400);
    expect(readdirSync(server.filesDir)).toEqual([]);
    expect((await server.uploadResponse(alice.cookie, PNG_1X1, { purpose: 'banner' })).statusCode).toBe(400);
    expect((await server.uploadResponse(alice.cookie, PNG_1X1, { field: 'other' })).statusCode).toBe(400);
    expect((await server.uploadResponse(null, PNG_1X1)).statusCode).toBe(401);
    expect((await server.uploadResponse(alice.cookie, PNG_1X1, { origin: 'https://evil.example' })).statusCode).toBe(403);
  });

  it('limits uploads to 30 a minute per user', async () => {
    for (let i = 0; i < 30; i += 1) expect((await server.uploadResponse(alice.cookie, Buffer.from(`f${i}`))).statusCode).toBe(201);
    const limited = await server.uploadResponse(alice.cookie, Buffer.from('one more'));
    expect(limited.statusCode).toBe(429);
    expect(errorOf(limited)).toEqual({ code: 'rate_limited', message: UPLOAD_RATE_LIMITED });
  });
});

describe('download access', () => {
  it('the owner and the members of a chat carrying the file may download it; strangers may not', async () => {
    const bob = await server.createUser('Bob');
    const stranger = await server.createUser('Stranger');
    const file = await server.upload(alice.cookie, Buffer.from('report body'), { name: 'report.txt', mime: 'text/plain' });
    expect((await server.download(alice.cookie, file.fileId)).statusCode).toBe(200);
    expect((await server.download(bob.cookie, file.fileId)).statusCode).toBe(404);

    const a = await server.connect(alice);
    const { chat } = await a.client.request('chat.direct', { uin: bob.uin });
    const { message } = await a.client.request('message.send', { chatId: chat.id, clientId: 'f', text: '', attachmentFileIds: [file.fileId] });
    expect(message.attachments).toEqual([file]);
    const forBob = await server.download(bob.cookie, file.fileId);
    expect(forBob.statusCode).toBe(200);
    expect(forBob.body).toBe('report body');
    expect((await server.download(stranger.cookie, file.fileId)).statusCode).toBe(404);
    expect((await server.download(null, file.fileId)).statusCode).toBe(401);

    await a.client.request('message.delete', { chatId: chat.id, messageIds: [message.id], forAll: true });
    expect((await server.download(bob.cookie, file.fileId)).statusCode).toBe(404);
  });

  it('stops for a member who cleared the history or deleted the message for themselves; the owner keeps it', async () => {
    const bob = await server.createUser('Bob');
    const carol = await server.createUser('Carol');
    const a = await server.connect(alice);
    const file = await server.upload(alice.cookie, Buffer.from('shared'), { name: 'shared.txt' });
    const { chat } = await a.client.request('group.create', { name: 'Trio', memberUins: [bob.uin, carol.uin] });
    const { message } = await a.client.request('message.send', { chatId: chat.id, clientId: 'f', text: '', attachmentFileIds: [file.fileId] });
    for (const user of [bob, carol]) expect((await server.download(user.cookie, file.fileId)).statusCode).toBe(200);

    await (await server.connect(bob)).client.request('chat.clear', { chatId: chat.id });
    expect((await server.download(bob.cookie, file.fileId)).statusCode).toBe(404);
    await (await server.connect(carol)).client.request('message.delete', { chatId: chat.id, messageIds: [message.id], forAll: false });
    expect((await server.download(carol.cookie, file.fileId)).statusCode).toBe(404);

    await a.client.request('chat.clear', { chatId: chat.id });
    expect((await server.download(alice.cookie, file.fileId)).statusCode).toBe(200);
  });

  it('avatars are visible to every signed-in user', async () => {
    const stranger = await server.createUser('Stranger');
    const avatar = await server.upload(alice.cookie, PNG_1X1, { purpose: 'avatar', name: 'me.png' });
    expect((await server.download(stranger.cookie, avatar.fileId)).statusCode).toBe(200);
    expect((await server.download(null, avatar.fileId)).statusCode).toBe(401);
  });

  it('only your own attachment uploads can be attached', async () => {
    const bob = await server.createUser('Bob');
    const bobs = await server.upload(bob.cookie, Buffer.from('x'));
    const avatar = await server.upload(alice.cookie, PNG_1X1, { purpose: 'avatar' });
    const a = await server.connect(alice);
    const { chat } = await a.client.request('chat.direct', { uin: bob.uin });
    for (const fileId of [bobs.fileId, avatar.fileId, 999]) {
      expect(await a.client.requestError('message.send', { chatId: chat.id, clientId: 'x', text: 'hi', attachmentFileIds: [fileId] })).toMatchObject({
        code: 'not_found',
      });
    }
  });
});

describe('download headers', () => {
  it('serves safe images inline and everything else as an attachment, always sandboxed', async () => {
    const image = await server.upload(alice.cookie, PNG_1X1, { name: 'pixel.png' });
    const imageResponse = await server.download(alice.cookie, image.fileId);
    expect(imageResponse.headers).toMatchObject({
      'content-type': 'image/png',
      'content-disposition': `inline; filename="pixel.png"; filename*=UTF-8''pixel.png`,
      'x-content-type-options': 'nosniff',
      'content-security-policy': 'sandbox',
    });

    const html = await server.upload(alice.cookie, Buffer.from('<script>alert(1)</script>'), { name: 'שלום.html', mime: 'text/html' });
    const htmlResponse = await server.download(alice.cookie, html.fileId);
    expect(htmlResponse.headers['content-type']).toBe('application/octet-stream');
    expect(htmlResponse.headers['content-disposition']).toBe(
      `attachment; filename="____.html"; filename*=UTF-8''${encodeURIComponent('שלום.html')}`,
    );
    expect(htmlResponse.headers['content-security-policy']).toBe('sandbox');
    expect(htmlResponse.headers['x-content-type-options']).toBe('nosniff');
  });

  it('answers unknown and malformed ids with 404', async () => {
    expect((await server.download(alice.cookie, 424242)).statusCode).toBe(404);
    const malformed = await server.app.inject({ method: 'GET', url: '/api/files/abc', headers: { cookie: alice.cookie } });
    expect(malformed.statusCode).toBe(404);
  });
});

describe('avatars in profiles and groups', () => {
  it('sets an avatar from an own avatar upload only', async () => {
    const a = await server.connect(alice);
    const avatar = await server.upload(alice.cookie, PNG_1X1, { purpose: 'avatar' });
    const attachment = await server.upload(alice.cookie, PNG_1X1);
    expect((await a.client.request('profile.update', { avatarFileId: avatar.fileId })).me.avatarFileId).toBe(avatar.fileId);
    expect(await a.client.requestError('profile.update', { avatarFileId: attachment.fileId })).toMatchObject({ code: 'bad_request' });
    const { chat } = await a.client.request('group.create', { name: 'Club', avatarFileId: avatar.fileId });
    expect(chat.avatarFileId).toBe(avatar.fileId);
  });
});
