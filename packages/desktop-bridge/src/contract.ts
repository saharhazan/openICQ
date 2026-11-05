/**
 * The contract between the openICQ desktop shell (Electron main + preload) and
 * the client running inside it.
 *
 * ICQ New is one main window. The page is that window; it talks to the shell
 * only through `window.openicqDesktop` for what a browser cannot do: native
 * notifications, the unread badge and tray icon, start at login, and quitting.
 * A plain browser has no such object and uses web notifications instead.
 * Every payload that reaches the main process is parsed with the schemas in
 * schemas.ts, because the page may come from a remote server.
 *
 * This module has no runtime dependencies, so the preload script stays small.
 */
import type { DesktopNotification, DesktopPreferences } from './schemas.ts';

/** The property the preload script exposes on `window`. */
export const BRIDGE_GLOBAL = 'openicqDesktop';

export const IPC = {
  /** Renderer to main, fire and forget. */
  unread: 'openicq:unread',
  notify: 'openicq:notify',
  preferences: 'openicq:preferences',
  openConnection: 'openicq:open-connection',
  quit: 'openicq:quit',
  /** Main to renderer. */
  notificationClick: 'openicq:notification-click',
  trayCommand: 'openicq:tray-command',
  windowState: 'openicq:window-state',
} as const;

export const PLATFORMS = ['darwin', 'win32', 'linux'] as const;
export type DesktopPlatform = (typeof PLATFORMS)[number];

/** Tray menu items that the page handles (the shell opens and hides the window itself). */
export const TRAY_COMMANDS = ['settings'] as const;
export type TrayCommand = (typeof TRAY_COMMANDS)[number];

/**
 * Whether the main window is on screen and has the keyboard focus, as the OS
 * reports it. Hidden in the tray means not visible: messages stay unread.
 */
export interface WindowState {
  visible: boolean;
  focused: boolean;
}

/** What the preload script exposes as `window.openicqDesktop`. */
export interface DesktopBridge {
  readonly platform: DesktopPlatform;
  /** Unread chats or messages: the tray icon variant, the dock or taskbar badge, the window title counter. */
  setUnread(count: number): void;
  /** A native notification. A click shows the window and calls the notification-click listeners. */
  notify(notification: DesktopNotification): void;
  /** General and Notifications settings the shell applies ("Launch when system starts", taskbar animation). */
  setPreferences(preferences: DesktopPreferences): void;
  openConnectionSettings(): void;
  quit(): void;
  /** The last window state the shell reported (not visible until it reports one). */
  windowState(): WindowState;
  onWindowState(listener: (state: WindowState) => void): () => void;
  onNotificationClick(listener: (chatId: number) => void): () => void;
  onTrayCommand(listener: (command: TrayCommand) => void): () => void;
}
