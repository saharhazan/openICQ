import { z } from 'zod';
import { parsePrefs, type DevicePrefs } from './devicePrefs';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const PREFS_KEY = 'openicq.prefs';
const DRAFTS_PREFIX = 'openicq.drafts.';
const DRAFT_MAX = 10_000;

const draftsSchema = z.record(z.string().regex(/^\d+$/), z.string().max(DRAFT_MAX));

/**
 * Per-device settings and per-account drafts in localStorage. Never passwords.
 * Every failure goes to `onError` and the app keeps working without the value.
 */
export class LocalPrefs {
  readonly #storage: () => StorageLike;
  readonly #onError: (error: Error) => void;

  constructor(storage: () => StorageLike, onError: (error: Error) => void) {
    this.#storage = storage;
    this.#onError = onError;
  }

  loadPrefs(): DevicePrefs {
    return parsePrefs(this.#read(PREFS_KEY));
  }

  savePrefs(prefs: DevicePrefs): void {
    this.#write(PREFS_KEY, prefs);
  }

  loadDrafts(uin: number): Record<number, string> {
    const raw = this.#read(DRAFTS_PREFIX + uin);
    if (raw === null) return {};
    const parsed = draftsSchema.safeParse(raw);
    if (!parsed.success) {
      this.#onError(new Error('Saved drafts are invalid and were ignored.', { cause: parsed.error }));
      return {};
    }
    const drafts: Record<number, string> = {};
    for (const [id, text] of Object.entries(parsed.data)) drafts[Number(id)] = text;
    return drafts;
  }

  saveDrafts(uin: number, drafts: Readonly<Record<number, string>>): void {
    if (Object.keys(drafts).length === 0) {
      this.#remove(DRAFTS_PREFIX + uin);
      return;
    }
    const trimmed: Record<string, string> = {};
    for (const [id, text] of Object.entries(drafts)) trimmed[id] = text.slice(0, DRAFT_MAX);
    this.#write(DRAFTS_PREFIX + uin, trimmed);
  }

  #read(key: string): unknown {
    let raw: string | null;
    try {
      raw = this.#storage().getItem(key);
    } catch (error) {
      this.#onError(new Error('openICQ cannot read saved settings in this browser.', { cause: error }));
      return null;
    }
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as unknown;
    } catch (error) {
      this.#onError(new Error(`Saved value "${key}" is unreadable and was ignored.`, { cause: error }));
      return null;
    }
  }

  #write(key: string, value: unknown): void {
    try {
      this.#storage().setItem(key, JSON.stringify(value));
    } catch (error) {
      this.#onError(new Error('openICQ cannot save settings in this browser.', { cause: error }));
    }
  }

  #remove(key: string): void {
    try {
      this.#storage().removeItem(key);
    } catch (error) {
      this.#onError(new Error('openICQ cannot save settings in this browser.', { cause: error }));
    }
  }
}
