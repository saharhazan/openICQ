/** Factories for protocol objects in tests. */
import type { Chat, GroupInfo, Me, Message, SessionSnapshot, User } from '@openicq/protocol';

export const ME = 100001;
export const NOW = new Date('2026-11-05T12:00:00.000Z');

export function me(extra: Partial<Me> = {}): Me {
  return { uin: ME, nickname: 'sahar', firstName: 'Sahar', lastName: 'H', about: '', avatarFileId: null, email: 'me@example.com', ...extra };
}

export function user(uin: number, firstName: string, extra: Partial<User> = {}): User {
  return {
    uin,
    nickname: null,
    firstName,
    lastName: '',
    about: '',
    avatarFileId: null,
    presence: { online: false, lastSeen: null },
    isContact: true,
    blocked: false,
    ...extra,
  };
}

let nextId = 1000;
export function message(chatId: number, sender: number, text: string, extra: Partial<Message> = {}): Message {
  nextId += 1;
  return {
    id: nextId,
    chatId,
    sender,
    clientId: null,
    text,
    event: null,
    replyTo: null,
    forwardedFrom: null,
    attachments: [],
    reactions: [],
    editedAt: null,
    deleted: false,
    sentAt: '2026-11-05T11:00:00.000Z',
    ...extra,
  };
}

export function group(extra: Partial<GroupInfo> = {}): GroupInfo {
  return {
    about: '',
    rules: '',
    joinWithApproval: false,
    public: false,
    membersCount: 3,
    myRole: 'member',
    inviteToken: null,
    pendingRequests: 0,
    ...extra,
  };
}

export function chat(id: number, extra: Partial<Chat> = {}): Chat {
  return {
    id,
    type: 'direct',
    title: '',
    peer: null,
    avatarFileId: null,
    group: null,
    lastMessage: null,
    unread: 0,
    markedUnread: false,
    lastReadId: 0,
    peerDeliveredId: 0,
    peerReadId: 0,
    pinned: false,
    muted: false,
    updatedAt: '2026-11-05T11:00:00.000Z',
    ...extra,
  };
}

export function snapshot(extra: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return { me: me(), settings: { groupInvites: 'everybody' }, chats: [], users: [], contacts: [], serverTime: NOW.toISOString(), ...extra };
}
