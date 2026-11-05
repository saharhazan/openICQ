import { groupInvitePolicySchema } from '@openicq/protocol';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { NewUser, ProfileFields, UserRecord, UserSearchCriteria } from '../../domain/entities.ts';
import type { UserRepository } from '../../domain/repositories.ts';
import type { GroupInvitePolicy, Uin } from '../../domain/vocabulary.ts';
import { integer, optionalInteger, optionalText, required, text, type Row } from './rows.ts';

const COLUMNS = `uin, nickname, first_name, last_name, about, email, avatar_file_id, password_hash,
  group_invites, created_at, last_seen_at`;

/** SQL fragment: the backslash escapes LIKE wildcards in user input. */
const LIKE_ESCAPE = "ESCAPE '\\'";

/** Escapes LIKE wildcards so user input matches literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function toUser(row: Row): UserRecord {
  return {
    uin: integer(row, 'uin'),
    nickname: optionalText(row, 'nickname'),
    firstName: text(row, 'first_name'),
    lastName: text(row, 'last_name'),
    about: text(row, 'about'),
    email: optionalText(row, 'email'),
    avatarFileId: optionalInteger(row, 'avatar_file_id'),
    passwordHash: text(row, 'password_hash'),
    groupInvites: groupInvitePolicySchema.parse(text(row, 'group_invites')),
    createdAt: text(row, 'created_at'),
    lastSeenAt: optionalText(row, 'last_seen_at'),
  };
}

function profileParams(profile: ProfileFields) {
  return {
    nickname: profile.nickname,
    firstName: profile.firstName,
    lastName: profile.lastName,
    about: profile.about,
    avatarFileId: profile.avatarFileId,
  };
}

export class SqliteUserRepository implements UserRepository {
  private readonly insertStatement: StatementSync;
  private readonly byUinStatement: StatementSync;
  private readonly byEmailStatement: StatementSync;
  private readonly byNicknameStatement: StatementSync;
  private readonly searchStatement: StatementSync;
  private readonly profileStatement: StatementSync;
  private readonly groupInvitesStatement: StatementSync;
  private readonly passwordStatement: StatementSync;
  private readonly lastSeenStatement: StatementSync;

  constructor(db: DatabaseSync) {
    this.insertStatement = db.prepare(`
      INSERT INTO users (nickname, first_name, last_name, about, email, avatar_file_id, password_hash, group_invites, created_at)
      VALUES (:nickname, :firstName, :lastName, :about, :email, :avatarFileId, :passwordHash, :groupInvites, :createdAt)
      RETURNING ${COLUMNS}`);
    this.byUinStatement = db.prepare(`SELECT ${COLUMNS} FROM users WHERE uin = :uin`);
    this.byEmailStatement = db.prepare(`SELECT ${COLUMNS} FROM users WHERE email = :email`);
    this.byNicknameStatement = db.prepare(`SELECT ${COLUMNS} FROM users WHERE nickname = :nickname`);
    // Ranked: exact UIN, nickname prefix, name fragment; ties by UIN. Never by email (account enumeration).
    this.searchStatement = db.prepare(`
      SELECT ${COLUMNS},
        CASE
          WHEN uin = :uin THEN 0
          WHEN nickname LIKE :nicknamePrefix ${LIKE_ESCAPE} THEN 1
          ELSE 2
        END AS rank
      FROM users
      WHERE uin <> :excludeUin
        AND (uin = :uin
          OR nickname LIKE :nicknamePrefix ${LIKE_ESCAPE}
          OR (first_name || ' ' || last_name) LIKE :nameFragment ${LIKE_ESCAPE})
      ORDER BY rank, uin
      LIMIT :limit`);
    this.profileStatement = db.prepare(`
      UPDATE users SET nickname = :nickname, first_name = :firstName, last_name = :lastName, about = :about,
        avatar_file_id = :avatarFileId
      WHERE uin = :uin RETURNING ${COLUMNS}`);
    this.groupInvitesStatement = db.prepare(
      `UPDATE users SET group_invites = :policy WHERE uin = :uin RETURNING ${COLUMNS}`,
    );
    this.passwordStatement = db.prepare('UPDATE users SET password_hash = :passwordHash WHERE uin = :uin');
    this.lastSeenStatement = db.prepare('UPDATE users SET last_seen_at = :at WHERE uin = :uin');
  }

  create(user: NewUser): UserRecord {
    const row = this.insertStatement.get({
      ...profileParams(user),
      email: user.email,
      passwordHash: user.passwordHash,
      groupInvites: user.groupInvites,
      createdAt: user.createdAt,
    });
    return toUser(required(row, 'the new user'));
  }

  findByUin(uin: Uin): UserRecord | null {
    const row = this.byUinStatement.get({ uin });
    return row === undefined ? null : toUser(row);
  }

  findByEmail(email: string): UserRecord | null {
    const row = this.byEmailStatement.get({ email: email.toLowerCase() });
    return row === undefined ? null : toUser(row);
  }

  findByNickname(nickname: string): UserRecord | null {
    const row = this.byNicknameStatement.get({ nickname: nickname.toLowerCase() });
    return row === undefined ? null : toUser(row);
  }

  search(criteria: UserSearchCriteria, limit: number): UserRecord[] {
    return this.searchStatement
      .all({
        uin: criteria.uin,
        nicknamePrefix: `${escapeLike(criteria.nicknamePrefix)}%`,
        nameFragment: `%${escapeLike(criteria.nameFragment)}%`,
        excludeUin: criteria.excludeUin,
        limit,
      })
      .map(toUser);
  }

  updateProfile(uin: Uin, profile: ProfileFields): UserRecord {
    return toUser(required(this.profileStatement.get({ ...profileParams(profile), uin }), `user ${uin}`));
  }

  updateGroupInvites(uin: Uin, policy: GroupInvitePolicy): UserRecord {
    return toUser(required(this.groupInvitesStatement.get({ uin, policy }), `user ${uin}`));
  }

  updatePassword(uin: Uin, passwordHash: string): void {
    this.passwordStatement.run({ uin, passwordHash });
  }

  touchLastSeen(uin: Uin, at: string): void {
    this.lastSeenStatement.run({ uin, at });
  }
}
