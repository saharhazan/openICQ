/**
 * A contact's profile in the right sidebar (sidebar/UserProfile.cpp): Message,
 * nickname, about, ICQ#, Add contact, Block or Unblock, Remove contact.
 * "Common groups" is left out: the contract has no request for it.
 */
import { useEffect } from 'react';
import { Ban, Copy, MessageCircle, UserMinus, UserPlus } from 'lucide-react';
import { useApp, useServices } from '../../app/AppContext';
import { formatPresence } from '../../state/format';
import { displayName } from '../../state/selectors';
import { S, fmt } from '../../strings';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Dialog';
import { ActionRow, Page } from '../../ui/Page';
import { copyText } from '../groups/groupHelpers';
import '../groups/groups.css';
import './UserSidebar.css';

/** context_menu "Copy nickname". */
export const COPY_NICKNAME = 'Copy nickname';

export function UserSidebar({ uin }: { uin: number }) {
  const services = useServices();
  const { store, chats, account } = services;
  const user = useApp((s) => s.data.users[uin]);
  const close = () => store.getState().patch({ sidebar: null });

  useEffect(() => {
    void account.getUser(uin);
  }, [account, uin]);

  if (!user) {
    return (
      <Page title={S.header.information} onClose={close}>
        <p className="list-empty" aria-busy="true" />
      </Page>
    );
  }

  const name = displayName(user);
  const confirmBlock = () =>
    store.getState().confirm(
      user.blocked
        ? {
            title: S.profile.unblock,
            text: S.dialogs.unblockConfirm,
            confirmLabel: S.profile.unblock,
            onConfirm: () => void chats.block(uin, false),
          }
        : {
            title: S.profile.block,
            text: S.dialogs.blockConfirm,
            confirmLabel: S.dialogs.block,
            destructive: true,
            onConfirm: () => void chats.block(uin, true),
          },
    );
  const confirmRemove = () =>
    store.getState().confirm({
      title: S.dialogs.removeContactTitle,
      text: fmt(S.dialogs.removeContactConfirm, name),
      confirmLabel: S.dialogs.remove,
      destructive: true,
      onConfirm: () => void account.removeContact(uin),
    });

  return (
    <Page title={S.header.information} onClose={close}>
      <div className="profile-head">
        <Avatar fileId={user.avatarFileId} seed={user.uin} name={name} size={100} />
        <h3 className="profile-name">{name}</h3>
        <p className={`profile-sub${user.presence.online ? ' profile-online' : ''}`}>
          {user.blocked ? S.presence.blocked : formatPresence(user.presence, new Date())}
        </p>
        <div className="profile-actions">
          <Button onClick={() => void chats.openDirect(uin)}>
            <span className="button-with-icon">
              <MessageCircle size={16} aria-hidden="true" />
              {S.profile.message}
            </span>
          </Button>
        </div>
      </div>

      {user.nickname && (
        <section className="sidebar-section" aria-label={S.profile.nickname}>
          <h3 className="sidebar-caption">{S.profile.nickname}</h3>
          <div className="sidebar-value-row">
            <span className="sidebar-text">@{user.nickname}</span>
            <button
              type="button"
              className="icon-button"
              aria-label={COPY_NICKNAME}
              title={COPY_NICKNAME}
              onClick={() => void copyText(services, `@${user.nickname ?? ''}`, S.profile.nicknameCopied)}
            >
              <Copy size={18} />
            </button>
          </div>
        </section>
      )}
      {user.about && (
        <section className="sidebar-section" aria-label={S.profile.aboutMe}>
          <h3 className="sidebar-caption">{S.profile.aboutMe}</h3>
          <p className="sidebar-text">{user.about}</p>
        </section>
      )}
      <section className="sidebar-section" aria-label={S.profile.icqNumber}>
        <h3 className="sidebar-caption">{S.profile.icqNumber}</h3>
        <p className="sidebar-text">{user.uin}</p>
      </section>

      <section className="sidebar-section">
        {!user.isContact && <ActionRow icon={<UserPlus size={20} />} label={S.contacts.addContact} onClick={() => void account.addContact(uin)} />}
        <ActionRow icon={<Ban size={20} />} label={user.blocked ? S.profile.unblock : S.profile.block} danger={!user.blocked} onClick={confirmBlock} />
        {user.isContact && <ActionRow icon={<UserMinus size={20} />} label={S.profile.remove} danger onClick={confirmRemove} />}
      </section>
    </Page>
  );
}
