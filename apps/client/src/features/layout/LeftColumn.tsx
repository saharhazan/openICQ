import { useRef } from 'react';
import { ChevronsRight, MessageCircle, Search, Settings, SquarePen, Users, X } from 'lucide-react';
import { useApp, useServices } from '../../app/AppContext';
import { totalUnread } from '../../state/selectors';
import type { Tab } from '../../state/store';
import { S } from '../../strings';
import { Avatar } from '../../ui/Avatar';
import { useMenu } from '../../ui/Menu';
import { ChatList } from '../chatlist/ChatList';
import { ContactsTab } from '../contacts/ContactsTab';
import { SettingsList } from '../settings/SettingsList';
import { SearchResults } from './SearchResults';

const TITLES: Record<Tab, string> = { chats: S.head.chats, contacts: S.head.contacts, settings: S.head.settings };

function Header({ mini }: { mini: boolean }) {
  const { store, chats } = useServices();
  const me = useApp((s) => s.data.me);
  const tab = useApp((s) => s.tab);
  const connection = useApp((s) => s.connection);
  const write = useMenu();
  const pencil = useRef<HTMLButtonElement>(null);
  const openWrite = () => {
    if (!pencil.current) return;
    write.openBelow(pencil.current, S.write.tooltip, [
      { label: S.write.addContact, onSelect: () => store.getState().openDialog({ kind: 'addContact' }) },
      { label: S.write.createGroup, onSelect: () => store.getState().openDialog({ kind: 'createGroup' }) },
      {
        label: S.write.readAll,
        onSelect: () =>
          store.getState().confirm({
            title: S.dialogs.markAllRead,
            text: S.dialogs.markAllReadConfirm,
            confirmLabel: S.dialogs.markAllRead,
            onConfirm: () => void chats.readAll(),
          }),
      },
    ]);
  };
  const title = connection === 'open' ? TITLES[tab] : S.connection.connecting;
  return (
    <header className="column-header">
      <button
        type="button"
        className="my-avatar"
        aria-label={S.profile.myProfile}
        onClick={() => store.getState().patch({ tab: 'settings', settingsPage: 'profile', columnSpread: false })}
      >
        {me && <Avatar fileId={me.avatarFileId} seed={me.uin} name={me.firstName} size={32} />}
      </button>
      {mini ? (
        <button type="button" className="icon-button" aria-label={S.head.chats} onClick={() => store.getState().patch({ columnSpread: true })}>
          <ChevronsRight size={20} />
        </button>
      ) : (
        <>
          <h1 className={`column-title${connection === 'open' ? '' : ' column-title-connecting'}`} aria-live="polite">
            {title}
          </h1>
          <button ref={pencil} type="button" className="icon-button" aria-label={S.write.tooltip} title={S.write.tooltip} onClick={openWrite}>
            <SquarePen size={20} />
          </button>
        </>
      )}
      {write.menu}
    </header>
  );
}

function SearchField() {
  const query = useApp((s) => s.searchQuery);
  const patch = useApp((s) => s.patch);
  return (
    <div className="search-pill">
      <Search size={16} aria-hidden="true" />
      <input
        type="search"
        aria-label={S.search.placeholder}
        placeholder={S.search.placeholder}
        value={query}
        onChange={(event) => patch({ searchQuery: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === 'Escape') patch({ searchQuery: '' });
        }}
      />
      {query && (
        <button type="button" className="search-clear" aria-label={S.dialogs.cancel} onClick={() => patch({ searchQuery: '' })}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}

const TAB_ICONS = { contacts: Users, chats: MessageCircle, settings: Settings } as const;

function TabBar({ mini }: { mini: boolean }) {
  const tab = useApp((s) => s.tab);
  const patch = useApp((s) => s.patch);
  const unread = useApp((s) => totalUnread(s.data.chats));
  const tabs: Tab[] = ['contacts', 'chats', 'settings'];
  return (
    <nav className="tab-bar">
      {tabs.map((name) => {
        const Icon = TAB_ICONS[name];
        const active = tab === name;
        return (
          <button
            key={name}
            type="button"
            className={`tab${active ? ' tab-active' : ''}`}
            aria-current={active ? 'page' : undefined}
            aria-label={S.tabs[name]}
            onClick={() =>
              patch((s) => ({
                tab: name,
                searchQuery: '',
                settingsPage: name === 'settings' ? (s.settingsPage ?? 'profile') : null,
              }))
            }
          >
            <span className="tab-icon">
              <Icon size={26} strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
              {name === 'chats' && unread > 0 && <span className="tab-badge">{unread > 99 ? '99+' : unread}</span>}
            </span>
            {!mini && <span className="tab-label">{S.tabs[name]}</span>}
          </button>
        );
      })}
    </nav>
  );
}

export function LeftColumn({ mini }: { mini: boolean }) {
  const tab = useApp((s) => s.tab);
  const query = useApp((s) => s.searchQuery);
  const searching = query.trim() !== '' && tab !== 'settings';
  return (
    <div className="column">
      <Header mini={mini} />
      {!mini && tab !== 'settings' && <SearchField />}
      <div className="column-content">
        {searching && !mini ? (
          <SearchResults query={query} />
        ) : tab === 'chats' ? (
          <ChatList mini={mini} />
        ) : tab === 'contacts' ? (
          <ContactsTab mini={mini} />
        ) : (
          <SettingsList mini={mini} />
        )}
      </div>
      <TabBar mini={mini} />
    </div>
  );
}
