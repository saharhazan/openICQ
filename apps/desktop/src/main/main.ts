/**
 * openICQ desktop app (Windows, macOS, Linux).
 *
 * Start-up: read the connection choice (ask on the first start), start the
 * embedded server when this computer hosts, then load the client from the
 * server into the main window. Like ICQ New, closing the window keeps openICQ
 * in the tray; it ends through the tray menu or the OS quit command.
 */
import { join } from 'node:path';
import { app, dialog, Menu, session } from 'electron';
import type { DesktopPreferences } from '@openicq/desktop-bridge';
import { loadConnectionConfig, saveConnectionConfig, type ConnectionConfig } from './connection-config.ts';
import { askForConnection } from './connection-window.ts';
import { DEFAULT_DESKTOP_PREFERENCES, loadDesktopPreferences, saveDesktopPreferences } from './desktop-preferences.ts';
import { startEmbeddedServer, type EmbeddedServer } from './embedded-server.ts';
import { MainWindow } from './main-window.ts';
import { AppTray } from './tray.ts';

const APP_ID = 'io.github.saharhazan.openicq';
const SHUTDOWN_TIMEOUT_MS = 5_000;

// esbuild bundles the main process as CommonJS (dist/main.cjs), so __dirname is dist/.
const paths = {
  hostPreload: join(__dirname, 'preload-host.cjs'),
  connectionPreload: join(__dirname, 'preload-connection.cjs'),
  connectionPage: join(__dirname, 'connection', 'connection.html'),
  icon: join(__dirname, 'assets', 'icon.png'),
  trayIcon: join(__dirname, 'assets', 'tray.png'),
  trayUnreadIcon: join(__dirname, 'assets', 'tray-unread.png'),
  // Outside the asar archive in a packaged app, so the server reads plain files.
  client: app.isPackaged ? join(process.resourcesPath, 'client') : join(__dirname, 'client'),
  config: () => join(app.getPath('userData'), 'connection.json'),
  preferences: () => join(app.getPath('userData'), 'desktop-preferences.json'),
};

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class OpenIcqApp {
  #window: MainWindow | null = null;
  #tray: AppTray | null = null;
  #server: EmbeddedServer | null = null;
  #config: ConnectionConfig | null = null;
  #preferences: DesktopPreferences = DEFAULT_DESKTOP_PREFERENCES;
  #shuttingDown = false;

  async start(): Promise<void> {
    this.#tray = new AppTray(
      { normal: paths.trayIcon, unread: paths.trayUnreadIcon },
      {
        open: () => this.activate(),
        settings: () => this.#window?.sendTrayCommand('settings'),
        connectionSettings: () => this.#reportFailure(this.#changeConnection()),
        quit: () => app.quit(),
      },
    );
    try {
      this.#preferences = await loadDesktopPreferences(paths.preferences());
    } catch (error) {
      dialog.showErrorBox('openICQ', `${describe(error)}\nThe default preferences are used.`);
    }
    let config: ConnectionConfig | null = null;
    let problem: string | null = null;
    try {
      config = await loadConnectionConfig(paths.config());
    } catch (error) {
      problem = describe(error);
    }
    await this.#connect(config, problem);
  }

  /** Brings openICQ to the front: a dock click, a second start, the tray icon. */
  activate(): void {
    this.#window?.show();
  }

  #reportFailure(work: Promise<void>): void {
    work.catch((error: unknown) => dialog.showErrorBox('openICQ', describe(error)));
  }

  /** The page's General and Notifications settings that the shell applies. */
  async #applyPreferences(preferences: DesktopPreferences): Promise<void> {
    const changed = JSON.stringify(preferences) !== JSON.stringify(this.#preferences);
    this.#preferences = preferences;
    if (process.platform !== 'linux') {
      // "Launch minimized" is the saved preference read at start, so only the login item is set here.
      app.setLoginItemSettings({ openAtLogin: preferences.launchAtLogin });
    }
    if (changed) await saveDesktopPreferences(paths.preferences(), preferences);
  }

  /** Keeps asking until a server is reachable, or the user gives up. */
  async #connect(initial: ConnectionConfig | null, initialProblem: string | null): Promise<void> {
    let config = initial;
    let problem = initialProblem;
    for (;;) {
      if (!config || problem) {
        const chosen = await this.#ask(config, problem);
        if (!chosen) {
          app.quit();
          return;
        }
        config = chosen;
        problem = null;
      }
      try {
        await this.#open(config);
        this.#config = config;
        return;
      } catch (error) {
        await this.#closeConnection();
        problem = describe(error);
      }
    }
  }

  async #ask(current: ConnectionConfig | null, problem: string | null): Promise<ConnectionConfig | null> {
    const chosen = await askForConnection({
      preload: paths.connectionPreload,
      page: paths.connectionPage,
      icon: paths.icon,
      current,
      problem,
    });
    if (chosen) await saveConnectionConfig(paths.config(), chosen);
    return chosen;
  }

  async #open(config: ConnectionConfig): Promise<void> {
    let url: string;
    if (config.mode === 'host') {
      this.#server = await startEmbeddedServer({
        port: config.port,
        shareOnNetwork: config.shareOnNetwork,
        dataDir: app.getPath('userData'),
        clientDir: paths.client,
      });
      url = this.#server.localUrl;
    } else {
      url = config.serverUrl;
    }
    this.#window = new MainWindow({
      url,
      preload: paths.hostPreload,
      icon: paths.icon,
      startHidden: this.#preferences.launchMinimized,
      onUnread: (count) => {
        this.#tray?.setUnread(count);
        app.setBadgeCount(count);
      },
      onPreferences: (preferences) => this.#reportFailure(this.#applyPreferences(preferences)),
      onOpenConnection: () => this.#reportFailure(this.#changeConnection()),
      onQuit: () => app.quit(),
      onCrashed: (reason) => this.#reportFailure(this.#crashed(reason)),
    });
    try {
      await this.#window.load();
    } catch (error) {
      throw new Error(`openICQ cannot reach the server at ${url}.\n${describe(error)}`, { cause: error });
    }
  }

  async #closeConnection(): Promise<void> {
    this.#window?.close();
    this.#window = null;
    const server = this.#server;
    this.#server = null;
    if (server) await withTimeout(server.close(), SHUTDOWN_TIMEOUT_MS, 'The openICQ server did not stop in time.');
  }

  /** Tray, "Connection Settings...": a new choice restarts the app with it. */
  async #changeConnection(): Promise<void> {
    const chosen = await this.#ask(this.#config, null);
    if (!chosen || JSON.stringify(chosen) === JSON.stringify(this.#config)) return;
    app.relaunch();
    app.quit();
  }

  async #crashed(reason: string): Promise<void> {
    const { response } = await dialog.showMessageBox({
      type: 'error',
      title: 'openICQ',
      message: 'openICQ stopped unexpectedly.',
      detail: `Reason: ${reason}`,
      buttons: ['Restart openICQ', 'Quit'],
      defaultId: 0,
    });
    if (response === 0) app.relaunch();
    app.quit();
  }

  /** Runs once on quit: closes the windows, the tray and the hosted server, then exits. */
  async shutdown(): Promise<void> {
    if (this.#shuttingDown) return;
    this.#shuttingDown = true;
    this.#tray?.destroy();
    this.#tray = null;
    await this.#closeConnection();
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/** No web permission (camera, microphone, notifications...) is ever needed; no webview may attach. */
function harden(): void {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
}

/** macOS needs an app menu for Quit, Copy and Paste, and Close Window; the other systems need none. */
function installMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]));
}

function main(): void {
  // A separate profile (a second account on one computer, or the end-to-end tests).
  const profile = process.env['OPENICQ_USER_DATA'];
  if (profile) app.setPath('userData', profile);
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.setAppUserModelId(APP_ID);
  app.setAboutPanelOptions({
    applicationName: 'openICQ',
    applicationVersion: app.getVersion(),
    copyright: 'MIT License',
    credits: 'An open-source rebuild of ICQ 2001b. Not affiliated with ICQ or its owners.',
  });
  const openIcq = new OpenIcqApp();

  app.on('second-instance', () => openIcq.activate());
  app.on('activate', () => openIcq.activate());
  // The app keeps running in the tray when no ICQ window is open.
  app.on('window-all-closed', () => undefined);
  app.on('before-quit', (event) => {
    event.preventDefault();
    openIcq
      .shutdown()
      .catch((error: unknown) => process.stderr.write(`openICQ shutdown: ${describe(error)}\n`))
      .finally(() => app.exit(0));
  });

  app
    .whenReady()
    .then(() => {
      harden();
      installMenu();
      return openIcq.start();
    })
    .catch((error: unknown) => {
      dialog.showErrorBox('openICQ could not start', describe(error));
      app.exit(1);
    });
}

main();
