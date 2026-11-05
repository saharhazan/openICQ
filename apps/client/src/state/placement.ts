/** Where a newly opened window appears: the saved spot for its kind, or a cascade default. */
import type { WindowKind, WindowRect, WindowSpec, WindowsState } from './windows';

export interface Viewport {
  width: number;
  height: number;
}

export interface PlacementSource {
  viewport(): Viewport;
  /** A position remembered from an earlier session (per-browser convenience). */
  saved(kind: WindowKind): WindowRect | null;
}

/** Natural sizes in px, used only to keep a new window on screen. */
const APPROX_SIZE: Partial<Record<WindowKind, { width: number; height: number }>> = {
  login: { width: 300, height: 230 },
  register: { width: 470, height: 360 },
  contactList: { width: 190, height: 450 },
  message: { width: 400, height: 400 },
  history: { width: 460, height: 380 },
  userDetails: { width: 430, height: 400 },
  addUser: { width: 480, height: 400 },
  preferences: { width: 480, height: 420 },
};
const DEFAULT_SIZE = { width: 340, height: 220 };
const TASKBAR_HEIGHT = 28;

/** Kinds whose size the user can change; their rect keeps width and height. */
export const RESIZABLE_KINDS: ReadonlySet<WindowKind> = new Set(['contactList', 'message', 'history']);

/** The smallest size a resizable window may be dragged to (the original dialog limits). */
const MIN_SIZE: Partial<Record<WindowKind, { width: number; height: number }>> = {
  contactList: { width: 150, height: 240 },
  message: { width: 320, height: 300 },
  history: { width: 420, height: 300 },
};
const DEFAULT_MIN_SIZE = { width: 160, height: 120 };

export function minSizeOf(kind: WindowKind): { width: number; height: number } {
  return MIN_SIZE[kind] ?? DEFAULT_MIN_SIZE;
}

export function sizeOf(kind: WindowKind): { width: number; height: number } {
  return APPROX_SIZE[kind] ?? DEFAULT_SIZE;
}

export function clampToViewport(rect: WindowRect, kind: WindowKind, viewport: Viewport): WindowRect {
  const size = sizeOf(kind);
  const width = rect.width ?? size.width;
  const maxX = Math.max(0, viewport.width - Math.min(width, viewport.width));
  const maxY = Math.max(0, viewport.height - TASKBAR_HEIGHT - 24);
  return { ...rect, x: Math.min(Math.max(0, rect.x), maxX), y: Math.min(Math.max(0, rect.y), maxY) };
}

export function placeWindow(spec: WindowSpec, windows: WindowsState, source: PlacementSource): WindowRect {
  const viewport = source.viewport();
  const saved = source.saved(spec.kind);
  if (saved) return clampToViewport(saved, spec.kind, viewport);
  const size = sizeOf(spec.kind);
  if (spec.kind === 'contactList') {
    return clampToViewport(
      { x: viewport.width - size.width - 24, y: 24, width: size.width, height: size.height },
      spec.kind,
      viewport,
    );
  }
  const cascade = (windows.list.length % 8) * 24;
  const x = Math.round((viewport.width - size.width) / 2) - 120 + cascade;
  const y = Math.round((viewport.height - TASKBAR_HEIGHT - size.height) / 2) - 60 + cascade;
  const resizable = RESIZABLE_KINDS.has(spec.kind);
  return clampToViewport(
    { x, y, width: resizable ? size.width : null, height: resizable ? size.height : null },
    spec.kind,
    viewport,
  );
}
