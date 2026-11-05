/** The ICQ flower in the system tray (the menu bar on macOS), drawn by the page. */
import { app, Menu, nativeImage, Tray, type MenuItemConstructorOptions, type NativeImage } from 'electron';
import { TRAY_ACTIVATE, type TrayMenuItem, type TrayState } from '@openicq/desktop-bridge';

/** The spinning flower needs about 8 frames a second; anything faster is not from the client. */
const MIN_UPDATE_INTERVAL_MS = 100;
/** The page draws 16 and 32 px flowers. */
const MAX_ICON_PX = 64;

export class AppTray {
  readonly #tray: Tray;
  readonly #onCommand: (command: string) => void;
  #lastUpdate = 0;
  #pending: TrayState | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;

  constructor(initialIcon: NativeImage, onCommand: (command: string) => void) {
    this.#onCommand = onCommand;
    this.#tray = new Tray(initialIcon);
    this.#tray.setToolTip('openICQ');
    // Windows and Linux: a click opens ICQ; the right button shows the menu. macOS always shows the menu.
    this.#tray.on('click', () => onCommand(TRAY_ACTIVATE));
  }

  /** Coalesces bursts: the latest state wins, applied at most every MIN_UPDATE_INTERVAL_MS. */
  update(state: TrayState): void {
    this.#pending = state;
    if (this.#timer !== null) return;
    const wait = Math.max(0, this.#lastUpdate + MIN_UPDATE_INTERVAL_MS - Date.now());
    this.#timer = setTimeout(() => {
      this.#timer = null;
      const next = this.#pending;
      this.#pending = null;
      this.#lastUpdate = Date.now();
      if (next && !this.#tray.isDestroyed()) this.#apply(next);
    }, wait);
  }

  destroy(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
    this.#tray.destroy();
  }

  #apply(state: TrayState): void {
    const icon = nativeImage.createFromDataURL(state.icon.x1);
    const large = nativeImage.createFromDataURL(state.icon.x2);
    const fits = (image: NativeImage) => {
      const { width, height } = image.getSize();
      return !image.isEmpty() && width <= MAX_ICON_PX && height <= MAX_ICON_PX;
    };
    if (!fits(icon) || !fits(large)) return;
    icon.addRepresentation({ scaleFactor: 2, buffer: large.toPNG() });
    this.#tray.setImage(icon);
    this.#tray.setToolTip(state.tooltip);
    this.#tray.setContextMenu(Menu.buildFromTemplate(state.menu.map((item) => this.#menuItem(item))));
    app.setBadgeCount(state.badge);
  }

  #menuItem(item: TrayMenuItem): MenuItemConstructorOptions {
    if (item.type === 'separator') return { type: 'separator' };
    return {
      label: item.label,
      enabled: item.enabled,
      type: item.checked ? 'checkbox' : 'normal',
      checked: item.checked,
      click: () => this.#onCommand(item.id),
    };
  }
}
