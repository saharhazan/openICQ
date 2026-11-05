/**
 * Desktop app: gives every window of the store its own native window and keeps
 * the two in step. The store stays the single source of truth; this class only
 * mirrors it (open, close, focus, minimize, title) and feeds what the user does
 * to the native windows (moves, resizes, OS close and minimize) back into it.
 * React renders each window into its native document through a portal
 * (see NativeDesktop), so one store, one connection and one sound player serve
 * every window, exactly as in the browser.
 */
import {
  encodeWindowFeatures,
  frameNameFor,
  type ContentSize,
  type DesktopBridge,
  type NativeWindowEvent,
} from '@openicq/desktop-bridge';
import type { LocalPrefs } from '../app/LocalPrefs';
import { windowTitle } from '../features/windowTitles';
import { minSizeOf, RESIZABLE_KINDS, sizeOf } from '../state/placement';
import type { AppStore, AppStoreState } from '../state/store';
import type { WindowKind, WindowState } from '../state/windows';
import type { NativeSurface, SurfaceView } from './WindowSurface';

/** Opens a native window; wraps `window.open` so tests can supply their own documents. */
export type OpenNativeWindow = (frameName: string, features: string) => SurfaceView | null;

export interface NativeWindowEntry {
  readonly id: string;
  /** The element React renders the window into. */
  readonly container: HTMLElement;
  readonly surface: NativeSurface;
}

export interface NativeWindowManagerDeps {
  store: AppStore;
  bridge: DesktopBridge;
  prefs: Pick<LocalPrefs, 'saveWindowRect'>;
  /** The page whose stylesheets every native window loads. */
  hostDocument: Document;
  open: OpenNativeWindow;
  report(error: Error): void;
}

/** Stylesheets come from the HTTP cache, so this only guards against a stalled load. */
const STYLESHEET_TIMEOUT_MS = 3_000;
/** The Contact List lives in the tray: hiding it leaves no taskbar button, as in the original. */
const HIDE_TO_TRAY: ReadonlySet<WindowKind> = new Set(['contactList']);

interface Tracked {
  readonly id: string;
  readonly kind: WindowKind;
  readonly view: SurfaceView;
  readonly container: HTMLElement;
  readonly stylesLoaded: Promise<void>;
  surface: NativeSurface;
  shown: boolean;
  /** What the native window currently is, so store changes caused by it are not echoed back. */
  nativeHidden: boolean;
  minimized: boolean;
  z: number;
  title: string;
  closeHandler: (() => void) | null;
}

export class NativeWindowManager {
  readonly #deps: NativeWindowManagerDeps;
  readonly #tracked = new Map<string, Tracked>();
  readonly #listeners = new Set<() => void>();
  #entries: readonly NativeWindowEntry[] = [];
  #focusedId: string | null = null;
  /** The window whose native state is being copied into the store right now (no echo back). */
  #echo: string | null = null;
  #unsubscribe: Array<() => void> = [];

  constructor(deps: NativeWindowManagerDeps) {
    this.#deps = deps;
  }

  start(): void {
    if (this.#unsubscribe.length > 0) return;
    const { store, bridge } = this.#deps;
    this.#unsubscribe = [store.subscribe((state) => this.#sync(state)), bridge.onWindowEvent((event) => this.#onNativeEvent(event))];
    this.#sync(store.getState());
  }

  stop(): void {
    for (const unsubscribe of this.#unsubscribe) unsubscribe();
    this.#unsubscribe = [];
    for (const id of [...this.#tracked.keys()]) this.#close(id);
  }

  /** For useSyncExternalStore: the open native windows. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly entries = (): readonly NativeWindowEntry[] => this.#entries;

  #sync(state: AppStoreState): void {
    const open = new Set(state.windows.list.map((w) => w.id));
    let changed = false;
    for (const id of [...this.#tracked.keys()]) {
      if (!open.has(id)) changed = this.#close(id) || changed;
    }
    for (const win of state.windows.list) {
      const tracked = this.#tracked.get(win.id);
      if (tracked) this.#update(tracked, win, state);
      else changed = this.#open(win, state) || changed;
    }
    if (changed) this.#publish();
  }

  #open(win: WindowState, state: AppStoreState): boolean {
    const { kind } = win.spec;
    const natural = sizeOf(kind);
    const min = minSizeOf(kind);
    const resizable = RESIZABLE_KINDS.has(kind);
    const features = encodeWindowFeatures({
      left: Math.round(win.x),
      top: Math.round(win.y),
      width: Math.round(win.width ?? natural.width),
      height: Math.round(win.height ?? natural.height),
      resizable,
      minWidth: resizable ? min.width : 0,
      minHeight: resizable ? min.height : 0,
    });
    const title = windowTitle(win.spec, state);
    const view = this.#deps.open(frameNameFor(win.id), features);
    if (!view) {
      // An error box that cannot open must not report itself again, or it would loop.
      if (kind !== 'error') this.#deps.report(new Error(`openICQ could not open the "${title}" window.`));
      queueMicrotask(() => this.#deps.store.getState().closeWindow(win.id));
      return false;
    }
    const container = this.#prepareDocument(view.document, title);
    const tracked: Tracked = {
      id: win.id,
      kind,
      view,
      container,
      stylesLoaded: this.#copyStylesheets(view.document),
      surface: this.#surface(win.id, view, false),
      shown: false,
      nativeHidden: false,
      minimized: win.minimized,
      z: win.z,
      title,
      closeHandler: null,
    };
    this.#tracked.set(win.id, tracked);
    return true;
  }

  #update(tracked: Tracked, win: WindowState, state: AppStoreState): void {
    const title = windowTitle(win.spec, state);
    if (title !== tracked.title) {
      tracked.title = title;
      tracked.view.document.title = title;
    }
    const raised = win.z > tracked.z;
    const echo = this.#echo === tracked.id;
    tracked.z = win.z;
    if (win.minimized && !tracked.minimized) {
      tracked.minimized = true;
      if (tracked.shown && !tracked.nativeHidden && !echo) this.#hideNative(tracked);
    } else if (!win.minimized && (tracked.minimized || raised)) {
      tracked.minimized = false;
      if (tracked.shown && !echo) this.#showNative(tracked);
    }
  }

  #close(id: string): boolean {
    const tracked = this.#tracked.get(id);
    if (!tracked) return false;
    this.#tracked.delete(id);
    if (this.#focusedId === id) this.#focusedId = null;
    this.#deps.bridge.closeWindow(id);
    return true;
  }

  #showNative(tracked: Tracked): void {
    tracked.nativeHidden = false;
    this.#deps.bridge.showWindow(tracked.id);
  }

  #hideNative(tracked: Tracked): void {
    tracked.nativeHidden = true;
    if (HIDE_TO_TRAY.has(tracked.kind)) this.#deps.bridge.hideWindow(tracked.id);
    else this.#deps.bridge.minimizeWindow(tracked.id);
  }

  #onNativeEvent(event: NativeWindowEvent): void {
    const tracked = this.#tracked.get(event.id);
    if (!tracked) return;
    const state = this.#deps.store.getState();
    switch (event.type) {
      case 'close-requested':
        if (tracked.closeHandler) tracked.closeHandler();
        else state.closeWindow(tracked.id);
        return;
      case 'minimized':
        tracked.nativeHidden = true;
        this.#fromNative(tracked.id, () => state.minimizeWindow(tracked.id));
        return;
      case 'restored':
      case 'focused':
        tracked.nativeHidden = false;
        if (event.type === 'focused') this.#setFocused(tracked.id);
        this.#fromNative(tracked.id, () => state.focusWindow(tracked.id));
        return;
      case 'blurred':
        if (this.#focusedId === tracked.id) this.#setFocused(null);
        return;
      case 'bounds': {
        const { x, y, width, height } = event.bounds;
        state.moveWindow(tracked.id, x, y);
        const resizable = RESIZABLE_KINDS.has(tracked.kind);
        if (resizable) state.resizeWindow(tracked.id, width, height);
        this.#deps.prefs.saveWindowRect(tracked.kind, { x, y, width: resizable ? width : null, height: resizable ? height : null });
        return;
      }
    }
  }

  #fromNative(id: string, change: () => void): void {
    this.#echo = id;
    try {
      change();
    } finally {
      this.#echo = null;
    }
  }

  #setFocused(id: string | null): void {
    if (this.#focusedId === id) return;
    const previous = this.#focusedId;
    this.#focusedId = id;
    for (const changedId of [previous, id]) {
      const tracked = changedId === null ? undefined : this.#tracked.get(changedId);
      if (tracked) tracked.surface = this.#surface(tracked.id, tracked.view, tracked.id === id);
    }
    this.#publish();
  }

  #surface(id: string, view: SurfaceView, active: boolean): NativeSurface {
    return {
      native: true,
      view,
      active,
      fit: (size: ContentSize) => this.#deps.bridge.fitWindow(id, size),
      ready: () => this.#ready(id),
      registerClose: (handler: () => void) => {
        const tracked = this.#tracked.get(id);
        if (tracked) tracked.closeHandler = handler;
        return () => {
          const current = this.#tracked.get(id);
          if (current && current.closeHandler === handler) current.closeHandler = null;
        };
      },
    };
  }

  /** Shows a window once its stylesheets are in, so it never flashes unstyled. */
  #ready(id: string): void {
    const tracked = this.#tracked.get(id);
    if (!tracked || tracked.shown) return;
    tracked.shown = true;
    tracked.stylesLoaded
      .then(() => {
        const current = this.#tracked.get(id);
        if (!current) return;
        if (current.minimized) this.#hideNative(current);
        else this.#showNative(current);
      })
      .catch((error: unknown) => this.#deps.report(error instanceof Error ? error : new Error(String(error))));
  }

  #prepareDocument(doc: Document, title: string): HTMLElement {
    doc.title = title;
    doc.documentElement.lang = 'en';
    doc.documentElement.classList.add('openicq-native');
    const container = doc.createElement('div');
    container.className = 'openicq-native__root';
    doc.body.append(container);
    return container;
  }

  #copyStylesheets(doc: Document): Promise<void> {
    const { hostDocument } = this.#deps;
    const loads: Array<Promise<void>> = [];
    for (const node of hostDocument.querySelectorAll('link[rel="stylesheet"], style')) {
      if (node.tagName === 'STYLE') {
        doc.head.append(doc.importNode(node, true));
        continue;
      }
      const href = node.getAttribute('href');
      if (!href) continue;
      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      // Absolute: the page CSP has base-uri 'none', so the blank document cannot borrow a base URL.
      link.href = new URL(href, hostDocument.baseURI).href;
      loads.push(
        stylesheetLoaded(link).then((loaded) => {
          if (!loaded) this.#deps.report(new Error(`openICQ could not load its styles (${link.href}).`));
        }),
      );
      doc.head.append(link);
    }
    return Promise.all(loads).then(() => undefined);
  }

  #publish(): void {
    this.#entries = [...this.#tracked.values()].map((t) => ({ id: t.id, container: t.container, surface: t.surface }));
    for (const listener of this.#listeners) listener();
  }
}

/** True once the stylesheet loads; false when it fails or stalls (the window then shows anyway). */
function stylesheetLoaded(link: HTMLLinkElement): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), STYLESHEET_TIMEOUT_MS);
    const done = (loaded: boolean) => {
      clearTimeout(timer);
      resolve(loaded);
    };
    link.addEventListener('load', () => done(true), { once: true });
    link.addEventListener('error', () => done(false), { once: true });
  });
}
