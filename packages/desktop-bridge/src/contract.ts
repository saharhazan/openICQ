/**
 * The contract between the openICQ desktop shell (Electron main + preload) and
 * the client running inside it.
 *
 * The client renders every ICQ window into its own native window (opened with
 * `window.open`) and talks to the shell only through `window.openicqDesktop`.
 * A plain browser has no such object, so the client falls back to its in-page
 * Windows desktop. Every payload that reaches the main process is parsed with
 * the schemas in schemas.ts, because the page may come from a remote server.
 *
 * This module has no runtime dependencies, so the preload script stays small.
 */
import type { ContentSize, NativeWindowBounds, NativeWindowFeatures, TrayState } from './schemas.ts';

/** The property the preload script exposes on `window`. */
export const BRIDGE_GLOBAL = 'openicqDesktop';

export const IPC = {
  /** Renderer to main, fire and forget. */
  windowShow: 'openicq:window-show',
  windowMinimize: 'openicq:window-minimize',
  windowHide: 'openicq:window-hide',
  windowClose: 'openicq:window-close',
  windowFit: 'openicq:window-fit',
  trayUpdate: 'openicq:tray-update',
  attention: 'openicq:attention',
  openConnection: 'openicq:open-connection',
  quit: 'openicq:quit',
  /** Renderer to main, answered. */
  systemIdle: 'openicq:system-idle',
  /** Main to renderer. */
  windowEvent: 'openicq:window-event',
  trayCommand: 'openicq:tray-command',
} as const;

export const PLATFORMS = ['darwin', 'win32', 'linux'] as const;
export type DesktopPlatform = (typeof PLATFORMS)[number];

/** `window.open` target names carry this prefix, so the shell only adopts windows the client asked for. */
export const FRAME_NAME_PREFIX = 'openicq-window/';

export function frameNameFor(id: string): string {
  return `${FRAME_NAME_PREFIX}${id}`;
}

/** Encodes features as the comma-separated `window.open` feature string. */
export function encodeWindowFeatures(features: NativeWindowFeatures): string {
  return [
    `left=${features.left}`,
    `top=${features.top}`,
    `width=${features.width}`,
    `height=${features.height}`,
    `resizable=${features.resizable ? 'yes' : 'no'}`,
    `minWidth=${features.minWidth}`,
    `minHeight=${features.minHeight}`,
  ].join(',');
}

export type NativeWindowEvent =
  /** The user closed the window from the OS (Alt+F4, Cmd+W, the taskbar): the client decides. */
  | { type: 'close-requested'; id: string }
  | { type: 'minimized'; id: string }
  | { type: 'restored'; id: string }
  | { type: 'focused'; id: string }
  | { type: 'blurred'; id: string }
  /** Moved or resized by the user, in screen coordinates. */
  | { type: 'bounds'; id: string; bounds: NativeWindowBounds };

/** The command the shell sends when the tray icon itself is clicked. */
export const TRAY_ACTIVATE = 'activate';

/** What the preload script exposes as `window.openicqDesktop`. */
export interface DesktopBridge {
  readonly platform: DesktopPlatform;
  showWindow(id: string): void;
  minimizeWindow(id: string): void;
  /** Hides a window without a taskbar entry (the Contact List lives in the tray). */
  hideWindow(id: string): void;
  /** Destroys a native window; no close-requested event follows. */
  closeWindow(id: string): void;
  /** Sets the content size of a window that sizes to its content. */
  fitWindow(id: string, size: ContentSize): void;
  updateTray(state: TrayState): void;
  /** Flashes the taskbar button or bounces the dock icon when the app is in the background. */
  requestAttention(): void;
  /** Seconds since the last keyboard or mouse input anywhere on the computer. */
  systemIdleSeconds(): Promise<number>;
  openConnectionSettings(): void;
  quit(): void;
  onWindowEvent(listener: (event: NativeWindowEvent) => void): () => void;
  onTrayCommand(listener: (command: string) => void): () => void;
}
