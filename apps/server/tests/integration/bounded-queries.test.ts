/** The repository queries behind the security limits, against a real in-memory SQLite database. */
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatRecord } from '../../src/domain/entities.ts';
import type { Uin } from '../../src/domain/vocabulary.ts';
import { SqliteChatRepository } from '../../src/infrastructure/sqlite/chat-repository.ts';
import { MEMORY_DATABASE, openDatabase } from '../../src/infrastructure/sqlite/database.ts';
import { SqliteFileRepository } from '../../src/infrastructure/sqlite/file-repository.ts';
import { runMigrations } from '../../src/infrastructure/sqlite/migrations.ts';
import { SqliteUserRepository } from '../../src/infrastructure/sqlite/user-repository.ts';

const AT = '2026-11-05T10:00:00.000Z';

let db: DatabaseSync;
let users: SqliteUserRepository;
let chats: SqliteChatRepository;
let files: SqliteFileRepository;

beforeEach(() => {
  db = openDatabase(MEMORY_DATABASE);
  runMigrations(db);
  users = new SqliteUserRepository(db);
  chats = new SqliteChatRepository(db);
  files = new SqliteFileRepository(db);
});

afterEach(() => {
  db.close();
});

function newUser(firstName: string): Uin {
  return users.create({
    nickname: null,
    firstName,
    lastName: '',
    about: '',
    avatarFileId: null,
    email: null,
    passwordHash: 'x',
    groupInvites: 'everybody',
    createdAt: AT,
  }).uin;
}

function newChat(type: 'group' | 'direct', updatedAt = AT, pair: [Uin, Uin] | null = null): ChatRecord {
  return chats.create({
    type,
    pair,
    title: type === 'group' ? 'Group' : '',
    about: '',
    rules: '',
    avatarFileId: null,
    joinWithApproval: false,
    isPublic: false,
    inviteToken: null,
    createdAt: AT,
    updatedAt,
  });
}

function join(chatId: number, uin: Uin, hidden = false): void {
  chats.addMember({ chatId, uin, role: 'member', joinedAt: AT, hidden, pinOrder: null });
}

function setMember(chatId: number, uin: Uin, change: { lastReadId?: number; pinOrder?: number }): void {
  const member = chats.findMember(chatId, uin);
  if (member === null) throw new Error(`no member ${uin} in ${chatId}`);
  chats.saveMember(chatId, uin, { ...member, ...change });
}

describe('listReadMarks', () => {
  it('returns at most the limit: the viewer, the direct peer, then the highest read marks', () => {
    const viewer = newUser('Viewer');
    const group = newChat('group');
    const others = Array.from({ length: 250 }, (_, i) => newUser(`Member ${i}`));
    join(group.id, viewer);
    others.forEach((uin, i) => {
      join(group.id, uin);
      setMember(group.id, uin, { lastReadId: i });
    });
    const marks = chats.listReadMarks(group.id, viewer, null, 200).map((member) => member.uin);
    expect(marks).toHaveLength(200);
    expect(marks[0]).toBe(viewer);
    expect(marks.slice(1, 4)).toEqual([others[249], others[248], others[247]]);

    const peer = others[0] ?? 0;
    expect(chats.listReadMarks(group.id, viewer, peer, 3).map((member) => member.uin)).toEqual([viewer, peer, others[249]]);
  });
});

describe('listChatList', () => {
  it('returns at most the limit: every pinned chat in pin order, then the most recent activity', () => {
    const me = newUser('Me');
    const hiddenPeer = newUser('Peer');
    const groups = Array.from({ length: 1005 }, (_, i) => newChat('group', new Date(Date.parse(AT) + i * 1000).toISOString()));
    for (const group of groups) join(group.id, me);
    const [oldest, second] = groups;
    if (oldest === undefined || second === undefined) throw new Error('expected groups');
    setMember(second.id, me, { pinOrder: 2 });
    setMember(oldest.id, me, { pinOrder: 1 });
    const direct = newChat('direct', '2030-01-01T00:00:00.000Z', [me, hiddenPeer]);
    join(direct.id, me, true);

    const list = chats.listChatList(me, 1000).map((member) => member.chatId);
    expect(list).toHaveLength(1000);
    expect(list.slice(0, 3)).toEqual([oldest.id, second.id, groups[1004]?.id]);
    expect(list).not.toContain(direct.id);
    expect(list.at(-1)).toBe(groups[7]?.id);
  });
});

describe('listCoMembers', () => {
  it('ignores chats that either member hides', () => {
    const [opener, target, friend] = [newUser('Opener'), newUser('Target'), newUser('Friend')];
    const unanswered = newChat('direct', AT, [opener, target]);
    join(unanswered.id, opener);
    join(unanswered.id, target, true);
    const talked = newChat('direct', AT, [opener, friend]);
    join(talked.id, opener);
    join(talked.id, friend);
    expect(chats.listCoMembers(target)).toEqual([]);
    expect(chats.listCoMembers(opener)).toEqual([friend]);
    chats.unhideAll(unanswered.id);
    expect(chats.listCoMembers(target)).toEqual([opener]);
  });
});

describe('file accounting and cleanup', () => {
  it('sums stored bytes and deletes only files no message and no avatar uses', () => {
    const owner = newUser('Owner');
    const other = newUser('Other');
    const store = (ownerUin: Uin, size: number, createdAt = AT) =>
      files.create({
        ownerUin,
        purpose: 'attachment',
        storageName: Math.random().toString(16).slice(2).padEnd(32, '0').slice(0, 32),
        name: 'f',
        mime: 'application/octet-stream',
        size,
        kind: 'file',
        width: null,
        height: null,
        createdAt,
      });
    const attached = store(owner, 10);
    const avatar = store(owner, 20);
    const groupAvatar = store(owner, 30);
    const loose = store(owner, 40);
    const young = store(owner, 50, '2026-11-05T12:00:00.000Z');
    const others = store(other, 7);
    expect(files.bytesOwnedBy(owner)).toBe(150);
    expect(files.totalBytes()).toBe(157);

    const group = newChat('group');
    join(group.id, owner);
    chats.updateGroup(group.id, { ...group, avatarFileId: groupAvatar.id });
    users.updateProfile(owner, { nickname: null, firstName: 'Owner', lastName: '', about: '', avatarFileId: avatar.id });
    db.prepare('INSERT INTO messages (chat_id, sender_uin, sent_at) VALUES (:chatId, :uin, :at)').run({ chatId: group.id, uin: owner, at: AT });
    db.prepare('INSERT INTO message_files (message_id, file_id, position) VALUES (last_insert_rowid(), :fileId, 0)').run({ fileId: attached.id });

    const ids = [attached.id, avatar.id, groupAvatar.id, loose.id];
    expect(files.deleteUnreferenced(ids).map((file) => file.id)).toEqual([loose.id]);
    // Only files older than the cutoff go: the young one stays until a later sweep.
    expect(files.deleteUnreferencedBefore('2026-11-05T11:00:00.000Z', 10).map((file) => file.id)).toEqual([others.id]);
    expect(files.findById(young.id)).not.toBeNull();
    expect(files.deleteUnreferencedBefore('2026-11-05T13:00:00.000Z', 10).map((file) => file.id)).toEqual([young.id]);
    expect(files.findById(young.id)).toBeNull();
    expect(files.bytesOwnedBy(owner)).toBe(60);
  });
});
