/**
 * The Settings tab (settings/SettingsTab.cpp): my profile row, then the
 * pages, each with its icon on a coloured tile, in the original order.
 * Stickers, Calls and Language are out of scope for version 1.
 */
import { useId, type ReactNode } from 'react';
import { Bell, Info, Keyboard, Lock, Palette, Settings, Star } from 'lucide-react';
import { useApp, useServices } from '../../app/AppContext';
import { displayName } from '../../state/selectors';
import type { SettingsPage } from '../../state/store';
import { S } from '../../strings';
import { Avatar } from '../../ui/Avatar';
import '../../ui/page.css';
import './settings.css';

interface Entry {
  key: SettingsPage | 'favorites';
  label: string;
  tile: string;
  icon: ReactNode;
}

const ICON = { size: 18, color: '#ffffff', strokeWidth: 2, 'aria-hidden': true } as const;

export const SETTINGS_ENTRIES: readonly Entry[] = [
  { key: 'favorites', label: S.recents.favorites, tile: 'var(--secondary-rainbow-yellow)', icon: <Star {...ICON} /> },
  { key: 'general', label: S.settings.general, tile: 'var(--secondary-rainbow-mint)', icon: <Settings {...ICON} /> },
  { key: 'notifications', label: S.settings.notifications, tile: 'var(--secondary-attention)', icon: <Bell {...ICON} /> },
  { key: 'privacy', label: S.settings.privacy, tile: 'var(--base-primary)', icon: <Lock {...ICON} /> },
  { key: 'appearance', label: S.settings.appearance, tile: 'var(--secondary-rainbow-cold)', icon: <Palette {...ICON} /> },
  { key: 'shortcuts', label: S.settings.shortcuts, tile: 'var(--secondary-rainbow-purple)', icon: <Keyboard {...ICON} /> },
  { key: 'about', label: S.settings.about, tile: 'var(--secondary-rainbow-green)', icon: <Info {...ICON} /> },
];

export function SettingsList({ mini }: { mini: boolean }) {
  const { store } = useServices();
  const me = useApp((s) => s.data.me);
  const page = useApp((s) => s.settingsPage);
  const chats = useApp((s) => s.data.chats);
  const profileHint = useId();

  const open = (key: Entry['key']) => {
    if (key !== 'favorites') {
      store.getState().patch({ settingsPage: key, columnSpread: false });
      return;
    }
    const favorites = Object.values(chats).find((chat) => chat.type === 'favorites');
    if (!favorites) return;
    store.getState().openChat(favorites.id);
    store.getState().patch({ tab: 'chats', settingsPage: null });
  };

  const name = me ? displayName(me) : '';
  return (
    <nav className={`settings-list${mini ? ' settings-list-mini' : ''}`} aria-label={S.settings.title}>
      {me && (
        <button
          type="button"
          className="settings-row settings-profile"
          aria-current={page === 'profile' ? 'page' : undefined}
          aria-describedby={profileHint}
          aria-label={mini ? name : undefined}
          onClick={() => open('profile')}
        >
          <Avatar fileId={me.avatarFileId} seed={me.uin} name={name} size={mini ? 32 : 52} />
          {!mini && (
            <span className="settings-profile-text">
              <span className="settings-profile-name">{name}</span>
              <span className="settings-profile-sub" id={profileHint}>
                {S.settings.myProfile}
              </span>
            </span>
          )}
        </button>
      )}
      {SETTINGS_ENTRIES.map((entry) => (
        <button
          key={entry.key}
          type="button"
          className="settings-row"
          aria-current={entry.key !== 'favorites' && page === entry.key ? 'page' : undefined}
          aria-label={mini ? entry.label : undefined}
          title={mini ? entry.label : undefined}
          onClick={() => open(entry.key)}
        >
          <span className="row-tile" style={{ background: entry.tile }} aria-hidden="true">
            {entry.icon}
          </span>
          {!mini && <span className="row-label">{entry.label}</span>}
        </button>
      ))}
    </nav>
  );
}
