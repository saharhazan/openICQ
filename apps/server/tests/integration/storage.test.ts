import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { httpErrorBodySchema } from '@openicq/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { SERVER_STORAGE_FULL, userQuotaFull } from '../../src/application/file-service.ts';
import type { Clock } from '../../src/domain/ports.ts';
import { DiskFileStorage } from '../../src/infrastructure/disk-file-storage.ts';
import { openDatabase } from '../../src/infrastructure/sqlite/database.ts';
import { PNG_1X1, TestServer, eventually } from './harness.ts';

const KIB = 1024;
const HOUR_MS = 60 * 60 * 1000;

/** Real time plus an offset the test moves forward. */
class MovableClock implements Clock {
  private offsetMs = 0;

  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  advance(ms: number): void {
    this.offsetMs += ms;
  }
}

let server: TestServer | null = null;

afterEach(async () => {
  await server?.stop();
  server = null;
});

async function start(...args: Parameters<typeof TestServer.start>): Promise<TestServer> {
  server = await TestServer.start(...args);
  return server;
}

function errorOf(response: { json(): unknown }) {
  return httpErrorBodySchema.parse(response.json()).error;
}

describe('storage quota', () => {
  it('refuses an upload past the per-user quota with too_large, keeps nothing, and counts each user apart', async () => {
    const s = await start({ maxFileBytes: 64 * KIB, maxUserStorageBytes: 100 * KIB });
    const alice = await s.createUser('Alice');
    const bob = await s.createUser('Bob');
    expect((await s.uploadResponse(alice.cookie, Buffer.alloc(60 * KIB, 1))).statusCode).toBe(201);
    const refused = await s.uploadResponse(alice.cookie, Buffer.alloc(60 * KIB, 2));
    expect(refused.statusCode).toBe(413);
    expect(errorOf(refused)).toEqual({ code: 'too_large', message: userQuotaFull(100 * KIB, 60 * KIB) });
    expect(readdirSync(s.filesDir)).toHaveLength(1);

    expect((await s.uploadResponse(alice.cookie, Buffer.alloc(30 * KIB, 3))).statusCode).toBe(201);
    expect((await s.uploadResponse(bob.cookie, Buffer.alloc(60 * KIB, 4))).statusCode).toBe(201);
  });

  it('applies MAX_TOTAL_STORAGE_BYTES across all users', async () => {
    const s = await start({ maxFileBytes: 64 * KIB, maxTotalStorageBytes: 100 * KIB });
    const alice = await s.createUser('Alice');
    const bob = await s.createUser('Bob');
    expect((await s.uploadResponse(alice.cookie, Buffer.alloc(60 * KIB, 1))).statusCode).toBe(201);
    const refused = await s.uploadResponse(bob.cookie, Buffer.alloc(60 * KIB, 2));
    expect(refused.statusCode).toBe(413);
    expect(errorOf(refused)).toEqual({ code: 'too_large', message: SERVER_STORAGE_FULL });
    expect(readdirSync(s.filesDir)).toHaveLength(1);
  });
});

describe('files of messages deleted for all', () => {
  it('are deleted, row and disk, once no other message uses them, which frees the quota', async () => {
    const s = await start({ maxFileBytes: 64 * KIB, maxUserStorageBytes: 100 * KIB });
    const alice = await s.createUser('Alice');
    const bob = await s.createUser('Bob');
    const a = await s.connect(alice);
    const favorites = a.snapshot.chats.find((chat) => chat.type === 'favorites');
    if (favorites === undefined) throw new Error('expected a Favorites chat');
    const file = await s.upload(alice.cookie, Buffer.alloc(60 * KIB, 1), { name: 'big.bin' });
    const { chat } = await a.client.request('chat.direct', { uin: bob.uin });
    const { message } = await a.client.request('message.send', { chatId: chat.id, clientId: 'f', text: '', attachmentFileIds: [file.fileId] });
    const [copy] = (await a.client.request('message.forward', { fromChatId: chat.id, messageIds: [message.id], toChatId: favorites.id })).messages;
    if (copy === undefined) throw new Error('expected the forwarded copy');

    await a.client.request('message.delete', { chatId: chat.id, messageIds: [message.id], forAll: true });
    expect((await s.download(alice.cookie, file.fileId)).statusCode).toBe(200);
    expect(readdirSync(s.filesDir)).toHaveLength(1);

    await a.client.request('message.delete', { chatId: favorites.id, messageIds: [copy.id], forAll: true });
    expect((await s.download(alice.cookie, file.fileId)).statusCode).toBe(404);
    expect(readdirSync(s.filesDir)).toEqual([]);
    expect((await s.uploadResponse(alice.cookie, Buffer.alloc(60 * KIB, 2))).statusCode).toBe(201);
  });
});

describe('unused file sweep', () => {
  it('deletes files never sent and avatars nobody uses once they are older than the age, and nothing else', async () => {
    const clock = new MovableClock();
    const s = await start({}, { clock, fileSweep: { intervalMs: 20, maxAgeMs: HOUR_MS } });
    const alice = await s.createUser('Alice');
    const bob = await s.createUser('Bob');
    const a = await s.connect(alice);
    const unsent = await s.upload(alice.cookie, Buffer.from('never sent'));
    const sent = await s.upload(alice.cookie, Buffer.from('sent'));
    const profileAvatar = await s.upload(alice.cookie, PNG_1X1, { purpose: 'avatar' });
    const groupAvatar = await s.upload(alice.cookie, PNG_1X1, { purpose: 'avatar' });
    const unusedAvatar = await s.upload(alice.cookie, PNG_1X1, { purpose: 'avatar' });
    const { chat } = await a.client.request('chat.direct', { uin: bob.uin });
    await a.client.request('message.send', { chatId: chat.id, clientId: 's', text: '', attachmentFileIds: [sent.fileId] });
    await a.client.request('profile.update', { avatarFileId: profileAvatar.fileId });
    await a.client.request('group.create', { name: 'Club', avatarFileId: groupAvatar.fileId });

    // Several sweeps run while every file is young.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(readdirSync(s.filesDir)).toHaveLength(5);

    clock.advance(2 * HOUR_MS);
    await eventually(() => readdirSync(s.filesDir).length === 3, 'the sweep deleted the two unused files');
    for (const gone of [unsent, unusedAvatar]) expect((await s.download(alice.cookie, gone.fileId)).statusCode).toBe(404);
    for (const kept of [sent, profileAvatar, groupAvatar]) expect((await s.download(alice.cookie, kept.fileId)).statusCode).toBe(200);
  });
});

describe('directories', () => {
  it('creates the data and files directories for the owner only (0700)', () => {
    const root = mkdtempSync(join(tmpdir(), 'openicq-modes-'));
    try {
      const filesDir = join(root, 'nested', 'files');
      new DiskFileStorage(filesDir);
      const db = openDatabase(join(root, 'data', 'openicq.db'));
      db.close();
      expect(statSync(filesDir).mode & 0o777).toBe(0o700);
      expect(statSync(join(root, 'data')).mode & 0o777).toBe(0o700);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
