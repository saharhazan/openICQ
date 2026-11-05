/**
 * The ICQ New main window (MainPage.cpp): the left column (328, 280 to 400,
 * 68 in mini mode under 660 px), a 1 px splitter, the chat page and the
 * right sidebar (328), which floats over the chat when the window is narrow.
 */
import { useRef } from 'react';
import { useApp } from '../../app/AppContext';
import { COLUMN_MAX, COLUMN_MIN } from '../../app/devicePrefs';
import { S } from '../../strings';
import { ChatPage } from '../conversation/ChatPage';
import { GroupSidebar } from '../groups/GroupSidebar';
import { UserSidebar } from '../profile/UserSidebar';
import { SettingsPage } from '../settings/SettingsPage';
import { LeftColumn } from './LeftColumn';
import { layoutMode, useWindowWidth } from './useViewport';
import './layout.css';

function Splitter() {
  const setPrefs = useApp((s) => s.setPrefs);
  const width = useApp((s) => s.prefs.columnWidth);
  const start = useRef<{ x: number; width: number } | null>(null);
  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-valuemin={COLUMN_MIN}
      aria-valuemax={COLUMN_MAX}
      aria-valuenow={width}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') setPrefs({ columnWidth: Math.max(COLUMN_MIN, width - 8) });
        if (event.key === 'ArrowRight') setPrefs({ columnWidth: Math.min(COLUMN_MAX, width + 8) });
      }}
      onPointerDown={(event) => {
        start.current = { x: event.clientX, width };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        const next = Math.round(start.current.width + event.clientX - start.current.x);
        setPrefs({ columnWidth: Math.min(COLUMN_MAX, Math.max(COLUMN_MIN, next)) });
      }}
      onPointerUp={() => {
        start.current = null;
      }}
    />
  );
}

function MainArea() {
  const tab = useApp((s) => s.tab);
  const settingsPage = useApp((s) => s.settingsPage);
  const chatId = useApp((s) => s.selectedChatId);
  const chatExists = useApp((s) => (s.selectedChatId === null ? false : s.data.chats[s.selectedChatId] !== undefined));
  if (tab === 'settings' && settingsPage) return <SettingsPage page={settingsPage} />;
  if (chatId !== null && chatExists) return <ChatPage key={chatId} chatId={chatId} />;
  return (
    <div className="empty-page">
      <p>{S.placeholders.selectChat}</p>
    </div>
  );
}

function Sidebar({ overlay }: { overlay: boolean }) {
  const sidebar = useApp((s) => s.sidebar);
  if (!sidebar) return null;
  return (
    <aside className={`sidebar${overlay ? ' sidebar-overlay' : ''}`}>
      {sidebar.kind === 'user' ? <UserSidebar uin={sidebar.uin} /> : <GroupSidebar chatId={sidebar.chatId} />}
    </aside>
  );
}

export function MainLayout() {
  const width = useWindowWidth();
  const columnWidth = useApp((s) => s.prefs.columnWidth);
  const spread = useApp((s) => s.columnSpread);
  const mode = layoutMode(width);
  const columnStyle = { width: mode.mini ? (spread ? 360 : 68) : columnWidth };
  return (
    <div className={`main-layout${mode.mini ? ' main-mini' : ''}`}>
      <div className={`left-column${mode.mini && spread ? ' left-spread' : ''}`} style={columnStyle}>
        <LeftColumn mini={mode.mini && !spread} />
      </div>
      {mode.mini && spread && <div className="left-placeholder" />}
      {!mode.mini && <Splitter />}
      <main className="main-area">
        <MainArea />
      </main>
      <Sidebar overlay={mode.sidebarOverlay} />
    </div>
  );
}
