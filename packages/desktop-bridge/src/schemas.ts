/** Runtime validation of everything that crosses the desktop bridge. */
import { z } from 'zod';
import { FRAME_NAME_PREFIX } from './contract.ts';

/** Logical window ids of the client store, for example `contactList` or `message:100001`. */
export const windowIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z]+(:[A-Za-z0-9]+)*$/, 'Not an openICQ window id');

/** The window id inside a frame name, or null when the name is not one of ours. */
export function windowIdFromFrameName(frameName: string): string | null {
  if (!frameName.startsWith(FRAME_NAME_PREFIX)) return null;
  const parsed = windowIdSchema.safeParse(frameName.slice(FRAME_NAME_PREFIX.length));
  return parsed.success ? parsed.data : null;
}

const pixels = z.number().int().min(0).max(16_384);
const position = z.number().int().min(-16_384).max(16_384);

/** What the client asks for when it opens a native window. Sizes are content sizes in CSS px. */
export const nativeWindowFeaturesSchema = z.object({
  left: position,
  top: position,
  width: pixels.min(40),
  height: pixels.min(30),
  resizable: z.boolean(),
  minWidth: pixels,
  minHeight: pixels,
});
export type NativeWindowFeatures = z.infer<typeof nativeWindowFeaturesSchema>;

/** Parses a feature string from `encodeWindowFeatures`. Null when anything is missing or out of range. */
export function parseWindowFeatures(text: string): NativeWindowFeatures | null {
  const raw: Record<string, string> = {};
  for (const part of text.split(',')) {
    const [key, value] = part.split('=');
    if (key !== undefined && value !== undefined) raw[key.trim()] = value.trim();
  }
  const number = (value: string | undefined) => (value !== undefined && /^-?\d+$/.test(value) ? Number(value) : Number.NaN);
  const parsed = nativeWindowFeaturesSchema.safeParse({
    left: number(raw['left']),
    top: number(raw['top']),
    width: number(raw['width']),
    height: number(raw['height']),
    resizable: raw['resizable'] === 'yes',
    minWidth: number(raw['minWidth']),
    minHeight: number(raw['minHeight']),
  });
  return parsed.success ? parsed.data : null;
}

export const contentSizeSchema = z.object({ width: pixels.min(40), height: pixels.min(30) });
export type ContentSize = z.infer<typeof contentSizeSchema>;

export const nativeWindowBoundsSchema = z.object({ x: position, y: position, width: pixels, height: pixels });
export type NativeWindowBounds = z.infer<typeof nativeWindowBoundsSchema>;

const MAX_ICON_DATA_URL = 200_000;
const pngDataUrl = z.string().startsWith('data:image/png;base64,').max(MAX_ICON_DATA_URL);

export const trayMenuItemSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('separator') }),
  z.object({
    type: z.literal('item'),
    /** Sent back in `trayCommand` when the item is clicked. */
    id: z.string().min(1).max(60),
    label: z.string().min(1).max(80),
    enabled: z.boolean(),
    checked: z.boolean(),
  }),
]);
export type TrayMenuItem = z.infer<typeof trayMenuItemSchema>;

export const trayStateSchema = z.object({
  /** The flower at 16 px and 32 px (high-DPI). */
  icon: z.object({ x1: pngDataUrl, x2: pngDataUrl }),
  tooltip: z.string().max(120),
  menu: z.array(trayMenuItemSchema).max(40),
  /** Unread events, shown as the dock or launcher badge. */
  badge: z.number().int().min(0).max(9_999),
});
export type TrayState = z.infer<typeof trayStateSchema>;
