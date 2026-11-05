import { chatTypeSchema, memberRoleSchema } from '@openicq/protocol';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { ChatRecord, GroupFields, MemberRecord, MemberState, NewChat, NewMember } from '../../domain/entities.ts';
import type { ChatRepository } from '../../domain/repositories.ts';
import type { MemberRole, Uin } from '../../domain/vocabulary.ts';
import { flag, integer, optionalInteger, optionalText, required, text, toFlag, type Row } from './rows.ts';

const CHAT_COLUMNS = `id, type, pair_low, pair_high, title, about, rules, avatar_file_id, join_with_approval,
  is_public, invite_token, created_at, updated_at`;
const MEMBER_COLUMNS = `chat_id, uin, role, joined_at, last_read_id, last_delivered_id, cleared_before_id, pin_order,
  muted, marked_unread, hidden`;

function toChat(row: Row): ChatRecord {
  const low = optionalInteger(row, 'pair_low');
  const high = optionalInteger(row, 'pair_high');
  return {
    id: integer(row, 'id'),
    type: chatTypeSchema.parse(text(row, 'type')),
    pair: low === null || high === null ? null : [low, high],
    title: text(row, 'title'),
    about: text(row, 'about'),
    rules: text(row, 'rules'),
    avatarFileId: optionalInteger(row, 'avatar_file_id'),
    joinWithApproval: flag(row, 'join_with_approval'),
    isPublic: flag(row, 'is_public'),
    inviteToken: optionalText(row, 'invite_token'),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
  };
}

function toMember(row: Row): MemberRecord {
  return {
    chatId: integer(row, 'chat_id'),
    uin: integer(row, 'uin'),
    role: memberRoleSchema.parse(text(row, 'role')),
    joinedAt: text(row, 'joined_at'),
    lastReadId: integer(row, 'last_read_id'),
    lastDeliveredId: integer(row, 'last_delivered_id'),
    clearedBeforeId: integer(row, 'cleared_before_id'),
    pinOrder: optionalInteger(row, 'pin_order'),
    muted: flag(row, 'muted'),
    markedUnread: flag(row, 'marked_unread'),
    hidden: flag(row, 'hidden'),
  };
}

function groupParams(fields: GroupFields) {
  return {
    title: fields.title,
    about: fields.about,
    rules: fields.rules,
    avatarFileId: fields.avatarFileId,
    joinWithApproval: toFlag(fields.joinWithApproval),
    isPublic: toFlag(fields.isPublic),
  };
}

function prepareStatements(db: DatabaseSync) {
  return {
    insert: db.prepare(`
      INSERT INTO chats (type, pair_low, pair_high, title, about, rules, avatar_file_id, join_with_approval, is_public,
        invite_token, created_at, updated_at)
      VALUES (:type, :pairLow, :pairHigh, :title, :about, :rules, :avatarFileId, :joinWithApproval, :isPublic,
        :inviteToken, :createdAt, :updatedAt)
      RETURNING ${CHAT_COLUMNS}`),
    byId: db.prepare(`SELECT ${CHAT_COLUMNS} FROM chats WHERE id = :id`),
    byPair: db.prepare(`SELECT ${CHAT_COLUMNS} FROM chats WHERE pair_low = :low AND pair_high = :high`),
    byToken: db.prepare(`SELECT ${CHAT_COLUMNS} FROM chats WHERE invite_token = :token AND type = 'group'`),
    updateGroup: db.prepare(`
      UPDATE chats SET title = :title, about = :about, rules = :rules, avatar_file_id = :avatarFileId,
        join_with_approval = :joinWithApproval, is_public = :isPublic
      WHERE id = :id RETURNING ${CHAT_COLUMNS}`),
    setToken: db.prepare('UPDATE chats SET invite_token = :token WHERE id = :id'),
    touch: db.prepare('UPDATE chats SET updated_at = :at WHERE id = :id AND updated_at < :at'),
    addMember: db.prepare(`
      INSERT INTO chat_members (chat_id, uin, role, joined_at, hidden, pin_order)
      VALUES (:chatId, :uin, :role, :joinedAt, :hidden, :pinOrder)
      RETURNING ${MEMBER_COLUMNS}`),
    findMember: db.prepare(`SELECT ${MEMBER_COLUMNS} FROM chat_members WHERE chat_id = :chatId AND uin = :uin`),
    listMembers: db.prepare(`SELECT ${MEMBER_COLUMNS} FROM chat_members WHERE chat_id = :chatId ORDER BY rowid`),
    // A NULL peer never equals a UIN, so groups go straight to the highest read marks.
    readMarks: db.prepare(`
      SELECT ${MEMBER_COLUMNS} FROM chat_members WHERE chat_id = :chatId
      ORDER BY CASE WHEN uin = :viewer THEN 0 WHEN uin = :peer THEN 1 ELSE 2 END, last_read_id DESC, rowid
      LIMIT :limit`),
    countMembers: db.prepare('SELECT COUNT(*) AS n FROM chat_members WHERE chat_id = :chatId'),
    memberships: db.prepare(
      `SELECT ${MEMBER_COLUMNS} FROM chat_members WHERE uin = :uin AND (hidden = 0 OR :includeHidden = 1)`,
    ),
    // The order of compareChats in the session snapshot: pinned first in pin order, then the latest activity.
    chatList: db.prepare(`
      SELECT ${MEMBER_COLUMNS} FROM chat_members m JOIN chats c ON c.id = m.chat_id
      WHERE m.uin = :uin AND m.hidden = 0
      ORDER BY m.pin_order IS NULL, m.pin_order, c.updated_at DESC, c.id DESC
      LIMIT :limit`),
    saveMember: db.prepare(`
      UPDATE chat_members SET role = :role, last_read_id = :lastReadId, last_delivered_id = :lastDeliveredId,
        cleared_before_id = :clearedBeforeId, pin_order = :pinOrder, muted = :muted, marked_unread = :markedUnread,
        hidden = :hidden
      WHERE chat_id = :chatId AND uin = :uin RETURNING ${MEMBER_COLUMNS}`),
    setRole: db.prepare('UPDATE chat_members SET role = :role WHERE chat_id = :chatId AND uin = :uin'),
    advanceDelivered: db.prepare(`
      UPDATE chat_members SET last_delivered_id = :messageId
      WHERE chat_id = :chatId AND uin = :uin AND last_delivered_id < :messageId`),
    unhideAll: db.prepare('UPDATE chat_members SET hidden = 0 WHERE chat_id = :chatId AND hidden = 1'),
    removeMember: db.prepare('DELETE FROM chat_members WHERE chat_id = :chatId AND uin = :uin'),
    nextPinOrder: db.prepare('SELECT COALESCE(MAX(pin_order), 0) + 1 AS next FROM chat_members WHERE uin = :uin'),
    // A chat hidden by either side links nobody: chat.direct alone must not open a presence or profile stream.
    coMembers: db.prepare(`
      SELECT DISTINCT other.uin AS uin
      FROM chat_members mine
      JOIN chat_members other ON other.chat_id = mine.chat_id AND other.uin <> mine.uin AND other.hidden = 0
      WHERE mine.uin = :uin AND mine.hidden = 0`),
  } satisfies Record<string, StatementSync>;
}

export class SqliteChatRepository implements ChatRepository {
  private readonly sql: ReturnType<typeof prepareStatements>;

  constructor(db: DatabaseSync) {
    this.sql = prepareStatements(db);
  }

  create(chat: NewChat): ChatRecord {
    const row = this.sql.insert.get({
      ...groupParams(chat),
      type: chat.type,
      pairLow: chat.pair?.[0] ?? null,
      pairHigh: chat.pair?.[1] ?? null,
      inviteToken: chat.inviteToken,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    });
    return toChat(required(row, 'the new chat'));
  }

  findById(id: number): ChatRecord | null {
    const row = this.sql.byId.get({ id });
    return row === undefined ? null : toChat(row);
  }

  findByPair(low: Uin, high: Uin): ChatRecord | null {
    const row = this.sql.byPair.get({ low, high });
    return row === undefined ? null : toChat(row);
  }

  findFavorites(uin: Uin): ChatRecord | null {
    return this.findByPair(uin, uin);
  }

  findByInviteToken(token: string): ChatRecord | null {
    const row = this.sql.byToken.get({ token });
    return row === undefined ? null : toChat(row);
  }

  updateGroup(id: number, fields: GroupFields): ChatRecord {
    return toChat(required(this.sql.updateGroup.get({ ...groupParams(fields), id }), `chat ${id}`));
  }

  setInviteToken(id: number, token: string): void {
    this.sql.setToken.run({ id, token });
  }

  touch(id: number, at: string): void {
    this.sql.touch.run({ id, at });
  }

  addMember(member: NewMember): MemberRecord {
    const row = this.sql.addMember.get({ ...member, hidden: toFlag(member.hidden) });
    return toMember(required(row, 'the new member'));
  }

  findMember(chatId: number, uin: Uin): MemberRecord | null {
    const row = this.sql.findMember.get({ chatId, uin });
    return row === undefined ? null : toMember(row);
  }

  listMembers(chatId: number): MemberRecord[] {
    return this.sql.listMembers.all({ chatId }).map(toMember);
  }

  listReadMarks(chatId: number, viewer: Uin, peer: Uin | null, limit: number): MemberRecord[] {
    return this.sql.readMarks.all({ chatId, viewer, peer, limit }).map(toMember);
  }

  countMembers(chatId: number): number {
    return integer(required(this.sql.countMembers.get({ chatId }), 'member count'), 'n');
  }

  listMemberships(uin: Uin, includeHidden: boolean): MemberRecord[] {
    return this.sql.memberships.all({ uin, includeHidden: toFlag(includeHidden) }).map(toMember);
  }

  listChatList(uin: Uin, limit: number): MemberRecord[] {
    return this.sql.chatList.all({ uin, limit }).map(toMember);
  }

  saveMember(chatId: number, uin: Uin, state: MemberState): MemberRecord {
    const row = this.sql.saveMember.get({
      chatId,
      uin,
      role: state.role,
      lastReadId: state.lastReadId,
      lastDeliveredId: state.lastDeliveredId,
      clearedBeforeId: state.clearedBeforeId,
      pinOrder: state.pinOrder,
      muted: toFlag(state.muted),
      markedUnread: toFlag(state.markedUnread),
      hidden: toFlag(state.hidden),
    });
    return toMember(required(row, `member ${uin} of chat ${chatId}`));
  }

  setRole(chatId: number, uin: Uin, role: MemberRole): void {
    this.sql.setRole.run({ chatId, uin, role });
  }

  advanceDelivered(chatId: number, uin: Uin, messageId: number): boolean {
    return Number(this.sql.advanceDelivered.run({ chatId, uin, messageId }).changes) > 0;
  }

  unhideAll(chatId: number): void {
    this.sql.unhideAll.run({ chatId });
  }

  removeMember(chatId: number, uin: Uin): boolean {
    return Number(this.sql.removeMember.run({ chatId, uin }).changes) > 0;
  }

  nextPinOrder(uin: Uin): number {
    return integer(required(this.sql.nextPinOrder.get({ uin }), 'next pin order'), 'next');
  }

  listCoMembers(uin: Uin): Uin[] {
    return this.sql.coMembers.all({ uin }).map((row) => integer(row, 'uin'));
  }
}
