import { useEffect } from 'react';
import { useApp, useServices, ServicesProvider } from './app/AppContext';
import { fontDelta } from './app/devicePrefs';
import { joinTokenFromHash } from './app/GroupCommands';
import type { Services } from './app/services';
import { AuthScreen } from './features/auth/AuthScreen';
import { IntroduceYourself } from './features/auth/IntroduceYourself';
import { DialogHost } from './features/DialogHost';
import { MainLayout } from './features/layout/MainLayout';
import { Toasts } from './ui/controls';

/** Applies the theme and font size of Appearance to the whole document. */
function useDocumentPrefs() {
  const theme = useApp((s) => s.prefs.theme);
  const fontSize = useApp((s) => s.prefs.fontSize);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    document.documentElement.style.setProperty('--fs', `${fontDelta(fontSize)}px`);
  }, [fontSize]);
}

/** #/join/<token> opens the join preview once the main window is up. */
function useJoinLinks() {
  const { store } = useServices();
  const phase = useApp((s) => s.phase);
  const pending = useApp((s) => s.pendingJoin);
  useEffect(() => {
    const read = () => {
      const token = joinTokenFromHash(window.location.hash);
      if (!token) return;
      store.getState().patch({ pendingJoin: token });
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [store]);
  useEffect(() => {
    if (phase !== 'main' || pending === null) return;
    const state = store.getState();
    state.patch({ pendingJoin: null });
    state.openDialog({ kind: 'join', token: pending });
  }, [phase, pending, store]);
}

function Screens() {
  const { session, store } = useServices();
  const phase = useApp((s) => s.phase);
  useDocumentPrefs();
  useJoinLinks();
  useEffect(() => {
    session.boot().catch((error: unknown) => store.getState().reportError(error));
  }, [session, store]);
  return (
    <>
      {phase === 'booting' && <div className="app-splash" aria-busy="true" />}
      {phase === 'auth' && <AuthScreen />}
      {phase === 'introduce' && <IntroduceYourself />}
      {phase === 'main' && <MainLayout />}
      {phase === 'main' && <DialogHost />}
      <Toasts />
    </>
  );
}

export function App({ services }: { services: Services }) {
  return (
    <ServicesProvider services={services}>
      <Screens />
    </ServicesProvider>
  );
}
