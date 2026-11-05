import { Fragment, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useIcq } from '../app/AppContext';
import { renderWindow } from '../features/WindowHost';
import type { NativeWindowManager } from './NativeWindowManager';
import { WindowSurfaceProvider } from './WindowSurface';
import './native.css';

/** Desktop app: every ICQ window rendered into its own native window. The host page itself stays hidden. */
export function NativeDesktop({ manager }: { manager: NativeWindowManager }) {
  const entries = useSyncExternalStore(manager.subscribe, manager.entries);
  const windows = useIcq((s) => s.windows.list);
  return (
    <>
      {entries.map((entry) => {
        const win = windows.find((w) => w.id === entry.id);
        if (!win) return null;
        return (
          <Fragment key={entry.id}>
            {createPortal(<WindowSurfaceProvider value={entry.surface}>{renderWindow(win)}</WindowSurfaceProvider>, entry.container)}
          </Fragment>
        );
      })}
    </>
  );
}
