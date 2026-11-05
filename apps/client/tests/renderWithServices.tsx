import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { ServicesProvider } from '../src/app/AppContext';
import type { Services } from '../src/app/services';
import { createAppStore } from '../src/state/store';

/** A real store with mocked server-facing services (London-school: mock at the boundary). */
export function makeServices() {
  const store = createAppStore({ viewport: () => ({ width: 1280, height: 800 }), saved: () => null });
  const commands = {
    sendMessage: vi.fn(),
    loadHistory: vi.fn().mockResolvedValue(true),
    getProfile: vi.fn().mockResolvedValue(null),
  };
  const session = {
    markRead: vi.fn().mockResolvedValue(undefined),
    login: vi.fn(),
    setStatus: vi.fn().mockResolvedValue(true),
  };
  const prefs = { recentUins: vi.fn().mockReturnValue([]), saveWindowRect: vi.fn(), rememberUin: vi.fn() };
  // Only the members the components under test call are provided.
  const services = { store, commands, session, prefs } as unknown as Services;
  return { services, store, commands, session, prefs };
}

export function renderWithServices(ui: ReactElement, services: Services) {
  return render(<ServicesProvider services={services}>{ui}</ServicesProvider>);
}
