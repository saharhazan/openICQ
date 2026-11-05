/**
 * The group profile in the right sidebar (sidebar/GroupProfile.cpp): about,
 * rules, link, waiting for approval, group settings, members with roles,
 * clear history and leave.
 */
import { useCallback, useEffect, useState } from 'react';
import { Copy, Eraser, Link2, LogOut, RefreshCw, Settings, UserPlus } from 'lucide-react';
import type { Member } from '@openicq/protocol';
import { useApp, useServices } from '../../app/AppContext';
import { S, plural } from '../../strings';
import { Avatar } from '../../ui/Avatar';
import { ActionRow, Page } from '../../ui/Page';
import { copyText, groupInviteLink, isAdminRole } from './groupHelpers';
import { GroupMembers } from './GroupMembers';
import { GroupRequests } from './GroupRequests';
import { GroupSettingsForm } from './GroupSettingsForm';
import './groups.css';

export function GroupSidebar({ chatId }: { chatId: number }) {
  const services = useServices();
  const { store, groups, chats } = services;
  const chat = useApp((s) => s.data.chats[chatId]);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [version, setVersion] = useState(0);
  const close = () => store.getState().patch({ sidebar: null });
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    void groups.members(chatId).then((list) => {
      if (!cancelled && list) setMembers(list);
    });
    return () => {
      cancelled = true;
    };
  }, [chatId, groups, version]);

  if (!chat || !chat.group) {
    return (
      <Page title={S.header.information} onClose={close}>
        <p className="list-empty">{S.groups.notMember}</p>
      </Page>
    );
  }
  const group = chat.group;
  const admin = isAdminRole(group.myRole);
  const link = groupInviteLink(chat);

  if (editing && admin) {
    return (
      <Page title={S.groups.groupSettings} onBack={() => setEditing(false)} onClose={close}>
        <GroupSettingsForm chat={chat} onDone={() => setEditing(false)} />
      </Page>
    );
  }

  const confirmLeave = () =>
    store.getState().confirm({
      title: S.groups.leaveAndDelete,
      text: S.dialogs.leaveGroupConfirm,
      confirmLabel: S.dialogs.leave,
      destructive: true,
      onConfirm: () => {
        close();
        void chats.remove(chatId);
      },
    });

  const confirmClear = () =>
    store.getState().confirm({
      title: S.groups.clearHistory,
      text: S.dialogs.clearHistoryConfirm,
      confirmLabel: S.dialogs.remove,
      destructive: true,
      onConfirm: () => void chats.clear(chatId),
    });

  const confirmRegenerate = () =>
    store.getState().confirm({
      title: S.groups.generateLink,
      text: S.groups.generateConfirm,
      confirmLabel: S.groups.generate,
      onConfirm: () => void groups.regenerateLink(chatId),
    });

  return (
    <Page title={S.header.information} onClose={close}>
      <div className="profile-head">
        <Avatar fileId={chat.avatarFileId} seed={chat.id} name={chat.title} size={100} />
        <h3 className="profile-name">{chat.title}</h3>
        <p className="profile-sub">{plural(group.membersCount, S.header.members)}</p>
      </div>

      {group.about && (
        <section className="sidebar-section" aria-label={S.groups.aboutGroup}>
          <h3 className="sidebar-caption">{S.groups.aboutGroup}</h3>
          <p className="sidebar-text">{group.about}</p>
        </section>
      )}
      {group.rules && (
        <section className="sidebar-section" aria-label={S.groups.rules}>
          <h3 className="sidebar-caption">{S.groups.rules}</h3>
          <p className="sidebar-text">{group.rules}</p>
        </section>
      )}
      {link && (
        <section className="sidebar-section" aria-label={S.groups.link}>
          <h3 className="sidebar-caption">{S.groups.link}</h3>
          <p className="sidebar-link">
            <Link2 size={16} aria-hidden="true" />
            <span>{link}</span>
          </p>
          <ActionRow icon={<Copy size={20} />} label={S.groups.copyLink} onClick={() => void copyText(services, link, S.dialogs.linkCopied)} />
          {admin && <ActionRow icon={<RefreshCw size={20} />} label={S.groups.generateLink} onClick={confirmRegenerate} />}
        </section>
      )}

      {admin && group.pendingRequests > 0 && <GroupRequests chatId={chatId} pending={group.pendingRequests} onChanged={reload} />}

      <section className="sidebar-section">
        {admin && <ActionRow icon={<Settings size={20} />} label={S.groups.groupSettings} onClick={() => setEditing(true)} />}
        {admin && (
          <ActionRow icon={<UserPlus size={20} />} label={S.groups.addMembers} onClick={() => store.getState().openDialog({ kind: 'addMembers', chatId })} />
        )}
      </section>

      <section className="sidebar-section" aria-label={S.groups.allMembers}>
        <h3 className="sidebar-caption">{plural(members?.length ?? group.membersCount, { one: S.groups.memberCount, many: S.groups.membersCount })}</h3>
        {members && <GroupMembers chatId={chatId} myRole={group.myRole} members={members} onChanged={reload} />}
      </section>

      <section className="sidebar-section">
        <ActionRow icon={<Eraser size={20} />} label={S.groups.clearHistory} onClick={confirmClear} />
        <ActionRow icon={<LogOut size={20} />} label={S.groups.leaveAndDelete} danger onClick={confirmLeave} />
      </section>
    </Page>
  );
}
