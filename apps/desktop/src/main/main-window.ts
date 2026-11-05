/**
 * The openICQ main window (ICQ New is one window: chat list, chat, sidebar).
 *
 * The page comes from an openICQ server, which may be remote, so nothing it
 * sends is trusted: navigation stays on that server, links open in the
 * browser at a human pace, and every bridge message is parsed first.
 * Closing the window hides it to the tray, as ICQ New did.
 */
import {
  BrowserWindow,
  Notification,
  ipcMain,
  shell,
  type Event as ElectronEvent,
  type IpcMainEvent,
  type WebContents,
} from 'electron';
import {
  IPC,
  desktopNotificationSchema,
  desktopPreferencesSchema,
  unreadCountSchema,
  type DesktopNotification,
  type DesktopPreferences,
  type TrayCommand,
} from '@openicq/desktop-bridge';

export interface MainWindowOptions {
  /** The server origin the client is loaded from. */
  readonly url: string;
  readonly preload: string;
  /** The window and notification icon. */
  readonly icon: string;
  /** Start hidden in the tray ("Launch minimized"). */
  readonly startHidden: boolean;
  readonly onUnread: (count: number) => void;
  readonly onPreferences: (preferences: DesktopPreferences) => void;
  readonly onOpenConnection: () => void;
  readonly onQuit: () => void;
  readonly onCrashed: (reason: string) => void;
}

const EXTERNAL_LINK_INTERVAL_MS = 1_000;
/** A burst of messages shows the newest notification, not a pile of them. */
const NOTIFICATION_INTERVAL_MS = 300;

export class MainWindow {
  readonly #options: MainWindowOptions;
  readonly #origin: string;
  readonly #window: BrowserWindow;
  readonly #cleanups: Array<() => void> = [];
  /** Live notifications by tag; kept referenced so their click handlers survive garbage collection. */
  readonly #notifications = new Map<string, Notification>();
  #quitting = false;
  #lastExternalLink = 0;
  #lastNotification = 0;
  #animateTaskbar = false;
  #unread = 0;

  constructor(options: MainWindowOptions) {
    this.#options = options;
    this.#origin = new URL(options.url).origin;
    this.#window = new BrowserWindow({
      // ICQ New's 1000 x 600 (minimum 380 x 580) is the content area, as Qt sizes it.
      width: 1000,
      height: 600,
      minWidth: 380,
      minHeight: 580,
      useContentSize: true,
      show: false,
      title: 'openICQ',
      icon: options.icon,
      backgroundColor: '#FFFFFF',
      autoHideMenuBar: true,
      webPreferences: {
        preload: options.preload,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        // Background throttling stays on: it is what makes a window hidden in the tray report
        // document.visibilityState 'hidden', so messages arriving there stay unread.
        autoplayPolicy: 'no-user-gesture-required',
        spellcheck: true,
      },
    });
    const win = this.#window;
    win.once('ready-to-show', () => {
      if (!options.startHidden) win.show();
    });
    win.on('close', (event) => {
      if (this.#quitting) return;
      event.preventDefault();
      win.hide();
    });
    win.on('focus', () => win.flashFrame(false));
    // The page asks the OS truth, not document.hasFocus(): a window hidden in the tray must not mark messages read.
    const report = () => this.#sendWindowState();
    win.on('show', report);
    win.on('hide', report);
    win.on('focus', report);
    win.on('blur', report);
    win.on('minimize', report);
    win.on('restore', report);
    win.webContents.on('did-finish-load', report);

    const contents = win.webContents;
    contents.setWindowOpenHandler(({ url }) => {
      this.#openExternal(url);
      return { action: 'deny' };
    });
    const stayOnServer = (event: ElectronEvent, url: string) => {
      if (!this.#isOwnOrigin(url)) event.preventDefault();
    };
    contents.on('will-navigate', stayOnServer);
    contents.on('will-redirect', stayOnServer);
    // The client has no frames; nothing may load one.
    contents.on('will-frame-navigate', (details) => {
      if (!details.isMainFrame) details.preventDefault();
    });
    contents.on('render-process-gone', (_event, details) => {
      if (!this.#quitting && details.reason !== 'clean-exit') options.onCrashed(details.reason);
    });
    this.#registerIpc(contents);
  }

  /** Rejects when the server cannot be reached. */
  load(): Promise<void> {
    return this.#window.loadURL(this.#options.url);
  }

  show(): void {
    if (this.#window.isDestroyed()) return;
    if (this.#window.isMinimized()) this.#window.restore();
    this.#window.show();
    this.#window.focus();
  }

  hide(): void {
    if (!this.#window.isDestroyed()) this.#window.hide();
  }

  isVisible(): boolean {
    return !this.#window.isDestroyed() && this.#window.isVisible();
  }

  sendTrayCommand(command: TrayCommand): void {
    this.show();
    if (!this.#window.isDestroyed()) this.#window.webContents.send(IPC.trayCommand, command);
  }

  /** Quit or switching servers: the close no longer hides. */
  close(): void {
    this.#quitting = true;
    for (const cleanup of this.#cleanups) cleanup();
    for (const notification of this.#notifications.values()) notification.close();
    this.#notifications.clear();
    if (!this.#window.isDestroyed()) this.#window.destroy();
  }

  #sendWindowState(): void {
    const win = this.#window;
    if (win.isDestroyed()) return;
    const visible = win.isVisible() && !win.isMinimized();
    win.webContents.send(IPC.windowState, { visible, focused: visible && win.isFocused() });
  }

  #isOwnOrigin(url: string): boolean {
    return URL.canParse(url) && new URL(url).origin === this.#origin;
  }

  #openExternal(url: string): void {
    const now = Date.now();
    if (now - this.#lastExternalLink < EXTERNAL_LINK_INTERVAL_MS) return;
    if (!URL.canParse(url)) return;
    const { protocol } = new URL(url);
    if (protocol !== 'http:' && protocol !== 'https:') return;
    this.#lastExternalLink = now;
    shell.openExternal(url).catch((error: unknown) => {
      process.stderr.write(`openICQ could not open ${url}: ${error instanceof Error ? error.message : String(error)}\n`);
    });
  }

  #registerIpc(contents: WebContents): void {
    const on = (channel: string, action: (payload: unknown) => void) => {
      const listener = (event: IpcMainEvent, payload: unknown) => {
        if (event.sender === contents) action(payload);
      };
      ipcMain.on(channel, listener);
      this.#cleanups.push(() => ipcMain.off(channel, listener));
    };
    on(IPC.unread, (payload) => {
      const count = unreadCountSchema.safeParse(payload);
      if (count.success) this.#setUnread(count.data);
    });
    on(IPC.notify, (payload) => {
      const notification = desktopNotificationSchema.safeParse(payload);
      if (notification.success) this.#notify(notification.data);
    });
    on(IPC.preferences, (payload) => {
      const preferences = desktopPreferencesSchema.safeParse(payload);
      if (!preferences.success) return;
      this.#animateTaskbar = preferences.data.animateTaskbar;
      this.#options.onPreferences(preferences.data);
    });
    on(IPC.openConnection, () => this.#options.onOpenConnection());
    on(IPC.quit, () => this.#options.onQuit());
  }

  #setUnread(count: number): void {
    const grew = count > this.#unread;
    this.#unread = count;
    this.#options.onUnread(count);
    // "Animate taskbar icon": off by default, as in ICQ New.
    if (grew && this.#animateTaskbar && !this.#window.isFocused()) this.#window.flashFrame(true);
  }

  #notify(data: DesktopNotification): void {
    if (!Notification.isSupported()) return;
    const now = Date.now();
    if (now - this.#lastNotification < NOTIFICATION_INTERVAL_MS) return;
    this.#lastNotification = now;
    this.#notifications.get(data.tag)?.close();
    const notification = new Notification({ title: data.title, body: data.body, silent: data.silent, icon: this.#options.icon });
    notification.on('click', () => {
      this.show();
      if (!this.#window.isDestroyed()) this.#window.webContents.send(IPC.notificationClick, data.chatId);
    });
    notification.on('close', () => {
      if (this.#notifications.get(data.tag) === notification) this.#notifications.delete(data.tag);
    });
    this.#notifications.set(data.tag, notification);
    notification.show();
  }
}
