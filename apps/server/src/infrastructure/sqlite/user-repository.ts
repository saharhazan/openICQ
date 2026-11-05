import { awayMessagesSchema, genderSchema, preferencesSchema, type Uin } from '@openicq/protocol';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { DEFAULT_AWAY_MESSAGES, DEFAULT_PREFERENCES } from '../../domain/defaults.ts';
import type {
  DetailsCriteria,
  NewUser,
  ProfileFields,
  SettingsFields,
  UserRecord,
} from '../../domain/entities.ts';
import type { UserRepository } from '../../domain/repositories.ts';
import { flag, integer, jsonObject, optionalInteger, optionalText, required, text, toFlag, type Row } from './rows.ts';

const COLUMNS = `uin, nickname, first_name, last_name, email, gender, age, country, city, homepage, about,
  password_hash, auth_required, web_aware, hide_email, preferences_json, away_messages_json, created_at, last_seen_at`;

/** SQL fragment: the backslash escapes LIKE wildcards in user input. */
const LIKE_ESCAPE = "ESCAPE '\\'";

/** A LIKE pattern for a substring match; an empty value matches every row. */
export function containsPattern(value: string): string {
  if (value === '') return '%';
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function toUser(row: Row): UserRecord {
  return {
    uin: integer(row, 'uin'),
    nickname: text(row, 'nickname'),
    firstName: text(row, 'first_name'),
    lastName: text(row, 'last_name'),
    email: text(row, 'email'),
    gender: genderSchema.parse(text(row, 'gender')),
    age: optionalInteger(row, 'age'),
    country: text(row, 'country'),
    city: text(row, 'city'),
    homepage: text(row, 'homepage'),
    about: text(row, 'about'),
    passwordHash: text(row, 'password_hash'),
    authRequired: flag(row, 'auth_required'),
    webAware: flag(row, 'web_aware'),
    hideEmail: flag(row, 'hide_email'),
    // Stored JSON is merged over the defaults so preferences added later get a value.
    preferences: preferencesSchema.parse({ ...DEFAULT_PREFERENCES, ...jsonObject(row, 'preferences_json') }),
    awayMessages: awayMessagesSchema.parse({ ...DEFAULT_AWAY_MESSAGES, ...jsonObject(row, 'away_messages_json') }),
    createdAt: text(row, 'created_at'),
    lastSeenAt: optionalText(row, 'last_seen_at'),
  };
}

function profileParams(profile: ProfileFields) {
  return {
    nickname: profile.nickname,
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    gender: profile.gender,
    age: profile.age,
    country: profile.country,
    city: profile.city,
    homepage: profile.homepage,
    about: profile.about,
  };
}

function settingsParams(settings: SettingsFields) {
  return {
    authRequired: toFlag(settings.authRequired),
    webAware: toFlag(settings.webAware),
    hideEmail: toFlag(settings.hideEmail),
    preferences: JSON.stringify(settings.preferences),
    awayMessages: JSON.stringify(settings.awayMessages),
  };
}

export class SqliteUserRepository implements UserRepository {
  private readonly insertStatement: StatementSync;
  private readonly byUinStatement: StatementSync;
  private readonly byEmailStatement: StatementSync;
  private readonly byDetailsStatement: StatementSync;
  private readonly profileStatement: StatementSync;
  private readonly settingsStatement: StatementSync;
  private readonly passwordStatement: StatementSync;
  private readonly lastSeenStatement: StatementSync;

  constructor(db: DatabaseSync) {
    this.insertStatement = db.prepare(`
      INSERT INTO users (nickname, first_name, last_name, email, gender, age, country, city, homepage, about,
        password_hash, auth_required, web_aware, hide_email, preferences_json, away_messages_json, created_at)
      VALUES (:nickname, :firstName, :lastName, :email, :gender, :age, :country, :city, :homepage, :about,
        :passwordHash, :authRequired, :webAware, :hideEmail, :preferences, :awayMessages, :createdAt)
      RETURNING ${COLUMNS}`);
    this.byUinStatement = db.prepare(`SELECT ${COLUMNS} FROM users WHERE uin = :uin`);
    this.byEmailStatement = db.prepare(`
      SELECT ${COLUMNS} FROM users
      WHERE lower(email) = lower(:email) AND email <> '' AND hide_email = 0
      ORDER BY uin LIMIT :limit`);
    this.byDetailsStatement = db.prepare(`
      SELECT ${COLUMNS} FROM users
      WHERE nickname LIKE :nickname ${LIKE_ESCAPE}
        AND first_name LIKE :firstName ${LIKE_ESCAPE}
        AND last_name LIKE :lastName ${LIKE_ESCAPE}
      ORDER BY uin LIMIT :limit`);
    this.profileStatement = db.prepare(`
      UPDATE users SET nickname = :nickname, first_name = :firstName, last_name = :lastName, email = :email,
        gender = :gender, age = :age, country = :country, city = :city, homepage = :homepage, about = :about
      WHERE uin = :uin RETURNING ${COLUMNS}`);
    this.settingsStatement = db.prepare(`
      UPDATE users SET auth_required = :authRequired, web_aware = :webAware, hide_email = :hideEmail,
        preferences_json = :preferences, away_messages_json = :awayMessages
      WHERE uin = :uin RETURNING ${COLUMNS}`);
    this.passwordStatement = db.prepare('UPDATE users SET password_hash = :passwordHash WHERE uin = :uin');
    this.lastSeenStatement = db.prepare('UPDATE users SET last_seen_at = :at WHERE uin = :uin');
  }

  create(user: NewUser): UserRecord {
    const row = this.insertStatement.get({
      ...profileParams(user),
      ...settingsParams(user),
      passwordHash: user.passwordHash,
      createdAt: user.createdAt,
    });
    return toUser(required(row, 'the new user'));
  }

  findByUin(uin: Uin): UserRecord | null {
    const row = this.byUinStatement.get({ uin });
    return row === undefined ? null : toUser(row);
  }

  findByVisibleEmail(email: string, limit: number): UserRecord[] {
    return this.byEmailStatement.all({ email, limit }).map(toUser);
  }

  searchByDetails(criteria: DetailsCriteria, limit: number): UserRecord[] {
    return this.byDetailsStatement
      .all({
        nickname: containsPattern(criteria.nickname),
        firstName: containsPattern(criteria.firstName),
        lastName: containsPattern(criteria.lastName),
        limit,
      })
      .map(toUser);
  }

  updateProfile(uin: Uin, profile: ProfileFields): UserRecord {
    return toUser(required(this.profileStatement.get({ ...profileParams(profile), uin }), `user ${uin}`));
  }

  updateSettings(uin: Uin, settings: SettingsFields): UserRecord {
    return toUser(required(this.settingsStatement.get({ ...settingsParams(settings), uin }), `user ${uin}`));
  }

  updatePassword(uin: Uin, passwordHash: string): void {
    this.passwordStatement.run({ uin, passwordHash });
  }

  touchLastSeen(uin: Uin, at: string): void {
    this.lastSeenStatement.run({ uin, at });
  }
}
