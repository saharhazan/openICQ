import { useEffect, useState } from 'react';
import { useIcq, useServices } from '../app/AppContext';
import { openFromTray, trayIcon, trayIndicator, trayLabel } from '../app/trayActions';
import { STRINGS } from '../features/strings';
import { windowTitle } from '../features/windowTitles';
import { activeWindowId, findWindow, type WindowState } from '../state/windows';
import { MessageIcon } from './icons/MessageIcon';
import { StatusIcon } from './icons/StatusIcon';
import { PopupMenu, type MenuAnchor } from './PopupMenu';
import { useBlink, useTick } from './useTicker';
import { WindowIcon } from './WindowIcon';
import './Taskbar.css';

function formatClock(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span className="taskbar__clock" title={now.toLocaleDateString('en-US', { dateStyle: 'full' })}>
      {formatClock(now)}
    </span>
  );
}

/** The ICQ flower in the tray: status, spinning while connecting, blinking on unread events. */
function TrayFlower() {
  const { store } = useServices();
  const signedIn = useIcq((s) => s.session !== null);
  const status = useIcq((s) => s.status);
  const blinking = useIcq((s) => trayIndicator(s).blinking);
  const connecting = useIcq((s) => trayIndicator(s).connecting);
  const unread = useIcq((s) => trayIndicator(s).unread);
  const notices = useIcq((s) => s.chat.notices.length);
  const phase = useBlink(blinking);
  const frame = useTick(connecting, 120);
  const icon = trayIcon({ signedIn, status, blinking, connecting, unread, notices }, phase, frame);
  const open = () => openFromTray(store);
  const label = trayLabel(unread);
  return (
    <button type="button" className="taskbar__tray-icon" title={label} aria-label={label} onClick={open} onDoubleClick={open}>
      {icon.kind === 'message' ? <MessageIcon /> : <StatusIcon status={icon.variant} frame={icon.frame} />}
    </button>
  );
}

function TaskButton({ win, active }: { win: WindowState; active: boolean }) {
  const { store } = useServices();
  const title = useIcq((s) => windowTitle(win.spec, s));
  const onClick = () => {
    const state = store.getState();
    if (active && !win.minimized) state.minimizeWindow(win.id);
    else state.focusWindow(win.id);
  };
  return (
    <button
      type="button"
      className={`taskbar__task${active && !win.minimized ? ' is-active' : ''}`}
      onClick={onClick}
      title={title}
      aria-pressed={active && !win.minimized}
    >
      <WindowIcon spec={win.spec} />
      <span className="taskbar__task-label">{title}</span>
    </button>
  );
}

export function Taskbar() {
  const { store } = useServices();
  const windows = useIcq((s) => s.windows.list);
  const active = useIcq((s) => activeWindowId(s.windows));
  const [startMenu, setStartMenu] = useState<MenuAnchor | null>(null);

  const openIcq = () => {
    const state = store.getState();
    if (!state.session) {
      state.openWindow({ kind: 'login' });
      return;
    }
    const list = findWindow(state.windows, 'contactList');
    if (list) state.focusWindow(list.id);
    else state.openWindow({ kind: 'contactList' });
  };

  return (
    <div className="taskbar" role="toolbar" aria-label="Taskbar">
      <button
        type="button"
        className={`taskbar__start${startMenu ? ' is-pressed' : ''}`}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setStartMenu(startMenu ? null : { x: rect.left, y: rect.top, above: true });
        }}
      >
        <StatusIcon status="logo" />
        <span>Start</span>
      </button>
      <div className="taskbar__tasks">
        {windows.map((w) => (
          <TaskButton key={w.id} win={w} active={w.id === active} />
        ))}
      </div>
      <div className="taskbar__tray">
        <TrayFlower />
        <Clock />
      </div>
      {startMenu ? (
        <PopupMenu
          label="Start"
          anchor={startMenu}
          onClose={() => setStartMenu(null)}
          items={[
            { type: 'item', label: STRINGS.appName, icon: <StatusIcon status="logo" />, onSelect: openIcq, isDefault: true },
            { type: 'separator' },
            { type: 'item', label: `About ${STRINGS.appName}`, onSelect: () => store.getState().openWindow({ kind: 'about' }) },
          ]}
        />
      ) : null}
    </div>
  );
}
