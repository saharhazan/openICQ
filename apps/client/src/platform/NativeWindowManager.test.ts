import { frameNameFor, parseWindowFeatures, type DesktopBridge, type NativeWindowEvent } from '@openicq/desktop-bridge';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { LocalPrefs } from '../app/LocalPrefs';
import { createAppStore, type AppStore } from '../state/store';
import { NativeWindowManager } from './NativeWindowManager';
import type { SurfaceView } from './WindowSurface';

function fakeBridge() {
  let emit: (event: NativeWindowEvent) => void = () => undefined;
  const bridge = {
    platform: 'darwin',
    showWindow: vi.fn(),
    minimizeWindow: vi.fn(),
    hideWindow: vi.fn(),
    closeWindow: vi.fn(),
    fitWindow: vi.fn(),
    updateTray: vi.fn(),
    requestAttention: vi.fn(),
    systemIdleSeconds: vi.fn(async () => 0),
    openConnectionSettings: vi.fn(),
    quit: vi.fn(),
    onWindowEvent: vi.fn((listener: (event: NativeWindowEvent) => void) => {
      emit = listener;
      return () => undefined;
    }),
    onTrayCommand: vi.fn(() => () => undefined),
  } satisfies DesktopBridge;
  return { bridge, emit: (event: NativeWindowEvent) => emit(event) };
}

interface Opened {
  frameName: string;
  features: string;
  doc: Document;
}

let store: AppStore;
let opened: Opened[];
let saveWindowRect: Mock<LocalPrefs['saveWindowRect']>;
let report: Mock<(error: Error) => void>;
let fake: ReturnType<typeof fakeBridge>;
let manager: NativeWindowManager;
let failOpen: boolean;

beforeEach(() => {
  document.head.innerHTML = '<link rel="stylesheet" href="/assets/app.css"><style>.x{color:red}</style>';
  store = createAppStore({ viewport: () => ({ width: 1440, height: 900 }), saved: () => null });
  opened = [];
  failOpen = false;
  saveWindowRect = vi.fn<LocalPrefs['saveWindowRect']>();
  report = vi.fn<(error: Error) => void>();
  fake = fakeBridge();
  manager = new NativeWindowManager({
    store,
    bridge: fake.bridge,
    prefs: { saveWindowRect },
    hostDocument: document,
    open: (frameName, features) => {
      if (failOpen) return null;
      const doc = document.implementation.createHTMLDocument('');
      opened.push({ frameName, features, doc });
      // A stand-in for the window object: the manager only needs its document.
      return { document: doc } as unknown as SurfaceView;
    },
    report,
  });
  manager.start();
});

afterEach(() => {
  manager.stop();
});

function openedDoc(index: number): Document {
  const win = opened[index];
  if (!win) throw new Error(`no native window #${index}`);
  return win.doc;
}

/** Lets the copied stylesheet "load", then the queued show runs. */
async function loadStyles(doc: Document) {
  doc.querySelector('link')?.dispatchEvent(new Event('load'));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('NativeWindowManager', () => {
  it('opens one native window per store window, with its size, title and the page stylesheets', () => {
    store.getState().openWindow({ kind: 'contactList' });
    expect(opened).toHaveLength(1);
    const [win] = opened;
    expect(win?.frameName).toBe(frameNameFor('contactList'));
    expect(parseWindowFeatures(win?.features ?? '')).toMatchObject({ width: 190, height: 450, resizable: true, minWidth: 150, minHeight: 240 });
    expect(win?.doc.title).toBe('openICQ');
    expect(win?.doc.querySelector('link')?.getAttribute('href')).toBe('http://localhost:3000/assets/app.css');
    expect(win?.doc.querySelector('style')?.textContent).toBe('.x{color:red}');
    expect(manager.entries().map((e) => e.id)).toEqual(['contactList']);
  });

  it('shows a window only after it rendered and its stylesheets loaded', async () => {
    store.getState().openWindow({ kind: 'about' });
    const entry = manager.entries()[0];
    expect(fake.bridge.showWindow).not.toHaveBeenCalled();
    entry?.surface.ready();
    await Promise.resolve();
    expect(fake.bridge.showWindow).not.toHaveBeenCalled();
    await loadStyles(openedDoc(0));
    expect(fake.bridge.showWindow).toHaveBeenCalledWith('about');
  });

  it('closes the native window when the store closes it', () => {
    store.getState().openWindow({ kind: 'about' });
    store.getState().closeWindow('about');
    expect(fake.bridge.closeWindow).toHaveBeenCalledWith('about');
    expect(manager.entries()).toEqual([]);
  });

  it('hides the Contact List to the tray but minimizes other windows, and raises them again', async () => {
    const state = store.getState();
    state.openWindow({ kind: 'contactList' });
    state.openWindow({ kind: 'message', uin: 100002 });
    for (const entry of manager.entries()) entry.surface.ready();
    for (const win of opened) await loadStyles(win.doc);
    fake.bridge.showWindow.mockClear();

    state.minimizeWindow('contactList');
    state.minimizeWindow('message:100002');
    expect(fake.bridge.hideWindow).toHaveBeenCalledWith('contactList');
    expect(fake.bridge.minimizeWindow).toHaveBeenCalledWith('message:100002');

    state.openWindow({ kind: 'contactList' });
    expect(fake.bridge.showWindow).toHaveBeenCalledWith('contactList');
  });

  it('copies native minimize and focus into the store without echoing them back', async () => {
    store.getState().openWindow({ kind: 'message', uin: 100002 });
    manager.entries()[0]?.surface.ready();
    await loadStyles(openedDoc(0));
    fake.bridge.showWindow.mockClear();

    fake.emit({ type: 'minimized', id: 'message:100002' });
    expect(store.getState().windows.list[0]?.minimized).toBe(true);
    expect(fake.bridge.minimizeWindow).not.toHaveBeenCalled();

    fake.emit({ type: 'focused', id: 'message:100002' });
    expect(store.getState().windows.list[0]?.minimized).toBe(false);
    expect(fake.bridge.showWindow).not.toHaveBeenCalled();
    expect(manager.entries()[0]?.surface.active).toBe(true);

    fake.emit({ type: 'blurred', id: 'message:100002' });
    expect(manager.entries()[0]?.surface.active).toBe(false);
  });

  it('stores moves and resizes, and remembers them for the window kind', () => {
    store.getState().openWindow({ kind: 'contactList' });
    fake.emit({ type: 'bounds', id: 'contactList', bounds: { x: 1200, y: 40, width: 200, height: 500 } });
    expect(store.getState().windows.list[0]).toMatchObject({ x: 1200, y: 40, width: 200, height: 500 });
    expect(saveWindowRect).toHaveBeenCalledWith('contactList', { x: 1200, y: 40, width: 200, height: 500 });

    store.getState().openWindow({ kind: 'about' });
    fake.emit({ type: 'bounds', id: 'about', bounds: { x: 10, y: 20, width: 300, height: 200 } });
    expect(saveWindowRect).toHaveBeenLastCalledWith('about', { x: 10, y: 20, width: null, height: null });
  });

  it('routes an OS close to the window close handler, or closes the window', () => {
    store.getState().openWindow({ kind: 'contactList' });
    store.getState().openWindow({ kind: 'about' });
    const handler = vi.fn();
    const unregister = manager.entries().find((e) => e.id === 'contactList')?.surface.registerClose(handler);

    fake.emit({ type: 'close-requested', id: 'contactList' });
    expect(handler).toHaveBeenCalledOnce();
    fake.emit({ type: 'close-requested', id: 'about' });
    expect(store.getState().windows.list.map((w) => w.id)).toEqual(['contactList']);

    unregister?.();
    fake.emit({ type: 'close-requested', id: 'contactList' });
    expect(store.getState().windows.list).toEqual([]);
  });

  it('reports a window that cannot open and drops it from the store', async () => {
    failOpen = true;
    store.getState().openWindow({ kind: 'about' });
    await Promise.resolve();
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'openICQ could not open the "About openICQ" window.' }));
    expect(store.getState().windows.list.find((w) => w.id === 'about')).toBeUndefined();
  });

  it('follows the store title of each window', () => {
    store.getState().openWindow({ kind: 'contactList' });
    store.getState().setSession({ uin: 100001, nickname: 'Me' });
    expect(opened[0]?.doc.title).toBe('100001');
  });
});
