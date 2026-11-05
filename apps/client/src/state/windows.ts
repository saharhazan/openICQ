/** Pure window manager state: which ICQ windows are open, where, and in which stacking order. */
import type { Status, StatusMessageStatus, Uin } from '@openicq/protocol';

export type WindowSpec =
  | { kind: 'login' }
  | { kind: 'register' }
  | { kind: 'contactList' }
  | { kind: 'message'; uin: Uin }
  | { kind: 'history'; uin: Uin }
  | { kind: 'userDetails'; uin: Uin }
  | { kind: 'readAway'; uin: Uin }
  | { kind: 'autoResponse'; uin: Uin; status: Status; text: string }
  | { kind: 'awayMessage'; status: StatusMessageStatus }
  | { kind: 'addUser' }
  /** Adding a user (mode add) or re-requesting authorization (mode request); authRequired is fetched when unknown. */
  | { kind: 'authRequest'; uin: Uin; nickname: string; mode: 'add' | 'request'; authRequired?: boolean }
  | { kind: 'notice'; noticeId: number }
  | { kind: 'preferences' }
  | { kind: 'security'; tab: SecurityTab }
  | { kind: 'confirm'; action: ConfirmAction; uin: Uin }
  | { kind: 'kicked' }
  | { kind: 'about' }
  | { kind: 'confirmShutDown' }
  | { kind: 'error'; errorId: number };

export type SecurityTab = 'general' | 'ignore' | 'password';
export type ConfirmAction = 'delete' | 'ignore';

export type WindowKind = WindowSpec['kind'];
export type SpecOf<K extends WindowKind> = Extract<WindowSpec, { kind: K }>;

export interface WindowRect {
  x: number;
  y: number;
  /** Null means "the window's natural size". */
  width: number | null;
  height: number | null;
}

export interface WindowState extends WindowRect {
  id: string;
  spec: WindowSpec;
  z: number;
  minimized: boolean;
}

export interface WindowsState {
  list: WindowState[];
  nextZ: number;
}

export const initialWindowsState: WindowsState = { list: [], nextZ: 1 };

/** One window per spec identity: opening the same dialog again focuses it instead. */
export function windowId(spec: WindowSpec): string {
  switch (spec.kind) {
    case 'message':
    case 'history':
    case 'userDetails':
    case 'readAway':
    case 'autoResponse':
    case 'authRequest':
      return `${spec.kind}:${spec.uin}`;
    case 'confirm':
      return `confirm:${spec.action}:${spec.uin}`;
    case 'awayMessage':
      return spec.kind;
    case 'notice':
      return `notice:${spec.noticeId}`;
    case 'error':
      return `error:${spec.errorId}`;
    default:
      return spec.kind;
  }
}

export function findWindow(state: WindowsState, id: string): WindowState | undefined {
  return state.list.find((w) => w.id === id);
}

/** The window that has the keyboard focus: the top-most one that is not minimized. */
export function activeWindowId(state: WindowsState): string | null {
  let top: WindowState | null = null;
  for (const w of state.list) {
    if (!w.minimized && (top === null || w.z > top.z)) top = w;
  }
  return top ? top.id : null;
}

function update(state: WindowsState, id: string, change: (w: WindowState) => WindowState): WindowsState {
  if (!findWindow(state, id)) return state;
  return { ...state, list: state.list.map((w) => (w.id === id ? change(w) : w)) };
}

export function openWindow(state: WindowsState, spec: WindowSpec, rect: WindowRect): WindowsState {
  const id = windowId(spec);
  if (findWindow(state, id)) {
    const focused = focusWindow(state, id);
    return update(focused, id, (w) => ({ ...w, spec }));
  }
  const window: WindowState = { id, spec, ...rect, z: state.nextZ, minimized: false };
  return { list: [...state.list, window], nextZ: state.nextZ + 1 };
}

export function closeWindow(state: WindowsState, id: string): WindowsState {
  if (!findWindow(state, id)) return state;
  return { ...state, list: state.list.filter((w) => w.id !== id) };
}

export function closeWindowsWhere(state: WindowsState, predicate: (w: WindowState) => boolean): WindowsState {
  const list = state.list.filter((w) => !predicate(w));
  return list.length === state.list.length ? state : { ...state, list };
}

export function focusWindow(state: WindowsState, id: string): WindowsState {
  const target = findWindow(state, id);
  if (!target) return state;
  if (!target.minimized && activeWindowId(state) === id) return state;
  const next = update(state, id, (w) => ({ ...w, z: state.nextZ, minimized: false }));
  return { ...next, nextZ: state.nextZ + 1 };
}

export function minimizeWindow(state: WindowsState, id: string): WindowsState {
  return update(state, id, (w) => ({ ...w, minimized: true }));
}

export function moveWindow(state: WindowsState, id: string, x: number, y: number): WindowsState {
  return update(state, id, (w) => (w.x === x && w.y === y ? w : { ...w, x, y }));
}

export function resizeWindow(state: WindowsState, id: string, width: number, height: number): WindowsState {
  return update(state, id, (w) => ({ ...w, width, height }));
}
