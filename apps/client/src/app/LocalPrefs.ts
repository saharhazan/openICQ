import { uinSchema, type Uin } from '@openicq/protocol';
import { z } from 'zod';
import type { WindowKind, WindowRect } from '../state/windows';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const RECENT_KEY = 'icq.recentUins';
const RECT_KEY_PREFIX = 'icq.window.';
const MAX_RECENT = 8;

const recentSchema = z.array(uinSchema).max(MAX_RECENT);
const rectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().nullable(),
  height: z.number().positive().nullable(),
});

/**
 * Per-browser conveniences kept in localStorage: recently used ICQ numbers
 * and window positions. Never passwords. Every failure goes to `onError`
 * and the app keeps working without the stored value.
 */
export class LocalPrefs {
  readonly #storage: () => StorageLike;
  readonly #onError: (error: Error) => void;

  constructor(storage: () => StorageLike, onError: (error: Error) => void) {
    this.#storage = storage;
    this.#onError = onError;
  }

  recentUins(): Uin[] {
    return this.#read(RECENT_KEY, recentSchema) ?? [];
  }

  rememberUin(uin: Uin): void {
    const next = [uin, ...this.recentUins().filter((u) => u !== uin)].slice(0, MAX_RECENT);
    this.#write(RECENT_KEY, next);
  }

  windowRect(kind: WindowKind): WindowRect | null {
    return this.#read(RECT_KEY_PREFIX + kind, rectSchema);
  }

  saveWindowRect(kind: WindowKind, rect: WindowRect): void {
    this.#write(RECT_KEY_PREFIX + kind, rect);
  }

  #read<S extends z.ZodType>(key: string, schema: S): z.output<S> | null {
    let raw: string | null;
    try {
      raw = this.#storage().getItem(key);
    } catch (error) {
      this.#onError(new Error('ICQ cannot read saved settings in this browser.', { cause: error }));
      return null;
    }
    if (raw === null) return null;
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (error) {
      this.#onError(new Error(`Saved value "${key}" is unreadable and was ignored.`, { cause: error }));
      return null;
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      this.#onError(new Error(`Saved value "${key}" is invalid and was ignored.`, { cause: parsed.error }));
      return null;
    }
    return parsed.data;
  }

  #write(key: string, value: unknown): void {
    try {
      this.#storage().setItem(key, JSON.stringify(value));
    } catch (error) {
      this.#onError(new Error('ICQ cannot save settings in this browser.', { cause: error }));
    }
  }
}
