import { Fragment } from 'react';
import { useIcq } from '../app/AppContext';
import { renderWindow } from '../features/WindowHost';
import { Taskbar } from './Taskbar';
import './Desktop.css';

/** The teal Windows desktop: every open ICQ window plus the taskbar. */
export function Desktop() {
  const windows = useIcq((s) => s.windows.list);
  const booting = useIcq((s) => s.booting);
  return (
    <div className="desktop">
      <main className="desktop__area" aria-busy={booting}>
        {windows.map((w) => (
          <Fragment key={w.id}>{renderWindow(w)}</Fragment>
        ))}
      </main>
      <Taskbar />
    </div>
  );
}
