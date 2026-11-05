/**
 * Global search (ContactListUtils.cpp): local chats and contacts under
 * "Contacts and groups", then people from the server (user.search), which
 * starts at 4 characters like the original (server_search_contacts_min_symbols).
 */
import { useEffect, useState } from 'react';
import type { User } from '@openicq/protocol';
import { useApp, useServices } from '../../app/AppContext';
import { chatAvatarFileId, chatAvatarSeed, chatTitle, displayName, matchChats } from '../../state/selectors';
import { S } from '../../strings';
import { Avatar } from '../../ui/Avatar';

export const SERVER_SEARCH_MIN = 4;
const SEARCH_DELAY_MS = 400;

export function SearchResults({ query }: { query: string }) {
  const { store, chats, account } = useServices();
  const data = useApp((s) => s.data);
  const [people, setPeople] = useState<{ query: string; users: User[] } | null>(null);
  const trimmed = query.trim();
  const local = matchChats(data, trimmed);

  useEffect(() => {
    if (trimmed.length < SERVER_SEARCH_MIN) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void account.search(trimmed).then((users) => {
        if (!cancelled) setPeople({ query: trimmed, users: users ?? [] });
      });
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, account]);

  const localPeers = new Set(local.map((c) => c.peer).filter((p): p is number => p !== null));
  const server = people && people.query === trimmed ? people.users.filter((u) => !localPeers.has(u.uin) && u.uin !== data.me?.uin) : [];
  const done = () => store.getState().patch({ searchQuery: '' });
  const nothing = local.length === 0 && server.length === 0 && (trimmed.length < SERVER_SEARCH_MIN || people?.query === trimmed);

  return (
    <div className="search-results">
      {local.length > 0 && (
        <>
          <div className="list-section">{S.search.contactsAndGroups}</div>
          <div role="listbox" aria-label={S.search.contactsAndGroups} className="plain-list">
            {local.map((chat) => {
              const title = chatTitle(data, chat);
              return (
                <div
                  key={chat.id}
                  role="option"
                  aria-selected={false}
                  aria-label={title}
                  tabIndex={0}
                  className="contact-row"
                  onClick={() => {
                    store.getState().openChat(chat.id);
                    done();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      store.getState().openChat(chat.id);
                      done();
                    }
                  }}
                >
                  <Avatar fileId={chatAvatarFileId(data, chat)} seed={chatAvatarSeed(data, chat)} name={title} size={32} favorites={chat.type === 'favorites'} />
                  <span className="contact-name">{title}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
      {server.length > 0 && (
        <>
          <div className="list-section">{S.search.people}</div>
          <div role="listbox" aria-label={S.search.people} className="plain-list">
            {server.map((user) => {
              const name = displayName(user);
              const open = () => {
                done();
                void chats.openDirect(user.uin);
              };
              return (
                <div
                  key={user.uin}
                  role="option"
                  aria-selected={false}
                  aria-label={name}
                  tabIndex={0}
                  className="contact-row"
                  onClick={open}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') open();
                  }}
                >
                  <Avatar fileId={user.avatarFileId} seed={user.uin} name={name} size={32} />
                  <span className="contact-text">
                    <span className="contact-name">{name}</span>
                    <span className="contact-sub">{user.nickname ? `@${user.nickname}` : user.uin}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
      {nothing && <p className="list-empty">{S.search.nothingFound}</p>}
    </div>
  );
}
