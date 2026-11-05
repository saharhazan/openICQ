/** The contact picker of Create group and Add member, and the "refused" step after adding. */
import { useState } from 'react';
import { Search } from 'lucide-react';
import type { User } from '@openicq/protocol';
import { useApp, useServices } from '../../app/AppContext';
import { displayName } from '../../state/selectors';
import { S, fmt } from '../../strings';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Dialog';
import { groupInviteLink, namesOf, sendInviteLinks } from './groupHelpers';
import './groups.css';

export interface MemberPickerProps {
  candidates: readonly User[];
  selected: ReadonlySet<number>;
  onToggle: (uin: number) => void;
}

export function MemberPicker({ candidates, selected, onToggle }: MemberPickerProps) {
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();
  const visible = q
    ? candidates.filter((u) => displayName(u).toLowerCase().includes(q) || (u.nickname ?? '').includes(q) || String(u.uin) === q)
    : candidates;
  return (
    <div className="member-picker">
      <div className="search-pill picker-search">
        <Search size={16} aria-hidden="true" />
        <input type="search" aria-label={S.search.placeholder} placeholder={S.search.placeholder} value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <div className="picker-list" role="group" aria-label={S.groups.members}>
        {visible.map((user) => {
          const name = displayName(user);
          return (
            <label key={user.uin} className="contact-row picker-row">
              <input type="checkbox" checked={selected.has(user.uin)} onChange={() => onToggle(user.uin)} aria-label={name} />
              <span className="picker-check" aria-hidden="true" />
              <Avatar fileId={user.avatarFileId} seed={user.uin} name={name} size={32} />
              <span className="contact-name">{name}</span>
            </label>
          );
        })}
        {visible.length === 0 && <p className="list-empty">{candidates.length === 0 ? S.placeholders.contactListEmpty : S.search.nothingFound}</p>}
      </div>
    </div>
  );
}

export interface RefusedStepProps {
  chatId: number;
  refused: readonly number[];
  /** Called after sending the links or skipping. */
  onDone: () => void;
}

/** Users whose "Who can add me to groups" refused: the original offers to send them the invite link. */
export function RefusedStep({ chatId, refused, onDone }: RefusedStepProps) {
  const services = useServices();
  const users = useApp((s) => s.data.users);
  const chat = useApp((s) => s.data.chats[chatId]);
  const [sending, setSending] = useState(false);
  const link = groupInviteLink(chat) ?? '';
  return (
    <div className="refused-step">
      <p className="dialog-text">{fmt(S.groups.cannotAdd, namesOf(users, refused), link)}</p>
      <ul className="refused-list" aria-label={S.groups.sendInviteLink}>
        {refused.map((uin) => {
          const name = displayName(users[uin], uin);
          return (
            <li key={uin} className="contact-row">
              <Avatar fileId={users[uin]?.avatarFileId ?? null} seed={uin} name={name} size={32} />
              <span className="contact-name">{name}</span>
            </li>
          );
        })}
      </ul>
      <div className="dialog-footer refused-footer">
        <Button kind="secondary" onClick={onDone}>
          {S.dialogs.done}
        </Button>
        <Button
          disabled={sending}
          onClick={() => {
            setSending(true);
            void sendInviteLinks(services, chatId, refused).then(() => {
              setSending(false);
              onDone();
            });
          }}
        >
          {S.groups.sendInviteLink}
        </Button>
      </div>
    </div>
  );
}
