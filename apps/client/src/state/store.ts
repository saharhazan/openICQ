/**
 * The one client store: the server data (pure reducers in data.ts) and the
 * interface state (tab, open chat, sidebar, dialogs, composer, toasts).
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { DEFAULT_PREFS, type DevicePrefs } from '../app/devicePrefs';
import type { ConnectionState } from '../net/IcqConnection';
import { toIcqError } from '../net/errors';
import type { Id, Message, Uin } from './protocolTypes';
import { initialDataState, type DataState } from './types';

export type Phase = 'booting' | 'auth' | 'introduce' | 'main';
export type Tab = 'contacts' | 'chats' | 'settings';
export type SettingsPage = 'profile' | 'general' | 'notifications' | 'privacy' | 'appearance' | 'shortcuts' | 'about';
export type Sidebar = { kind: 'user'; uin: Uin } | { kind: 'group'; chatId: Id } | null;

export interface ConfirmSpec {
  title: string;
  text: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export type DialogSpec =
  | { kind: 'confirm'; spec: ConfirmSpec }
  | { kind: 'addContact' }
  | { kind: 'createGroup' }
  | { kind: 'addMembers'; chatId: Id }
  | { kind: 'forward'; fromChatId: Id; messageIds: Id[] }
  | { kind: 'deleteMessages'; chatId: Id; messageIds: Id[] }
  | { kind: 'image'; fileId: Id; name: string }
  | { kind: 'sendFiles'; chatId: Id; files: File[] }
  | { kind: 'join'; token: string };

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

export interface Composer {
  replyTo: Message | null;
  editing: Message | null;
}

export interface UiState {
  phase: Phase;
  connection: ConnectionState;
  tab: Tab;
  selectedChatId: Id | null;
  sidebar: Sidebar;
  settingsPage: SettingsPage | null;
  dialog: DialogSpec | null;
  toasts: Toast[];
  composer: Readonly<Record<number, Composer>>;
  /** Multi-select mode in the open chat. */
  selection: { chatId: Id; ids: Id[] } | null;
  drafts: Readonly<Record<number, string>>;
  prefs: DevicePrefs;
  /** Where the "New messages" plate of the open chat goes (frozen when the chat opened). */
  newPlate: { chatId: Id; afterId: number } | null;
  searchQuery: string;
  /** Under 660 px the left column shows avatars only; this opens it as an overlay. */
  columnSpread: boolean;
  /** An invite link (#/join/<token>) waiting for the main window. */
  pendingJoin: string | null;
}

export interface AppState extends UiState {
  data: DataState;
}

export interface AppActions {
  updateData(change: (data: DataState) => DataState): void;
  patch(change: Partial<UiState> | ((state: AppState) => Partial<UiState>)): void;
  openChat(chatId: Id | null): void;
  setComposer(chatId: Id, patch: Partial<Composer>): void;
  setDraft(chatId: Id, text: string): void;
  setPrefs(patch: Partial<DevicePrefs>): void;
  openDialog(dialog: DialogSpec): void;
  closeDialog(): void;
  confirm(spec: ConfirmSpec): void;
  toast(text: string, tone?: Toast['tone']): void;
  dismissToast(id: number): void;
  /** Shows a failure plainly as an error toast; never swallowed. */
  reportError(error: unknown): void;
  /** Back to the sign-in screen with empty data; device settings stay, drafts belong to the account. */
  signedOut(): void;
}

export type AppStoreState = AppState & AppActions;
export type AppStore = StoreApi<AppStoreState>;

const MAX_TOASTS = 4;
const emptyComposer: Composer = { replyTo: null, editing: null };

export function initialUiState(prefs: DevicePrefs = DEFAULT_PREFS, drafts: Record<number, string> = {}): UiState {
  return {
    phase: 'booting',
    connection: 'idle',
    tab: 'chats',
    selectedChatId: null,
    sidebar: null,
    settingsPage: null,
    dialog: null,
    toasts: [],
    composer: {},
    selection: null,
    drafts,
    prefs,
    newPlate: null,
    searchQuery: '',
    columnSpread: false,
    pendingJoin: null,
  };
}

/** The chat page of this chat is on screen (the Settings tab replaces it while a settings page is open). */
export function isChatOnScreen(state: Pick<UiState, 'phase' | 'selectedChatId' | 'tab' | 'settingsPage'>, chatId: Id): boolean {
  return state.phase === 'main' && state.selectedChatId === chatId && !(state.tab === 'settings' && state.settingsPage !== null);
}

export function composerOf(state: Pick<UiState, 'composer'>, chatId: Id): Composer {
  return state.composer[chatId] ?? emptyComposer;
}

export function createAppStore(initial: Partial<UiState> = {}): AppStore {
  let nextToast = 1;
  return createStore<AppStoreState>()((set, get) => ({
    ...initialUiState(),
    ...initial,
    data: initialDataState,
    updateData: (change) => set((s) => ({ data: change(s.data) })),
    patch: (change) => set((s) => (typeof change === 'function' ? change(s) : change)),
    openChat: (chatId) =>
      set((s) => {
        if (chatId === null) return { selectedChatId: null, selection: null, newPlate: null };
        const chat = s.data.chats[chatId];
        const unread = chat !== undefined && chat.unread > 0;
        return {
          selectedChatId: chatId,
          selection: s.selection?.chatId === chatId ? s.selection : null,
          newPlate: s.selectedChatId === chatId ? s.newPlate : unread && chat ? { chatId, afterId: chat.lastReadId } : null,
          sidebar: s.selectedChatId === chatId ? s.sidebar : null,
          columnSpread: false,
          tab: s.tab === 'settings' ? 'chats' : s.tab,
          settingsPage: null,
        };
      }),
    setComposer: (chatId, change) =>
      set((s) => ({ composer: { ...s.composer, [chatId]: { ...composerOf(s, chatId), ...change } } })),
    setDraft: (chatId, text) =>
      set((s) => {
        if ((s.drafts[chatId] ?? '') === text) return {};
        const others = Object.entries(s.drafts).filter(([id]) => Number(id) !== chatId);
        return { drafts: Object.fromEntries(text === '' ? others : [...others, [String(chatId), text]]) };
      }),
    setPrefs: (change) => set((s) => ({ prefs: { ...s.prefs, ...change } })),
    openDialog: (dialog) => set({ dialog }),
    closeDialog: () => set({ dialog: null }),
    confirm: (spec) => set({ dialog: { kind: 'confirm', spec } }),
    toast: (text, tone = 'info') => {
      const id = nextToast++;
      set((s) => ({ toasts: [...s.toasts, { id, text, tone }].slice(-MAX_TOASTS) }));
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    reportError: (error) => get().toast(toIcqError(error).message, 'error'),
    signedOut: () =>
      set((s) => ({
        ...initialUiState(s.prefs),
        phase: 'auth',
        toasts: s.toasts,
        pendingJoin: s.pendingJoin,
        data: initialDataState,
      })),
  }));
}
