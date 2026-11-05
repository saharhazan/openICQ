/**
 * Exposes `window.openicqDesktop` to the openICQ page (see @openicq/desktop-bridge).
 * Only these calls cross into the main process, and the main process validates
 * every argument again.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  BRIDGE_GLOBAL,
  IPC,
  PLATFORMS,
  TRAY_COMMANDS,
  type DesktopBridge,
  type DesktopPlatform,
  type TrayCommand,
  type WindowState,
} from '@openicq/desktop-bridge/contract';

const platform: DesktopPlatform = PLATFORMS.find((p) => p === process.platform) ?? 'linux';

function listen(channel: string, listener: (value: unknown) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, value: unknown) => listener(value);
  ipcRenderer.on(channel, wrapped);
  return () => {
    ipcRenderer.off(channel, wrapped);
  };
}

let windowState: WindowState = { visible: false, focused: false };
const windowListeners = new Set<(state: WindowState) => void>();
ipcRenderer.on(IPC.windowState, (_event, value: unknown) => {
  if (typeof value !== 'object' || value === null) return;
  const visible: unknown = Reflect.get(value, 'visible');
  const focused: unknown = Reflect.get(value, 'focused');
  if (typeof visible !== 'boolean' || typeof focused !== 'boolean') return;
  windowState = { visible, focused };
  for (const listener of windowListeners) listener(windowState);
});

const bridge: DesktopBridge = {
  platform,
  setUnread: (count) => ipcRenderer.send(IPC.unread, count),
  notify: (notification) => ipcRenderer.send(IPC.notify, notification),
  setPreferences: (preferences) => ipcRenderer.send(IPC.preferences, preferences),
  openConnectionSettings: () => ipcRenderer.send(IPC.openConnection),
  quit: () => ipcRenderer.send(IPC.quit),
  windowState: () => windowState,
  onWindowState: (listener) => {
    windowListeners.add(listener);
    return () => {
      windowListeners.delete(listener);
    };
  },
  onNotificationClick: (listener) =>
    listen(IPC.notificationClick, (value) => {
      if (typeof value === 'number' && Number.isInteger(value) && value > 0) listener(value);
    }),
  onTrayCommand: (listener) =>
    listen(IPC.trayCommand, (value) => {
      const command = TRAY_COMMANDS.find((c): c is TrayCommand => c === value);
      if (command) listener(command);
    }),
};

contextBridge.exposeInMainWorld(BRIDGE_GLOBAL, bridge);
