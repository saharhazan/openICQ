/**
 * Settings kept per device, like in the original desktop client: theme,
 * font size, compact list, send key, sounds and notifications.
 * Defaults from common.shared/constants.h of ICQ New.
 */
import { z } from 'zod';

export const THEMES = ['green', 'dark-green'] as const;
export const FONT_SIZES = ['small', 'medium', 'large'] as const;
export const SEND_KEYS = ['enter', 'ctrlEnter', 'shiftEnter'] as const;

export type ThemeName = (typeof THEMES)[number];
export type FontSize = (typeof FONT_SIZES)[number];
export type SendKey = (typeof SEND_KEYS)[number];

export const COLUMN_MIN = 280;
export const COLUMN_MAX = 400;
export const COLUMN_DEFAULT = 328;

export const devicePrefsSchema = z.object({
  theme: z.enum(THEMES),
  fontSize: z.enum(FONT_SIZES),
  compact: z.boolean(),
  sendKey: z.enum(SEND_KEYS),
  playSounds: z.boolean(),
  outgoingSound: z.boolean(),
  showNotifications: z.boolean(),
  showInFocus: z.boolean(),
  hideText: z.boolean(),
  hideSender: z.boolean(),
  animateTaskbar: z.boolean(),
  launchAtLogin: z.boolean(),
  launchMinimized: z.boolean(),
  columnWidth: z.number().int().min(COLUMN_MIN).max(COLUMN_MAX),
  /** Emoji hexcodes, newest first. */
  recentEmoji: z.array(z.string().regex(/^[0-9A-F-]{2,64}$/)).max(40),
});
export type DevicePrefs = z.infer<typeof devicePrefsSchema>;

export const DEFAULT_PREFS: DevicePrefs = {
  theme: 'green',
  fontSize: 'medium',
  compact: false,
  sendKey: 'enter',
  playSounds: true,
  outgoingSound: false,
  showNotifications: true,
  showInFocus: false,
  hideText: false,
  hideSender: false,
  animateTaskbar: false,
  launchAtLogin: false,
  launchMinimized: false,
  columnWidth: COLUMN_DEFAULT,
  recentEmoji: [],
};

/** Accepts a partly valid stored object: unknown or broken fields fall back to the defaults. */
export function parsePrefs(value: unknown): DevicePrefs {
  if (typeof value !== 'object' || value === null) return DEFAULT_PREFS;
  const result: Record<string, unknown> = { ...DEFAULT_PREFS };
  const shape = devicePrefsSchema.shape;
  for (const key of Object.keys(shape) as Array<keyof typeof shape>) {
    const parsed = shape[key].safeParse(Reflect.get(value, key));
    if (parsed.success) result[key] = parsed.data;
  }
  return devicePrefsSchema.parse(result);
}

/** Small -1 px, Large +2 px (gui/fonts.cpp adjustFontSize). */
export function fontDelta(size: FontSize): number {
  return size === 'small' ? -1 : size === 'large' ? 2 : 0;
}

/** Whether a key press sends the message under the chosen "Send message by". */
export function isSendKey(sendKey: SendKey, event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): boolean {
  if (event.key !== 'Enter' || event.altKey) return false;
  switch (sendKey) {
    case 'enter':
      return !event.ctrlKey && !event.metaKey && !event.shiftKey;
    case 'ctrlEnter':
      return (event.ctrlKey || event.metaKey) && !event.shiftKey;
    case 'shiftEnter':
      return event.shiftKey && !event.ctrlKey && !event.metaKey;
  }
}
