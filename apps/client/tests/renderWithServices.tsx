import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { ServicesProvider } from '../src/app/AppContext';
import type { Services } from '../src/app/services';
import { applySnapshot } from '../src/state/data';
import { createAppStore } from '../src/state/store';
import { snapshot } from './fixtures';
import type { SessionSnapshot } from '@openicq/protocol';

/** A real store with mocked server-facing services (London school: mock at the boundary). */
export function makeServices(initial?: Partial<SessionSnapshot>) {
  const store = createAppStore({ phase: 'main' });
  if (initial) store.getState().updateData((data) => applySnapshot(data, snapshot(initial)));
  const chats = {
    loadHistory: vi.fn().mockResolvedValue(true),
    reloadOpenChat: vi.fn(),
    openDirect: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn().mockResolvedValue(undefined),
    edit: vi.fn().mockResolvedValue(true),
    deleteMessages: vi.fn().mockResolvedValue(undefined),
    react: vi.fn().mockResolvedValue(undefined),
    forward: vi.fn().mockResolvedValue(true),
    markRead: vi.fn().mockResolvedValue(undefined),
    markUnread: vi.fn().mockResolvedValue(undefined),
    readAll: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    block: vi.fn().mockResolvedValue(undefined),
    typing: vi.fn(),
  };
  const account = {
    search: vi.fn().mockResolvedValue([]),
    getUser: vi.fn().mockResolvedValue(null),
    addContact: vi.fn().mockResolvedValue(null),
    removeContact: vi.fn().mockResolvedValue(true),
    updateProfile: vi.fn().mockResolvedValue(true),
    uploadAvatar: vi.fn().mockResolvedValue(null),
    checkNickname: vi.fn().mockResolvedValue('available'),
    changePassword: vi.fn().mockResolvedValue('ok'),
    setGroupInvites: vi.fn().mockResolvedValue(true),
    listSessions: vi.fn().mockResolvedValue([]),
    closeSession: vi.fn().mockResolvedValue(true),
  };
  const groups = {
    create: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(true),
    members: vi.fn().mockResolvedValue([]),
    addMembers: vi.fn().mockResolvedValue({ added: [], refused: [] }),
    removeMember: vi.fn().mockResolvedValue(true),
    setRole: vi.fn().mockResolvedValue(true),
    regenerateLink: vi.fn().mockResolvedValue('newtoken123'),
    preview: vi.fn().mockResolvedValue(null),
    join: vi.fn().mockResolvedValue(null),
    requests: vi.fn().mockResolvedValue([]),
    resolveRequest: vi.fn().mockResolvedValue(true),
  };
  const session = {
    boot: vi.fn().mockResolvedValue(undefined),
    signIn: vi.fn().mockResolvedValue({ ok: true }),
    signUp: vi.fn().mockResolvedValue({ ok: true, uin: 100500 }),
    enterAfterSignUp: vi.fn().mockResolvedValue({ ok: true }),
    finishIntroduce: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
  };
  const notifier = {
    requestPermission: vi.fn().mockResolvedValue('granted'),
    permission: vi.fn().mockReturnValue('granted'),
  };
  const api = { fileUrl: (id: number) => `/api/files/${id}` };
  // Only the members the components under test call are provided.
  const services = { store, chats, account, groups, session, notifier, api, bridge: null } as unknown as Services;
  return { services, store, chats, account, groups, session, notifier };
}

export function renderWithServices(ui: ReactElement, services: Services) {
  return render(<ServicesProvider services={services}>{ui}</ServicesProvider>);
}
