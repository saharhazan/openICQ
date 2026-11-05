import { useEffect } from 'react';
import { ServicesProvider } from './app/AppContext';
import type { Services } from './app/services';
import { STRINGS } from './features/strings';
import { NativeDesktop } from './platform/NativeDesktop';
import { Desktop } from './ui/Desktop';

export function App({ services }: { services: Services }) {
  useEffect(() => {
    services.session.boot().catch((error: unknown) => services.store.getState().reportError(error, STRINGS.appName));
  }, [services]);
  return (
    <ServicesProvider services={services}>
      {services.desktop ? <NativeDesktop manager={services.desktop.windows} /> : <Desktop />}
    </ServicesProvider>
  );
}
