/** The "openICQ Connection Settings" dialog: host a server here, or connect to one. */
import { BrowserWindow, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { CONNECTION_IPC, type ConnectionView, type SaveResult } from '../connection/api.ts';
import { networkUrlsFor, parseConnectionChoice } from './connection-choice.ts';
import type { ConnectionConfig } from './connection-config.ts';

export interface ConnectionWindowOptions {
  readonly preload: string;
  readonly page: string;
  readonly icon: string;
  readonly current: ConnectionConfig | null;
  /** Shown in red at the bottom, for example why the last attempt failed. */
  readonly problem: string | null;
}

/** Resolves with the user's choice, or null when the dialog is closed or cancelled. */
export function askForConnection(options: ConnectionWindowOptions): Promise<ConnectionConfig | null> {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 400,
      height: 330,
      useContentSize: true,
      frame: false,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      roundedCorners: false,
      show: false,
      title: 'openICQ Connection Settings',
      backgroundColor: '#c0c0c0',
      icon: options.icon,
      webPreferences: { preload: options.preload, contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
    });
    let settled = false;
    const finish = (config: ConnectionConfig | null) => {
      if (settled) return;
      settled = true;
      ipcMain.removeHandler(CONNECTION_IPC.load);
      ipcMain.removeHandler(CONNECTION_IPC.save);
      ipcMain.off(CONNECTION_IPC.cancel, onCancel);
      if (!win.isDestroyed()) win.destroy();
      resolve(config);
    };
    const fromPage = (event: IpcMainEvent | IpcMainInvokeEvent) => event.sender === win.webContents;
    const onCancel = (event: IpcMainEvent) => {
      if (fromPage(event)) finish(null);
    };
    ipcMain.handle(CONNECTION_IPC.load, (event): ConnectionView => {
      if (!fromPage(event)) throw new Error('Not the Connection Settings page');
      return { config: options.current, networkUrls: networkUrlsFor(options.current), problem: options.problem };
    });
    ipcMain.handle(CONNECTION_IPC.save, (event, raw: unknown): SaveResult => {
      if (!fromPage(event)) throw new Error('Not the Connection Settings page');
      const choice = parseConnectionChoice(raw);
      if ('error' in choice) return { ok: false, error: choice.error };
      // Answer first, close after: the page must not see its own window vanish mid-call.
      setImmediate(() => finish(choice.config));
      return { ok: true };
    });
    ipcMain.on(CONNECTION_IPC.cancel, onCancel);
    win.on('closed', () => finish(null));
    win.once('ready-to-show', () => win.show());
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.loadFile(options.page).catch((error: unknown) => {
      process.stderr.write(`openICQ could not show the connection settings: ${String(error)}\n`);
      finish(null);
    });
  });
}
