import type { ChatMessage, Contact, Profile, SessionSnapshot, Settings, SystemNotice } from '@openicq/protocol';

export const SELF = 100001;

export function contact(uin: number, nickname: string, extra: Partial<Contact> = {}): Contact {
  return { uin, nickname, status: 'offline', awaitingAuth: false, ...extra };
}

let nextMessageId = 1;
export function message(from: number, to: number, text: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: nextMessageId++,
    from,
    to,
    text,
    kind: 'normal',
    sentAt: '2026-11-04T20:00:00.000Z',
    deliveredOffline: false,
    urgent: false,
    read: false,
    ...extra,
  };
}

export function notice(id: number, from: number, extra: Partial<SystemNotice> = {}): SystemNotice {
  return { id, kind: 'auth_request', from, fromNickname: `user${from}`, reason: '', createdAt: '2026-11-04T20:00:00.000Z', ...extra };
}

export function profile(uin: number, nickname: string): Profile {
  return {
    uin,
    nickname,
    firstName: '',
    lastName: '',
    email: '',
    gender: 'unspecified',
    age: null,
    country: '',
    city: '',
    homepage: '',
    about: '',
    authRequired: true,
    webAware: false,
  };
}

export function settings(extra: Partial<Settings> = {}): Settings {
  return {
    authRequired: true,
    webAware: false,
    hideEmail: false,
    preferences: { soundsEnabled: true, popupIncoming: false, autoAwayMinutes: 10, autoNaMinutes: 20 },
    awayMessages: { away: 'I am away', na: 'Not available', occupied: 'Busy', dnd: 'Do not disturb', ffc: 'Chat with me' },
    ...extra,
  };
}

export function snapshot(extra: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    self: profile(SELF, 'Me'),
    settings: settings(),
    status: 'online',
    contacts: [],
    notices: [],
    unread: [],
    notInList: [],
    ignored: [],
    serverTime: '2026-11-04T20:00:00.000Z',
    ...extra,
  };
}
