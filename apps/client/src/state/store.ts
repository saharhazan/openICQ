/**
 * The one client store. Slices: session/connection, chat (contacts,
 * conversations, notices), windows and errors. Preferences live inside
 * `settings`, exactly as the server sends them.
 */
import type { Profile, ServerEvent, SessionInfo, SessionSnapshot, Settings, Status } from '@openicq/protocol';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ConnectionState } from '../net/IcqConnection';
import { type ClientErrorCode, toIcqError } from '../net/errors';
import { allContactsOffline, applyServerEvent, applySnapshot, type ChatState, initialChatState } from './chat';
import { placeWindow, type PlacementSource } from './placement';
import {
  closeWindow,
  closeWindowsWhere,
  focusWindow,
  initialWindowsState,
  minimizeWindow,
  moveWindow,
  openWindow,
  resizeWindow,
  windowId,
  type WindowRect,
  type WindowSpec,
  type WindowState,
  type WindowsState,
} from './windows';

export interface ErrorEntry {
  id: number;
  title: string;
  message: string;
  code: ClientErrorCode;
  at: number;
  dismissed: boolean;
}

export interface AppState {
  chat: ChatState;
  /** The signed-in account (REST session). Null on the login screen. */
  session: SessionInfo | null;
  /** True while the saved session is checked at start-up. */
  booting: boolean;
  connection: ConnectionState;
  /** Own status as confirmed by the server; `offline` while disconnected. */
  status: Status;
  /** True while a status change is on its way (the flower spins). */
  statusPending: boolean;
  self: Profile | null;
  settings: Settings | null;
  windows: WindowsState;
  errors: ErrorEntry[];
}

export interface AppActions {
  applyEvent(event: ServerEvent): void;
  applySnapshot(snapshot: SessionSnapshot): void;
  updateChat(change: (chat: ChatState) => ChatState): void;
  setBooting(booting: boolean): void;
  setSession(session: SessionInfo | null): void;
  setConnection(connection: ConnectionState): void;
  setStatus(status: Status): void;
  setStatusPending(pending: boolean): void;
  setSelf(self: Profile): void;
  setSettings(settings: Settings): void;
  goneOffline(): void;
  signedOut(): void;
  openWindow(spec: WindowSpec): string;
  closeWindow(id: string): void;
  closeWindowsWhere(predicate: (w: WindowState) => boolean): void;
  focusWindow(id: string): void;
  minimizeWindow(id: string): void;
  moveWindow(id: string, x: number, y: number): void;
  resizeWindow(id: string, width: number, height: number): void;
  /** Records a failure and opens an error dialog for it. Returns the error id. */
  reportError(error: unknown, title?: string): number;
  dismissError(id: number): void;
}

export type AppStoreState = AppState & AppActions;
export type AppStore = StoreApi<AppStoreState>;

const MAX_ERRORS = 50;

export const initialAppState: AppState = {
  chat: initialChatState,
  session: null,
  booting: true,
  connection: 'idle',
  status: 'offline',
  statusPending: false,
  self: null,
  settings: null,
  windows: initialWindowsState,
  errors: [],
};

const fallbackPlacement: PlacementSource = {
  viewport: () => ({ width: globalThis.innerWidth || 1024, height: globalThis.innerHeight || 768 }),
  saved: () => null,
};

export function createAppStore(placement: PlacementSource = fallbackPlacement, now: () => number = Date.now): AppStore {
  let nextErrorId = 1;
  return createStore<AppStoreState>()((set, get) => {
    const setWindows = (change: (w: WindowsState) => WindowsState) => set((s) => ({ windows: change(s.windows) }));
    return {
      ...initialAppState,
      applyEvent: (event) => set((s) => ({ chat: applyServerEvent(s.chat, event) })),
      applySnapshot: (snapshot) =>
        set((s) => ({
          chat: applySnapshot(s.chat, snapshot),
          self: snapshot.self,
          settings: snapshot.settings,
          status: snapshot.status,
          session: s.session ? { ...s.session, nickname: snapshot.self.nickname } : s.session,
        })),
      updateChat: (change) => set((s) => ({ chat: change(s.chat) })),
      setBooting: (booting) => set({ booting }),
      setSession: (session) => set({ session }),
      setConnection: (connection) => set({ connection }),
      setStatus: (status) => set({ status }),
      setStatusPending: (statusPending) => set({ statusPending }),
      setSelf: (self) =>
        set((s) => ({ self, session: s.session ? { ...s.session, nickname: self.nickname } : s.session })),
      setSettings: (settings) => set({ settings }),
      goneOffline: () => set((s) => ({ status: 'offline', statusPending: false, chat: allContactsOffline(s.chat) })),
      signedOut: () =>
        set((s) => ({
          ...initialAppState,
          booting: false,
          errors: s.errors,
          windows: closeWindowsWhere(s.windows, (w) => w.spec.kind !== 'error' && w.spec.kind !== 'kicked'),
        })),
      openWindow: (spec) => {
        const id = windowId(spec);
        setWindows((w) => {
          const rect: WindowRect = placeWindow(spec, w, placement);
          return openWindow(w, spec, rect);
        });
        return id;
      },
      closeWindow: (id) => setWindows((w) => closeWindow(w, id)),
      closeWindowsWhere: (predicate) => setWindows((w) => closeWindowsWhere(w, predicate)),
      focusWindow: (id) => setWindows((w) => focusWindow(w, id)),
      minimizeWindow: (id) => setWindows((w) => minimizeWindow(w, id)),
      moveWindow: (id, x, y) => setWindows((w) => moveWindow(w, id, x, y)),
      resizeWindow: (id, width, height) => setWindows((w) => resizeWindow(w, id, width, height)),
      reportError: (error, title = 'openICQ') => {
        const failure = toIcqError(error);
        const id = nextErrorId++;
        const entry: ErrorEntry = { id, title, message: failure.message, code: failure.code, at: now(), dismissed: false };
        set((s) => ({ errors: [...s.errors, entry].slice(-MAX_ERRORS) }));
        get().openWindow({ kind: 'error', errorId: id });
        return id;
      },
      dismissError: (id) =>
        set((s) => ({
          errors: s.errors.map((e) => (e.id === id ? { ...e, dismissed: true } : e)),
          windows: closeWindow(s.windows, windowId({ kind: 'error', errorId: id })),
        })),
    };
  });
}
