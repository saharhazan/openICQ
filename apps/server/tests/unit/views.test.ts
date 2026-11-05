import { beforeEach, describe, expect, it } from 'vitest';
import { ViewBuilder } from '../../src/application/views.ts';
import type { PresenceRegistry } from '../../src/domain/ports.ts';
import type { JoinRequestRepository } from '../../src/domain/repositories.ts';
import {
  chat,
  file,
  member,
  message,
  mockBlocks,
  mockChats,
  mockContacts,
  mockMessages,
  mockUsers,
  strictMock,
  user,
} from './mocks.ts';

const ALICE = 100000;
const BOB = 100001;

describe('ViewBuilder (per-viewer payloads)', () => {
  let users: ReturnType<typeof mockUsers>;
  let chats: ReturnType<typeof mockChats>;
  let messages: ReturnType<typeof mockMessages>;
  let contacts: ReturnType<typeof mockContacts>;
  let blocks: ReturnType<typeof mockBlocks>;
  let requests: ReturnType<typeof strictMock<JoinRequestRepository>>;
  let presence: ReturnType<typeof strictMock<PresenceRegistry>>;
  let views: ViewBuilder;

  beforeEach(() => {
    users = mockUsers();
    chats = mockChats();
    messages = mockMessages();
    contacts = mockContacts();
    blocks = mockBlocks();
    requests = strictMock<JoinRequestRepository>('requests', ['create', 'find', 'list', 'count', 'delete']);
    presence = strictMock<PresenceRegistry>('presence', ['isOnline']);
    views = new ViewBuilder({ users, chats, messages, contacts, blocks, requests, presence });
    messages.findMany.mockReturnValue([]);
    messages.attachmentsOf.mockReturnValue(new Map());
    messages.reactionCounts.mockReturnValue([]);
  });

  it('echoes clientId only to the sender and computes mine per viewer', () => {
    const record = message(5, 1, ALICE, { clientId: 'pending-1' });
    messages.reactionCounts.mockImplementation((_ids, viewer) => [
      { messageId: 5, reaction: 'super', count: 2, mine: viewer === BOB },
      { messageId: 5, reaction: 'like', count: 1, mine: false },
    ]);
    const forAlice = views.message(ALICE, record);
    const forBob = views.message(BOB, record);
    expect(forAlice.clientId).toBe('pending-1');
    expect(forBob.clientId).toBeNull();
    expect(forBob.reactions).toEqual([
      { reaction: 'like', count: 1, mine: false },
      { reaction: 'super', count: 2, mine: true },
    ]);
    expect(forAlice.reactions[1]?.mine).toBe(false);
  });

  it('builds reply previews, empty for deleted messages', () => {
    messages.findMany.mockReturnValue([message(3, 1, BOB, { text: 'x'.repeat(300) }), message(4, 1, BOB, { deleted: true, text: '' })]);
    messages.attachmentsOf.mockReturnValue(new Map([[3, [file(9, BOB)]]]));
    const [long, gone] = views.messages(ALICE, [message(5, 1, ALICE, { replyToId: 3 }), message(6, 1, ALICE, { replyToId: 4 })]);
    expect(long?.replyTo).toMatchObject({ messageId: 3, sender: BOB, hasAttachments: true, deleted: false });
    expect(long?.replyTo?.text).toHaveLength(200);
    expect(gone?.replyTo).toEqual({ messageId: 4, sender: BOB, text: '', hasAttachments: false, deleted: true });
  });

  it('shows the invite link and pending requests to admins only', () => {
    const group = chat(1, { type: 'group', pair: null, title: 'Club', inviteToken: 'secret-token' });
    messages.lastVisible.mockReturnValue(null);
    messages.countUnread.mockReturnValue(0);
    chats.countMembers.mockReturnValue(3);
    requests.count.mockReturnValue(2);
    const asAdmin = views.chat(ALICE, group, member(1, ALICE, { role: 'admin' }));
    const asMember = views.chat(BOB, group, member(1, BOB));
    expect(asAdmin.group).toMatchObject({ inviteToken: 'secret-token', pendingRequests: 2, myRole: 'admin' });
    expect(asMember.group).toMatchObject({ inviteToken: null, pendingRequests: 0, myRole: 'member' });
  });

  it('counts unread after the later of the read mark and the clear mark, and reports the peer marks', () => {
    messages.lastVisible.mockReturnValue(null);
    messages.countUnread.mockReturnValue(4);
    chats.findMember.mockReturnValue(member(1, BOB, { lastDeliveredId: 12, lastReadId: 10 }));
    const row = views.chat(ALICE, chat(1, { pair: [ALICE, BOB] }), member(1, ALICE, { lastReadId: 7, clearedBeforeId: 9, pinOrder: 2 }));
    expect(messages.countUnread).toHaveBeenCalledWith(1, ALICE, 9);
    expect(row).toMatchObject({ peer: BOB, unread: 4, lastReadId: 7, peerDeliveredId: 12, peerReadId: 10, pinned: true, title: '' });
  });

  it('hides presence from users the subject blocked, and flags contacts and blocks for the viewer', () => {
    presence.isOnline.mockReturnValue(true);
    blocks.isBlocking.mockImplementation((owner, blocked) => owner === BOB && blocked === ALICE);
    contacts.has.mockReturnValue(true);
    const bobForAlice = views.user(ALICE, user(BOB, { lastSeenAt: '2026-11-01T00:00:00.000Z' }));
    expect(bobForAlice).toMatchObject({ presence: { online: false, lastSeen: null }, isContact: true, blocked: false });
    const aliceForBob = views.user(BOB, user(ALICE));
    expect(aliceForBob).toMatchObject({ presence: { online: true }, blocked: true });
  });
});
