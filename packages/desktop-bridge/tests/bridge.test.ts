import { describe, expect, it } from 'vitest';
import { IPC, TRAY_COMMANDS, desktopNotificationSchema, desktopPreferencesSchema, unreadCountSchema } from '../src/index.ts';

describe('desktop bridge contract', () => {
  it('validates notifications from the page', () => {
    const ok = { tag: 'chat-3', title: 'Alice', body: 'Hi!', chatId: 3, silent: true };
    expect(desktopNotificationSchema.parse(ok)).toEqual(ok);
    expect(desktopNotificationSchema.safeParse({ ...ok, chatId: 0 }).success).toBe(false);
    expect(desktopNotificationSchema.safeParse({ ...ok, body: 'x'.repeat(501) }).success).toBe(false);
  });

  it('validates the unread count and the shell preferences', () => {
    expect(unreadCountSchema.safeParse(-1).success).toBe(false);
    expect(unreadCountSchema.safeParse(2.5).success).toBe(false);
    expect(desktopPreferencesSchema.parse({ launchAtLogin: true, launchMinimized: false, animateTaskbar: false })).toEqual({
      launchAtLogin: true,
      launchMinimized: false,
      animateTaskbar: false,
    });
    expect(desktopPreferencesSchema.safeParse({ launchAtLogin: true }).success).toBe(false);
  });

  it('keeps IPC channels unique and the tray commands known', () => {
    expect(new Set(Object.values(IPC)).size).toBe(Object.values(IPC).length);
    expect(TRAY_COMMANDS).toEqual(['settings']);
  });
});
