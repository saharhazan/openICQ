/**
 * The Contacts tab (ContactsTab.cpp, ContactListWithHeaders.cpp): "Add contact",
 * then ALL CONTACTS in 48 px rows with a 32 px avatar and the last-seen line.
 */
import type { KeyboardEvent } from 'react';
import { UserPlus } from 'lucide-react';
import type { User } from '@openicq/protocol';
import { useApp, useServices } from '../../app/AppContext';
import { formatPresence } from '../../state/format';
import { displayName } from '../../state/selectors';
import { S, fmt } from '../../strings';
import { Avatar } from '../../ui/Avatar';
import { useMenu } from '../../ui/Menu';
import './contacts.css';

/** Contacts as rows: known users only, alphabetical by display name. */
export function contactRows(users: Readonly<Record<number, User>>, contacts: readonly number[]): User[] {
  return contacts
    .map((uin) => users[uin])
    .filter((user): user is User => user !== undefined)
    .sort((a, b) => displayName(a).localeCompare(displayName(b)) || a.uin - b.uin);
}

export function ContactsTab({ mini }: { mini: boolean }) {
  const { store, chats, account } = useServices();
  const users = useApp((s) => s.data.users);
  const contacts = useApp((s) => s.data.contacts);
  const selectedPeer = useApp((s) => (s.selectedChatId === null ? null : (s.data.chats[s.selectedChatId]?.peer ?? null)));
  const menu = useMenu();
  const rows = contactRows(users, contacts);
  const now = new Date();

  const open = async (uin: number) => {
    await chats.openDirect(uin);
    store.getState().patch({ tab: 'chats' });
  };

  const showProfile = async (uin: number) => {
    await chats.openDirect(uin);
    store.getState().patch({ tab: 'chats', sidebar: { kind: 'user', uin } });
  };

  const confirmRemove = (user: User) =>
    store.getState().confirm({
      title: S.dialogs.removeContactTitle,
      text: fmt(S.dialogs.removeContactConfirm, displayName(user)),
      confirmLabel: S.dialogs.remove,
      destructive: true,
      onConfirm: () => void account.removeContact(user.uin),
    });

  const openMenu = (user: User, x: number, y: number) =>
    menu.openAt(x, y, displayName(user), [
      { label: S.groups.profile, onSelect: () => void showProfile(user.uin) },
      { label: S.contacts.removeContact, danger: true, onSelect: () => confirmRemove(user) },
    ]);

  const onKey = (event: KeyboardEvent<HTMLDivElement>, user: User) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void open(user.uin);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const sibling = event.key === 'ArrowDown' ? event.currentTarget.nextElementSibling : event.currentTarget.previousElementSibling;
      if (sibling instanceof HTMLElement) sibling.focus();
    } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      openMenu(user, rect.left + 16, rect.bottom);
    }
  };

  return (
    <div className={`contacts-tab${mini ? ' contacts-mini' : ''}`}>
      <button
        type="button"
        className="contact-row add-contact-row"
        aria-label={S.contacts.addContact}
        onClick={() => store.getState().openDialog({ kind: 'addContact' })}
      >
        <span className="add-contact-icon" aria-hidden="true">
          <UserPlus size={18} />
        </span>
        {!mini && <span className="contact-name">{S.contacts.addContact}</span>}
      </button>
      {!mini && rows.length > 0 && <div className="list-section">{S.sections.allContacts}</div>}
      <div role="listbox" aria-label={S.tabs.contacts} className="plain-list">
        {rows.map((user) => {
          const name = displayName(user);
          const selected = selectedPeer === user.uin;
          return (
            <div
              key={user.uin}
              role="option"
              aria-selected={selected}
              aria-label={name}
              tabIndex={0}
              className="contact-row"
              title={mini ? name : undefined}
              onClick={() => void open(user.uin)}
              onKeyDown={(event) => onKey(event, user)}
              onContextMenu={(event) => {
                event.preventDefault();
                openMenu(user, event.clientX, event.clientY);
              }}
            >
              <Avatar fileId={user.avatarFileId} seed={user.uin} name={name} size={32} online={user.presence.online} />
              {!mini && (
                <span className="contact-text">
                  <span className="contact-name">{name}</span>
                  <span className={`contact-sub${user.presence.online ? ' contact-online' : ''}`}>{formatPresence(user.presence, now)}</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
      {rows.length === 0 && !mini && <p className="list-empty">{S.placeholders.contactListEmpty}</p>}
      {menu.menu}
    </div>
  );
}
