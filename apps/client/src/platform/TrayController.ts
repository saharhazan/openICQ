/**
 * Desktop app: drives the native tray icon (the ICQ flower in the system tray
 * or the macOS menu bar) from the store: the same blink and spin as the in-page
 * taskbar flower, the unread badge, the tray menu, and a nudge (taskbar flash,
 * dock bounce) when a new message arrives.
 */
import { TRAY_ACTIVATE, type DesktopBridge, type TrayState } from '@openicq/desktop-bridge';
import { trayIcon, trayIndicator, trayLabel, type TrayIcon } from '../app/trayActions';
import type { AppStore, AppStoreState } from '../state/store';
import type { MenuItem } from '../ui/PopupMenu';
import { toTrayMenu } from './trayMenu';

export type TrayIconRenderer = (icon: TrayIcon) => TrayState['icon'];

export interface TrayControllerDeps {
  store: AppStore;
  bridge: DesktopBridge;
  renderIcon: TrayIconRenderer;
  menu(state: AppStoreState): MenuItem[];
  /** A click on the tray icon itself. */
  onActivate(): void;
  report(error: Error): void;
}

const BLINK_MS = 500;
const SPIN_MS = 120;

export class TrayController {
  readonly #deps: TrayControllerDeps;
  readonly #icons = new Map<string, TrayState['icon']>();
  #commands: ReadonlyMap<string, () => void> = new Map();
  #unsubscribe: Array<() => void> = [];
  #timer: ReturnType<typeof setInterval> | null = null;
  #period: number | null = null;
  #tick = 0;
  #lastSent = '';
  #lastUnread = 0;
  #renderFailed = false;

  constructor(deps: TrayControllerDeps) {
    this.#deps = deps;
  }

  start(): void {
    if (this.#unsubscribe.length > 0) return;
    const { store, bridge } = this.#deps;
    this.#unsubscribe = [store.subscribe(() => this.#refresh()), bridge.onTrayCommand((command) => this.#onCommand(command))];
    this.#refresh();
  }

  stop(): void {
    for (const unsubscribe of this.#unsubscribe) unsubscribe();
    this.#unsubscribe = [];
    this.#schedule(null);
  }

  #onCommand(command: string): void {
    if (command === TRAY_ACTIVATE) {
      this.#deps.onActivate();
      return;
    }
    this.#commands.get(command)?.();
  }

  #refresh(): void {
    const state = this.#deps.store.getState();
    const indicator = trayIndicator(state);
    this.#schedule(indicator.connecting ? SPIN_MS : indicator.blinking ? BLINK_MS : null);

    if (indicator.unread > this.#lastUnread) this.#deps.bridge.requestAttention();
    this.#lastUnread = indicator.unread;

    const icon = this.#icon(trayIcon(indicator, this.#tick % 2 === 0, this.#tick));
    if (!icon) return;
    const menu = toTrayMenu(this.#deps.menu(state));
    this.#commands = menu.commands;
    const tray: TrayState = {
      icon,
      tooltip: trayLabel(indicator.unread),
      menu: menu.items,
      badge: indicator.unread + indicator.notices,
    };
    const serialized = JSON.stringify(tray);
    if (serialized === this.#lastSent) return;
    this.#lastSent = serialized;
    this.#deps.bridge.updateTray(tray);
  }

  #icon(icon: TrayIcon): TrayState['icon'] | null {
    const key = icon.kind === 'message' ? 'message' : `${icon.variant}:${icon.variant === 'connecting' ? icon.frame % 8 : 0}`;
    const cached = this.#icons.get(key);
    if (cached) return cached;
    if (this.#renderFailed) return null;
    try {
      const rendered = this.#deps.renderIcon(icon);
      this.#icons.set(key, rendered);
      return rendered;
    } catch (error) {
      // Reported once; the tray keeps its last icon.
      this.#renderFailed = true;
      this.#deps.report(error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  /** One interval at a time: the spin while connecting, else the blink while events wait. */
  #schedule(period: number | null): void {
    if (period === this.#period) return;
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
    this.#period = period;
    this.#tick = 0;
    if (period === null) return;
    this.#timer = setInterval(() => {
      this.#tick += 1;
      this.#refresh();
    }, period);
  }
}
