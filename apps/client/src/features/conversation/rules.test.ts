import { describe, expect, it } from 'vitest';
import { ME, chat, group, message } from '../../../tests/fixtures';
import { fitPreview } from '../../app/attachments';
import { isSendKey } from '../../app/devicePrefs';
import { LocalPrefs } from '../../app/LocalPrefs';
import { hexOf } from './EmojiPicker';
import { buildEmojiSet, emojiFromHex } from './emojiData';
import { messageMenuEntries } from './messageMenu';
import { nextReaction } from './reactions';
import { batches } from './SendFilesDialog';
import bubbleCss from './bubble.css?raw';
import globalCss from '../../styles/global.css?raw';

const labels = (entries: ReturnType<typeof messageMenuEntries>) => entries.map((e) => e.label);

describe('message menu rules', () => {
  it('lets a group admin delete for all, but not edit, other messages', () => {
    const admin = chat(5, { type: 'group', group: group({ myRole: 'admin' }) });
    const entries = messageMenuEntries(message(5, 7, 'spam'), { chat: admin, me: ME, canWrite: true });
    expect(labels(entries)).toEqual(['Reply', 'Copy', 'Forward', 'Select', 'Delete for me', 'Delete for all']);
  });

  it('has a single Delete in Favorites', () => {
    const fav = chat(3, { type: 'favorites' });
    expect(labels(messageMenuEntries(message(3, ME, 'note'), { chat: fav, me: ME, canWrite: true }))).toEqual(['Reply', 'Copy', 'Forward', 'Select', 'Edit', 'Delete']);
  });

  it('offers only Select and Delete for me on a tombstone, and no Reply when read only', () => {
    const direct = chat(1, { peer: 2 });
    expect(labels(messageMenuEntries(message(1, 2, '', { deleted: true }), { chat: direct, me: ME, canWrite: true }))).toEqual(['Select', 'Delete for me']);
    expect(labels(messageMenuEntries(message(1, 2, 'x'), { chat: direct, me: ME, canWrite: false }))).not.toContain('Reply');
  });
});

describe('reactions', () => {
  it('toggles my reaction and replaces another one', () => {
    const mine = [{ reaction: 'like' as const, count: 1, mine: true }];
    expect(nextReaction(mine, 'like')).toBeNull();
    expect(nextReaction(mine, 'sad')).toBe('sad');
  });
});

describe('send key', () => {
  const key = (extra: Partial<KeyboardEvent> = {}) => ({ key: 'Enter', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...extra });
  it('matches Enter, Ctrl + Enter and Shift + Enter', () => {
    expect(isSendKey('enter', key())).toBe(true);
    expect(isSendKey('enter', key({ shiftKey: true }))).toBe(false);
    expect(isSendKey('ctrlEnter', key({ ctrlKey: true }))).toBe(true);
    expect(isSendKey('ctrlEnter', key({ metaKey: true }))).toBe(true);
    expect(isSendKey('ctrlEnter', key())).toBe(false);
    expect(isSendKey('shiftEnter', key({ shiftKey: true }))).toBe(true);
  });
});

describe('emoji data', () => {
  it('groups emojibase entries into the original categories in order', () => {
    const set = buildEmojiSet([
      { group: 3, order: 5, label: 'dog face', hexcode: '1F436', unicode: String.fromCodePoint(0x1f436) },
      { group: 0, order: 2, label: 'grinning face', hexcode: '1F600', unicode: String.fromCodePoint(0x1f600) },
      { group: 1, order: 1, label: 'waving hand', hexcode: '1F44B', unicode: String.fromCodePoint(0x1f44b) },
      { group: 2, order: 3, label: 'skin tone', hexcode: '1F3FB', unicode: String.fromCodePoint(0x1f3fb) },
      { label: 'regional indicator', hexcode: '1F1E6', unicode: String.fromCodePoint(0x1f1e6) },
      { group: 0, order: 9, label: 'shaking face', hexcode: '1FAE8', emoji: String.fromCodePoint(0x1fae8), version: 15 },
      { group: 0, order: 4, label: 'smiling face', hexcode: '263A', emoji: String.fromCodePoint(0x263a), version: 0.6 },
    ]);
    expect(set.people.map((e) => e.label)).toEqual(['waving hand', 'grinning face', 'smiling face']);
    expect(set.nature.map((e) => e.label)).toEqual(['dog face']);
    expect(Object.values(set).flat()).toHaveLength(4);
  });

  it('round-trips recent emoji through hexcodes, keeping FE0F', () => {
    const heart = String.fromCodePoint(0x2764, 0xfe0f);
    expect(hexOf(heart)).toBe('2764-FE0F');
    expect(emojiFromHex('2764-FE0F')).toBe(heart);
  });
});

describe('files', () => {
  it('fits image previews into 360 x 360 with a 112 minimum', () => {
    expect(fitPreview(1200, 600)).toEqual({ width: 360, height: 180 });
    expect(fitPreview(200, 150)).toEqual({ width: 200, height: 150 });
    expect(fitPreview(2, 2)).toEqual({ width: 112, height: 112 });
    expect(fitPreview(null, null)).toEqual({ width: 320, height: 240 });
  });

  it('sends at most 10 attachments per message', () => {
    expect(batches([...Array(23).keys()]).map((b) => b.length)).toEqual([10, 10, 3]);
  });
});

describe('drafts', () => {
  it('are stored per account and removed when empty', () => {
    const map = new Map<string, string>();
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
    const prefs = new LocalPrefs(() => storage, () => undefined);
    prefs.saveDrafts(ME, { 4: 'later' });
    expect(prefs.loadDrafts(ME)).toEqual({ 4: 'later' });
    expect(prefs.loadDrafts(ME + 1)).toEqual({});
    prefs.saveDrafts(ME, {});
    expect(map.size).toBe(0);
  });
});

describe('bubble metrics', () => {
  it('keeps radius 12 and 4 on the joined corners of each side', () => {
    const css = bubbleCss;
    const global = globalCss;
    expect(global).toMatch(/--bubble-radius: 12px/);
    expect(global).toMatch(/--bubble-chain-radius: 4px/);
    expect(css).toMatch(/\.msg-in\.chained-prev \.bubble \{\s*border-top-left-radius: var\(--bubble-chain-radius\)/);
    expect(css).toMatch(/\.msg-in\.chained-next \.bubble \{\s*border-bottom-left-radius: var\(--bubble-chain-radius\)/);
    expect(css).toMatch(/\.msg-out\.chained-prev \.bubble \{\s*border-top-right-radius: var\(--bubble-chain-radius\)/);
    expect(css).toMatch(/\.msg-out\.chained-next \.bubble \{\s*border-bottom-right-radius: var\(--bubble-chain-radius\)/);
  });
});
