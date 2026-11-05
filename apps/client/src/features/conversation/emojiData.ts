/**
 * The emoji picker's data, built from emojibase-data (MIT). The JSON is
 * served as a same-origin asset and fetched on first use, so the bundle and
 * the source stay free of emoji characters. Categories follow the original
 * smiles menu: people, nature, food, activity, travel, objects, symbols, flags.
 * Emoji newer than Emoji 14.0 are left out: older systems draw them as boxes.
 */
import dataUrl from 'emojibase-data/en/data.json?url';

export const EMOJI_CATEGORIES = ['people', 'nature', 'food', 'activity', 'travel', 'objects', 'symbols', 'flags'] as const;
export type EmojiCategory = (typeof EMOJI_CATEGORIES)[number];

export interface EmojiEntry {
  hexcode: string;
  unicode: string;
  label: string;
}

export type EmojiSet = Record<EmojiCategory, EmojiEntry[]>;

/** emojibase group numbers (meta/groups.json) to the original categories; 2 (components) is skipped. */
const GROUP_TO_CATEGORY: Record<number, EmojiCategory> = {
  0: 'people',
  1: 'people',
  3: 'nature',
  4: 'food',
  5: 'travel',
  6: 'activity',
  7: 'objects',
  8: 'symbols',
  9: 'flags',
};

const LOAD_TIMEOUT_MS = 15_000;
/** The newest Emoji version offered (2021; drawn by every current desktop system). */
export const MAX_EMOJI_VERSION = 14;

function field(item: object, key: string): unknown {
  return Reflect.get(item, key);
}

/** Validates the raw dataset and groups it; malformed entries are skipped. */
export function buildEmojiSet(raw: unknown): EmojiSet {
  const set: EmojiSet = { people: [], nature: [], food: [], activity: [], travel: [], objects: [], symbols: [], flags: [] };
  if (!Array.isArray(raw)) throw new Error('The emoji list is not an array.');
  const ordered: Array<{ order: number; category: EmojiCategory; entry: EmojiEntry }> = [];
  for (const item of raw as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const group = field(item, 'group');
    // data.json names the emoji `emoji`; compact.json names it `unicode`.
    const unicode = field(item, 'emoji') ?? field(item, 'unicode');
    const hexcode = field(item, 'hexcode');
    const label = field(item, 'label');
    const order = field(item, 'order');
    const version = field(item, 'version');
    if (typeof group !== 'number' || typeof unicode !== 'string' || typeof hexcode !== 'string' || typeof label !== 'string') continue;
    if (typeof version === 'number' && version > MAX_EMOJI_VERSION) continue;
    const category = GROUP_TO_CATEGORY[group];
    if (!category) continue;
    ordered.push({ order: typeof order === 'number' ? order : Number.MAX_SAFE_INTEGER, category, entry: { hexcode, unicode, label } });
  }
  ordered.sort((a, b) => a.order - b.order);
  for (const { category, entry } of ordered) set[category].push(entry);
  return set;
}

let cached: Promise<EmojiSet> | null = null;

export type EmojiFetch = (url: string, init: RequestInit) => Promise<Response>;

export function loadEmojiSet(fetchFn: EmojiFetch = (url, init) => fetch(url, init)): Promise<EmojiSet> {
  cached ??= fetchFn(dataUrl, { signal: AbortSignal.timeout(LOAD_TIMEOUT_MS), credentials: 'same-origin' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`The emoji list could not be loaded (${response.status}).`);
      return buildEmojiSet(await response.json());
    })
    .catch((error: unknown) => {
      cached = null;
      throw error instanceof Error ? error : new Error(String(error));
    });
  return cached;
}

/** The emoji text for a stored hexcode such as "1F44D" or "2764-FE0F". */
export function emojiFromHex(hexcode: string): string {
  return String.fromCodePoint(...hexcode.split('-').map((part) => Number.parseInt(part, 16)));
}
