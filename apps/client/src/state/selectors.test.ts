import { describe, expect, it } from 'vitest';
import { ME, chat, me, message, user } from '../../tests/fixtures';
import { chatEventText } from './chatEventText';
import { formatListTime, formatPresence } from './format';
import { chatPreview, chatSections, chatTitle, totalUnread, typingLine } from './selectors';
import { avatarColors, avatarLetter, crc32, paletteIndex } from '../ui/avatarPalette';

const users = { 2: user(2, 'Anna', { lastName: 'Bell' }), 3: user(3, 'Ben') };
const names = { users, me: me() };

describe('chat list order', () => {
  it('keeps pinned chats in pin order and recents newest first', () => {
    const list = {
      1: chat(1, { updatedAt: '2026-11-05T09:00:00.000Z' }),
      2: chat(2, { pinned: true, updatedAt: '2026-11-05T08:00:00.000Z' }),
      3: chat(3, { type: 'favorites', pinned: true, updatedAt: '2026-11-01T08:00:00.000Z' }),
      4: chat(4, { updatedAt: '2026-11-05T10:00:00.000Z' }),
      5: chat(5, { pinned: true, updatedAt: '2026-11-05T11:00:00.000Z' }),
    };
    const { pinned, recents } = chatSections(list, [3, 2, 5]);
    expect(pinned.map((c) => c.id)).toEqual([3, 2, 5]);
    expect(recents.map((c) => c.id)).toEqual([4, 1]);
    // A chat pinned here but missing from the order goes last.
    expect(chatSections(list, [5]).pinned.map((c) => c.id)).toEqual([5, 2, 3]);
  });

  it('counts unread messages of chats that are not muted, and marked chats as one', () => {
    expect(totalUnread({ 1: chat(1, { unread: 3 }), 2: chat(2, { unread: 5, muted: true }), 3: chat(3, { markedUnread: true }) })).toBe(4);
  });
});

describe('chat row text', () => {
  it('names chats like the original', () => {
    expect(chatTitle(names, chat(1, { peer: 2 }))).toBe('Anna Bell');
    expect(chatTitle(names, chat(2, { type: 'favorites' }))).toBe('Favorites');
    expect(chatTitle(names, chat(3, { type: 'group', title: 'Team' }))).toBe('Team');
  });

  it('prefixes group previews with the first name or Me, and shows drafts first', () => {
    const group = chat(5, { type: 'group', title: 'G', lastMessage: message(5, 2, 'hello') });
    expect(chatPreview(names, group, '')).toEqual({ prefix: 'Anna', text: 'hello', isDraft: false });
    const mine = { ...group, lastMessage: message(5, ME, 'yo') };
    expect(chatPreview(names, mine, '').prefix).toBe('Me');
    expect(chatPreview(names, mine, '  draft text ')).toEqual({ prefix: 'Draft', text: 'draft text', isDraft: true });
    expect(chatPreview(names, chat(6, { peer: 2, lastMessage: message(6, 2, 'hi') }), '').prefix).toBeNull();
  });

  it('describes attachments and deleted messages', () => {
    const photo = message(1, 2, '', {
      attachments: [{ fileId: 1, name: 'a.png', mime: 'image/png', size: 1, kind: 'image', width: 10, height: 10 }],
    });
    expect(chatPreview(names, chat(1, { peer: 2, lastMessage: photo }), '').text).toBe('Photo');
    expect(chatPreview(names, chat(1, { peer: 2, lastMessage: message(1, 2, '', { deleted: true }) }), '').text).toBe('Message was deleted');
  });

  it('writes the typing line for direct chats and groups', () => {
    expect(typingLine(names, chat(1, { peer: 2 }), [2])).toBe('is typing...');
    expect(typingLine(names, chat(2, { type: 'group' }), [2, 3])).toBe('Anna, Ben are typing...');
  });
});

describe('format', () => {
  const now = new Date(2026, 10, 5, 14, 30);

  it('formats list times as time, yesterday, then the date', () => {
    expect(formatListTime(new Date(2026, 10, 5, 9, 5).toISOString(), now)).toBe('09:05');
    expect(formatListTime(new Date(2026, 10, 4, 23, 0).toISOString(), now)).toBe('yesterday');
    expect(formatListTime(new Date(2026, 9, 1).toISOString(), now)).toBe('Oct 1');
    expect(formatListTime(new Date(2025, 0, 2).toISOString(), now)).toBe('Jan 2, 2025');
  });

  it('writes presence lines', () => {
    expect(formatPresence({ online: true, lastSeen: null }, now)).toBe('Online');
    expect(formatPresence({ online: false, lastSeen: null }, now)).toBe('Has never been here');
    expect(formatPresence({ online: false, lastSeen: new Date(2026, 10, 5, 14, 29, 40).toISOString() }, now)).toBe('Seen just now');
    expect(formatPresence({ online: false, lastSeen: new Date(2026, 10, 5, 14, 25).toISOString() }, now)).toBe('Seen 5 minutes ago');
    expect(formatPresence({ online: false, lastSeen: new Date(2026, 10, 4, 8, 0).toISOString() }, now)).toBe('Seen yesterday at 08:00');
    expect(formatPresence({ online: false, lastSeen: new Date(2026, 10, 2, 8, 0).toISOString() }, now)).toBe('Seen on Monday at 08:00');
  });
});

describe('service messages', () => {
  const eventNames = { me: ME, name: (uin: number) => (uin === 2 ? 'Anna' : uin === 3 ? 'Ben' : 'Me') };

  it('uses the original chat_event strings', () => {
    expect(chatEventText({ type: 'renamed', actor: 2, target: null, value: 'Team' }, eventNames)).toBe('Anna indicated a new group name - "Team"');
    expect(chatEventText({ type: 'renamed', actor: ME, target: null, value: 'Team' }, eventNames)).toBe('You entered a new group name - "Team"');
    expect(chatEventText({ type: 'role_changed', actor: 2, target: ME, value: 'admin' }, eventNames)).toBe('You were assigned as an administrator of this group');
    expect(chatEventText({ type: 'about_changed', actor: 2, target: null, value: '' }, eventNames)).toBe('Anna deleted the group description');
  });

  it('starts membership events with their emoji', () => {
    const added = chatEventText({ type: 'member_added', actor: 2, target: 3, value: null }, eventNames);
    expect(added).toBe(`${String.fromCodePoint(0x1f44b)} Anna added Ben to the group`);
    const removedMe = chatEventText({ type: 'member_removed', actor: 2, target: ME, value: null }, eventNames);
    expect(removedMe).toBe(`${String.fromCodePoint(0x274c)} Anna deleted you`);
  });
});

describe('default avatars', () => {
  it('computes CRC-32 like zlib', () => {
    expect(crc32('123456789')).toBe(0xcbf43926);
  });

  it('picks one of the 11 palette entries and a letter', () => {
    expect(paletteIndex(100001)).toBe(crc32('100001') % 11);
    expect(avatarColors(100001).from).toMatch(/^#[0-9A-F]{6}$/);
    expect(avatarLetter('  anna')).toBe('A');
    expect(avatarLetter('')).toBe('?');
  });
});
