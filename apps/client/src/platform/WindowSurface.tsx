/**
 * Where an ICQ window lives. In the browser every window shares the page
 * (the in-page Windows desktop); in the desktop app each one is a native window
 * with its own document, so DOM listeners, portals and `instanceof` checks must
 * use the window the component is rendered in, not the global one.
 */
import { createContext, useContext } from 'react';
import type { ContentSize } from '@openicq/desktop-bridge';

/** A same-origin window: its own globals (ResizeObserver, Node, ...) belong to its document. */
export type SurfaceView = Window & typeof globalThis;

export interface PageSurface {
  readonly native: false;
  readonly view: SurfaceView;
}

export interface NativeSurface {
  readonly native: true;
  readonly view: SurfaceView;
  /** True while this native window has the keyboard focus. */
  readonly active: boolean;
  /** Content-sized windows report their natural size. */
  fit(size: ContentSize): void;
  /** The frame has rendered: the window may be shown. */
  ready(): void;
  /** The handler for a close from the OS (Alt+F4, Cmd+W); it does what the title-bar X does. */
  registerClose(handler: () => void): () => void;
}

export type WindowSurface = PageSurface | NativeSurface;

const SurfaceContext = createContext<WindowSurface>({ native: false, view: window });

export const WindowSurfaceProvider = SurfaceContext.Provider;

export function useWindowSurface(): WindowSurface {
  return useContext(SurfaceContext);
}
