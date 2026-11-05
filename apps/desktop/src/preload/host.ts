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
  type DesktopBridge,
  type DesktopPlatform,
  type NativeWindowEvent,
} from '@openicq/desktop-bridge/contract';

const platform: DesktopPlatform = PLATFORMS.find((p) => p === process.platform) ?? 'linux';

function listen<T>(channel: string, listener: (value: T) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, value: T) => listener(value);
  ipcRenderer.on(channel, wrapped);
  return () => {
    ipcRenderer.off(channel, wrapped);
  };
}

const bridge: DesktopBridge = {
  platform,
  showWindow: (id) => ipcRenderer.send(IPC.windowShow, id),
  minimizeWindow: (id) => ipcRenderer.send(IPC.windowMinimize, id),
  hideWindow: (id) => ipcRenderer.send(IPC.windowHide, id),
  closeWindow: (id) => ipcRenderer.send(IPC.windowClose, id),
  fitWindow: (id, size) => ipcRenderer.send(IPC.windowFit, id, size),
  updateTray: (state) => ipcRenderer.send(IPC.trayUpdate, state),
  requestAttention: () => ipcRenderer.send(IPC.attention),
  systemIdleSeconds: async () => {
    const seconds: unknown = await ipcRenderer.invoke(IPC.systemIdle);
    if (typeof seconds !== 'number') throw new Error('The system idle time is not a number.');
    return seconds;
  },
  openConnectionSettings: () => ipcRenderer.send(IPC.openConnection),
  quit: () => ipcRenderer.send(IPC.quit),
  onWindowEvent: (listener) => listen<NativeWindowEvent>(IPC.windowEvent, listener),
  onTrayCommand: (listener) => listen<string>(IPC.trayCommand, listener),
};

contextBridge.exposeInMainWorld(BRIDGE_GLOBAL, bridge);
