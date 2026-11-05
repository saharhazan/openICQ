/**
 * The hidden host page and the native ICQ windows it opens.
 *
 * The client runs in one hidden BrowserWindow (one store, one connection, one
 * sound player). Each ICQ window is a frameless child window the page opens
 * with `window.open` and renders into through a React portal; this class
 * adopts those windows, gives them their Win98 frame options, and relays what
 * the user does to them (close, minimize, focus, move) back to the page.
 * Nothing the page sends is trusted: every payload is parsed first.
 */
import {
  app,
  BrowserWindow,
  type Event as ElectronEvent,
  ipcMain,
  powerMonitor,
  screen,
  shell,
  type BrowserWindowConstructorOptions,
  type HandlerDetails,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type WebContents,
  type WindowOpenHandlerResponse,
} from 'electron';
import {
  contentSizeSchema,
  IPC,
  parseWindowFeatures,
  trayStateSchema,
  windowIdFromFrameName,
  windowIdSchema,
  type NativeWindowEvent,
  type NativeWindowFeatures,
  type TrayState,
} from '@openicq/desktop-bridge';

export interface HostWindowOptions {
  /** The server origin the client is loaded from. */
  readonly url: string;
  readonly preload: string;
  /** The window icon on Windows and Linux. */
  readonly icon: string;
  readonly onTray: (state: TrayState) => void;
  readonly onOpenConnection: () => void;
  readonly onQuit: () => void;
  readonly onCrashed: (reason: string) => void;
}

/** Moves and resizes come in bursts while dragging; the page only needs where it ended. */
const BOUNDS_DEBOUNCE_MS = 300;
/**
 * A window closed from its own button (OK, Done, Cancel) is hidden at once and
 * destroyed a moment later, so the click that closed it can finish first.
 */
const DESTROY_DELAY_MS = 1_000;
const SURFACE = '#c0c0c0';
/** The page may come from a remote server: it cannot flood the screen with windows... */
const MAX_CHILD_WINDOWS = 30;
/** ...or the user's browser with tabs. A user clicks links far slower than this. */
const EXTERNAL_LINK_INTERVAL_MS = 1_000;

export class HostWindow {
  readonly #options: HostWindowOptions;
  readonly #origin: string;
  readonly #page: BrowserWindow;
  readonly #children = new Map<string, BrowserWindow>();
  readonly #ipcCleanups: Array<() => void> = [];
  #closing = false;
  #lastExternalLink = 0;

  constructor(options: HostWindowOptions) {
    this.#options = options;
    this.#origin = new URL(options.url).origin;
    this.#page = new BrowserWindow({
      show: false,
      title: 'openICQ',
      backgroundColor: SURFACE,
      webPreferences: {
        preload: options.preload,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        // The page is never visible but runs timers, blinking and sounds for every window.
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
        spellcheck: false,
      },
    });
    const contents = this.#page.webContents;
    contents.setWindowOpenHandler((details) => this.#onWindowOpen(details));
    contents.on('did-create-window', (child, details) => this.#adopt(child, details.frameName));
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
      if (!this.#closing && details.reason !== 'clean-exit') options.onCrashed(details.reason);
    });
    this.#registerIpc(contents);
  }

  /** Rejects when the server cannot be reached. */
  load(): Promise<void> {
    return this.#page.loadURL(this.#options.url);
  }

  /** Destroys every window (quit, or switching servers). */
  close(): void {
    this.#closing = true;
    for (const cleanup of this.#ipcCleanups) cleanup();
    for (const child of this.#children.values()) if (!child.isDestroyed()) child.destroy();
    this.#children.clear();
    if (!this.#page.isDestroyed()) this.#page.destroy();
  }

  /** Lets the page react to a tray or dock click, or a second app start. */
  sendTrayCommand(command: string): void {
    if (!this.#page.isDestroyed()) this.#page.webContents.send(IPC.trayCommand, command);
  }

  #isOwnOrigin(url: string): boolean {
    return URL.canParse(url) && new URL(url).origin === this.#origin;
  }

  #onWindowOpen(details: HandlerDetails): WindowOpenHandlerResponse {
    const id = windowIdFromFrameName(details.frameName);
    const features = parseWindowFeatures(details.features);
    if (id !== null && features !== null && (details.url === 'about:blank' || details.url === '')) {
      if (this.#children.size >= MAX_CHILD_WINDOWS && !this.#children.has(id)) return { action: 'deny' };
      return { action: 'allow', overrideBrowserWindowOptions: this.#childOptions(features) };
    }
    this.#openExternal(details.url);
    return { action: 'deny' };
  }

  /** Links in messages open in the user's browser: web addresses only, and at a human pace. */
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

  #childOptions(features: NativeWindowFeatures): BrowserWindowConstructorOptions {
    const { x, y, width, height } = onScreen(features);
    return {
      show: false,
      frame: false,
      x,
      y,
      width,
      height,
      useContentSize: true,
      resizable: features.resizable,
      minWidth: features.minWidth || undefined,
      minHeight: features.minHeight || undefined,
      maximizable: false,
      fullscreenable: false,
      // Square Win98 corners on macOS too.
      roundedCorners: false,
      backgroundColor: SURFACE,
      title: 'openICQ',
      icon: this.#options.icon,
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
    };
  }

  #adopt(child: BrowserWindow, frameName: string): void {
    const id = windowIdFromFrameName(frameName);
    if (id === null) {
      child.destroy();
      return;
    }
    this.#children.get(id)?.destroy();
    this.#children.set(id, child);
    // Only the current window for this id speaks; a closing one (or one replaced by a new window) is silent.
    const send = (event: NativeWindowEvent) => {
      if (this.#children.get(id) === child && !this.#page.isDestroyed()) this.#page.webContents.send(IPC.windowEvent, event);
    };
    let boundsTimer: ReturnType<typeof setTimeout> | null = null;
    const sendBounds = () => {
      if (boundsTimer !== null) clearTimeout(boundsTimer);
      boundsTimer = setTimeout(() => {
        boundsTimer = null;
        if (!child.isDestroyed()) send({ type: 'bounds', id, bounds: child.getContentBounds() });
      }, BOUNDS_DEBOUNCE_MS);
    };

    // The page decides what closing means (the Contact List only hides to the tray).
    child.on('close', (event) => {
      if (this.#closing) return;
      event.preventDefault();
      send({ type: 'close-requested', id });
    });
    child.on('closed', () => {
      if (boundsTimer !== null) clearTimeout(boundsTimer);
      if (this.#children.get(id) === child) this.#children.delete(id);
    });
    child.on('minimize', () => send({ type: 'minimized', id }));
    child.on('restore', () => send({ type: 'restored', id }));
    child.on('focus', () => {
      child.flashFrame(false);
      // Windows can hand focus to a hidden window when another one closes; that is not the user's doing.
      if (child.isVisible()) send({ type: 'focused', id });
    });
    child.on('blur', () => send({ type: 'blurred', id }));
    child.on('moved', sendBounds);
    child.on('resized', sendBounds);

    const contents = child.webContents;
    contents.setWindowOpenHandler(({ url }) => {
      this.#openExternal(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (event) => event.preventDefault());
    contents.on('will-redirect', (event) => event.preventDefault());
  }

  #registerIpc(contents: WebContents): void {
    const fromPage = (event: IpcMainEvent) => event.sender === contents;
    const onWindow = (channel: string, action: (child: BrowserWindow, payload: unknown) => void) => {
      const listener = (event: IpcMainEvent, rawId: unknown, payload: unknown) => {
        if (!fromPage(event)) return;
        const id = windowIdSchema.safeParse(rawId);
        const child = id.success ? this.#children.get(id.data) : undefined;
        if (child && !child.isDestroyed()) action(child, payload);
      };
      ipcMain.on(channel, listener);
      this.#ipcCleanups.push(() => ipcMain.off(channel, listener));
    };
    const on = (channel: string, action: (payload: unknown) => void) => {
      const listener = (event: IpcMainEvent, payload: unknown) => {
        if (fromPage(event)) action(payload);
      };
      ipcMain.on(channel, listener);
      this.#ipcCleanups.push(() => ipcMain.off(channel, listener));
    };

    onWindow(IPC.windowShow, (child) => {
      if (child.isMinimized()) child.restore();
      child.show();
      child.focus();
    });
    onWindow(IPC.windowMinimize, (child) => child.minimize());
    onWindow(IPC.windowHide, (child) => child.hide());
    onWindow(IPC.windowClose, (child) => this.#retire(child));
    onWindow(IPC.windowFit, (child, payload) => {
      const size = contentSizeSchema.safeParse(payload);
      if (!size.success) return;
      const area = screen.getDisplayMatching(child.getBounds()).workArea;
      child.setContentSize(Math.min(size.data.width, area.width), Math.min(size.data.height, area.height));
    });
    on(IPC.trayUpdate, (payload) => {
      const state = trayStateSchema.safeParse(payload);
      if (state.success) this.#options.onTray(state.data);
    });
    on(IPC.attention, () => this.#requestAttention());
    on(IPC.openConnection, () => this.#options.onOpenConnection());
    on(IPC.quit, () => this.#options.onQuit());

    const idle = (event: IpcMainInvokeEvent) => {
      if (event.sender !== contents) throw new Error('Not the openICQ page');
      return powerMonitor.getSystemIdleTime();
    };
    ipcMain.handle(IPC.systemIdle, idle);
    this.#ipcCleanups.push(() => ipcMain.removeHandler(IPC.systemIdle));
  }

  #retire(child: BrowserWindow): void {
    for (const [id, current] of this.#children) if (current === child) this.#children.delete(id);
    child.hide();
    setTimeout(() => {
      if (!child.isDestroyed()) child.destroy();
    }, DESTROY_DELAY_MS);
  }

  /** A new message while openICQ is in the background: flash the taskbar button (bounce the dock on macOS). */
  #requestAttention(): void {
    const windows = [...this.#children.values()].filter((w) => !w.isDestroyed());
    if (windows.some((w) => w.isFocused())) return;
    if (process.platform === 'darwin') {
      app.dock?.bounce('informational');
      return;
    }
    const target = this.#children.get('contactList') ?? windows.at(-1);
    target?.flashFrame(true);
  }
}

/** Keeps a window on a screen that still exists (a monitor may be gone) and no larger than it. */
function onScreen(features: NativeWindowFeatures): { x: number; y: number; width: number; height: number } {
  const rect = { x: features.left, y: features.top, width: features.width, height: features.height };
  const area = screen.getDisplayMatching(rect).workArea;
  const width = Math.min(rect.width, area.width);
  const height = Math.min(rect.height, area.height);
  const x = Math.min(Math.max(rect.x, area.x), area.x + area.width - width);
  const y = Math.min(Math.max(rect.y, area.y), area.y + area.height - height);
  return { x, y, width, height };
}
