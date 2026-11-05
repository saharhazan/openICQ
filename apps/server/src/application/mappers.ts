/** Maps records to the protocol shapes sent to clients. */
import type { ChatMessage, Contact, Profile, Settings, Status, SystemNotice, Uin } from '@openicq/protocol';
import type {
  ContactRecord,
  MessageRecord,
  NoticeRecord,
  ProfileFields,
  SettingsFields,
  UserRecord,
} from '../domain/entities.ts';

/** The email as `viewer` may see it: blank when hidden, except for the owner. */
export function visibleEmail(user: UserRecord, viewer: Uin): string {
  return user.hideEmail && user.uin !== viewer ? '' : user.email;
}

export function toProfile(user: UserRecord, viewer: Uin): Profile {
  return {
    uin: user.uin,
    nickname: user.nickname,
    firstName: user.firstName,
    lastName: user.lastName,
    email: visibleEmail(user, viewer),
    gender: user.gender,
    age: user.age,
    country: user.country,
    city: user.city,
    homepage: user.homepage,
    about: user.about,
    authRequired: user.authRequired,
    webAware: user.webAware,
  };
}

export function profileFieldsOf(user: UserRecord): ProfileFields {
  return {
    nickname: user.nickname,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    gender: user.gender,
    age: user.age,
    country: user.country,
    city: user.city,
    homepage: user.homepage,
    about: user.about,
  };
}

export function toSettings(user: SettingsFields): Settings {
  return {
    authRequired: user.authRequired,
    webAware: user.webAware,
    hideEmail: user.hideEmail,
    preferences: { ...user.preferences },
    awayMessages: { ...user.awayMessages },
  };
}

export function toContact(entry: ContactRecord, status: Status): Contact {
  return {
    uin: entry.contactUin,
    nickname: entry.nickname,
    status,
    awaitingAuth: !entry.authorized,
  };
}

export function toChatMessage(record: MessageRecord): ChatMessage {
  return {
    id: record.id,
    from: record.fromUin,
    to: record.toUin,
    text: record.text,
    kind: record.kind,
    sentAt: record.sentAt,
    deliveredOffline: record.deliveredOffline,
    urgent: record.urgent,
    read: record.readAt !== null,
  };
}

export function toNotice(record: NoticeRecord): SystemNotice {
  return {
    id: record.id,
    kind: record.kind,
    from: record.fromUin,
    fromNickname: record.fromNickname,
    reason: record.reason,
    createdAt: record.createdAt,
  };
}
