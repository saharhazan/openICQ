/** Runtime validation of everything that crosses the desktop bridge. */
import { z } from 'zod';

export const unreadCountSchema = z.number().int().min(0).max(99_999);

export const desktopNotificationSchema = z.object({
  /** Notifications with the same tag replace each other (one per chat). */
  tag: z.string().min(1).max(64),
  title: z.string().max(200),
  body: z.string().max(500),
  chatId: z.number().int().positive(),
  /** The page plays its own sound. */
  silent: z.boolean(),
});
export type DesktopNotification = z.infer<typeof desktopNotificationSchema>;

export const desktopPreferencesSchema = z.object({
  /** "Launch when system starts". */
  launchAtLogin: z.boolean(),
  /** "Launch minimized" (to the tray). */
  launchMinimized: z.boolean(),
  /** "Animate taskbar icon" on new messages (Windows and Linux flash, macOS bounce). */
  animateTaskbar: z.boolean(),
});
export type DesktopPreferences = z.infer<typeof desktopPreferencesSchema>;
