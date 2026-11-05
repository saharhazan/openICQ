/** The openICQ flower in the system tray (the menu bar on macOS), with an unread variant. */
import { Menu, Tray, nativeImage, type NativeImage } from 'electron';

export interface AppTrayActions {
  open(): void;
  settings(): void;
  connectionSettings(): void;
  quit(): void;
}

export interface TrayIcons {
  readonly normal: string;
  readonly unread: string;
}

export class AppTray {
  readonly #tray: Tray;
  readonly #normal: NativeImage;
  readonly #unreadIcon: NativeImage;
  #unread = 0;

  constructor(icons: TrayIcons, actions: AppTrayActions) {
    // Files named name@2x.png next to name.png give the high-DPI version automatically.
    this.#normal = nativeImage.createFromPath(icons.normal);
    this.#unreadIcon = nativeImage.createFromPath(icons.unread);
    this.#tray = new Tray(this.#normal);
    this.#tray.setToolTip('openICQ');
    this.#tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open', click: () => actions.open() },
        { label: 'Settings', click: () => actions.settings() },
        { type: 'separator' },
        { label: 'Connection Settings...', click: () => actions.connectionSettings() },
        { type: 'separator' },
        { label: 'Quit openICQ', click: () => actions.quit() },
      ]),
    );
    // Windows and Linux: a click opens the window. macOS always shows the menu.
    this.#tray.on('click', () => actions.open());
  }

  setUnread(count: number): void {
    if (count === this.#unread || this.#tray.isDestroyed()) return;
    this.#unread = count;
    this.#tray.setImage(count > 0 ? this.#unreadIcon : this.#normal);
    this.#tray.setToolTip(count > 0 ? `openICQ - ${count} unread` : 'openICQ');
  }

  destroy(): void {
    if (!this.#tray.isDestroyed()) this.#tray.destroy();
  }
}
