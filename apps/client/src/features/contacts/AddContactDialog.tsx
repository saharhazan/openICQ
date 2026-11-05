/**
 * "Add contact" (AddContactDialogs.cpp). The original asked for a phone number
 * or a nickname; openICQ has no phones, so one field takes a nickname, an ICQ#
 * or an email and the server search (user.search) finds the person.
 */
import { useState } from 'react';
import { LIMITS, type User } from '@openicq/protocol';
import { useApp, useServices } from '../../app/AppContext';
import { displayName } from '../../state/selectors';
import { S } from '../../strings';
import { Avatar } from '../../ui/Avatar';
import { Button, Dialog } from '../../ui/Dialog';
import { TextField } from '../../ui/controls';
import './contacts.css';

/** placeholders "Find". */
export const FIND = 'Find';

export function AddContactDialog({ onClose }: { onClose: () => void }) {
  const { account, chats, store } = useServices();
  const myUin = useApp((s) => s.data.me?.uin ?? null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[] | null>(null);
  const [busy, setBusy] = useState(false);
  const trimmed = query.trim();
  const canFind = trimmed.length >= LIMITS.searchQueryMin;

  const find = async () => {
    if (!canFind) return;
    setBusy(true);
    const users = await account.search(trimmed);
    setBusy(false);
    if (users) setResults(users.filter((u) => u.uin !== myUin));
  };

  const add = async (uin: number) => {
    const user = await account.addContact(uin);
    if (user) setResults((current) => (current ?? []).map((u) => (u.uin === uin ? user : u)));
  };

  const message = async (uin: number) => {
    onClose();
    await chats.openDirect(uin);
    store.getState().patch({ tab: 'chats' });
  };

  return (
    <Dialog
      title={S.contacts.addContact}
      onClose={onClose}
      width={400}
      footer={
        <>
          <Button kind="secondary" onClick={onClose}>
            {S.dialogs.close}
          </Button>
          <Button disabled={!canFind || busy} onClick={() => void find()}>
            {FIND}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void find();
        }}
      >
        <TextField label={S.contacts.addHint} value={query} onChange={setQuery} maxLength={LIMITS.searchQueryMax} autoFocus />
      </form>
      {results !== null && results.length === 0 && <p className="list-empty">{S.contacts.userNotFound}</p>}
      {results !== null && results.length > 0 && (
        <ul className="found-list" aria-label={S.search.people}>
          {results.map((user) => {
            const name = displayName(user);
            return (
              <li key={user.uin} className="contact-row found-row" aria-label={name}>
                <Avatar fileId={user.avatarFileId} seed={user.uin} name={name} size={32} />
                <span className="contact-text">
                  <span className="contact-name">{name}</span>
                  <span className="contact-sub">{user.nickname ? `@${user.nickname}` : user.uin}</span>
                </span>
                {user.isContact ? (
                  <span className="found-note">{S.contacts.alreadyAdded}</span>
                ) : (
                  <button type="button" className="text-button" onClick={() => void add(user.uin)}>
                    {S.dialogs.add}
                  </button>
                )}
                <button type="button" className="text-button" onClick={() => void message(user.uin)}>
                  {S.profile.message}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
