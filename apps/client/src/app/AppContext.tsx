import { createContext, useContext, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { AppStoreState } from '../state/store';
import type { Services } from './services';

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices must be used inside <ServicesProvider>');
  return services;
}

/** Subscribes a component to a slice of the store. */
export function useIcq<T>(selector: (state: AppStoreState) => T): T {
  return useStore(useServices().store, selector);
}
