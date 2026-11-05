/** The member list of the group sidebar with roles and the admin member menu (sidebar/GroupProfile.cpp). */
import type { Member, MemberRole } from '@openicq/protocol';
import { useApp, useServices } from '../../app/AppContext';
import { formatPresence } from '../../state/format';
import { displayName } from '../../state/selectors';
import { S } from '../../strings';
import { Avatar } from '../../ui/Avatar';
import { useMenu, type MenuEntry } from '../../ui/Menu';
import { memberActions, roleLabel, sortMembers, type MemberAction } from './groupHelpers';

export interface GroupMembersProps {
  chatId: number;
  myRole: MemberRole;
  members: readonly Member[];
  /** Reload after a change. */
  onChanged: () => void;
}

const LABELS: Record<MemberAction, string> = {
  assignAdmin: S.groups.assignAdmin,
  revokeAdmin: S.groups.revokeAdmin,
  banToWrite: S.groups.banToWrite,
  allowToWrite: S.groups.allowToWrite,
  delete: S.groups.deleteMember,
  profile: S.groups.profile,
};

const CONFIRMS: Record<Exclude<MemberAction, 'profile'>, string> = {
  assignAdmin: S.groups.makeAdminConfirm,
  revokeAdmin: S.groups.revokeAdminConfirm,
  banToWrite: S.groups.banConfirm,
  allowToWrite: S.groups.allowConfirm,
  delete: S.groups.deleteMemberConfirm,
};

export function GroupMembers({ chatId, myRole, members, onChanged }: GroupMembersProps) {
  const { store, groups } = useServices();
  const users = useApp((s) => s.data.users);
  const me = useApp((s) => s.data.me);
  const menu = useMenu();
  const name = (uin: number) => (me && uin === me.uin ? displayName(me) : displayName(users[uin], uin));
  const now = new Date();

  const run = async (action: Exclude<MemberAction, 'profile'>, uin: number) => {
    const ok =
      action === 'delete'
        ? await groups.removeMember(chatId, uin)
        : await groups.setRole(chatId, uin, action === 'assignAdmin' ? 'admin' : action === 'banToWrite' ? 'readonly' : 'member');
    if (ok) onChanged();
  };

  const choose = (action: MemberAction, uin: number) => {
    if (action === 'profile') {
      store.getState().patch({ sidebar: { kind: 'user', uin } });
      return;
    }
    store.getState().confirm({
      title: LABELS[action],
      text: CONFIRMS[action],
      confirmLabel: action === 'delete' ? S.groups.deleteMember : S.dialogs.yes,
      destructive: action === 'delete' || action === 'banToWrite',
      onConfirm: () => void run(action, uin),
    });
  };

  const entries = (member: Member): MenuEntry[] =>
    memberActions(myRole, member.role, me !== null && member.uin === me.uin).map((action) => ({
      label: LABELS[action],
      danger: action === 'delete',
      onSelect: () => choose(action, member.uin),
    }));

  return (
    <ul className="member-list" aria-label={S.groups.allMembers}>
      {sortMembers(members, name).map((member) => {
        const memberName = name(member.uin);
        const user = users[member.uin];
        const role = roleLabel(member.role);
        const open = (x: number, y: number) => menu.openAt(x, y, memberName, entries(member));
        return (
          <li key={member.uin}>
            <button
              type="button"
              className="contact-row member-row"
              aria-haspopup="menu"
              onClick={(event) =>
                event.detail === 0 ? menu.openBelow(event.currentTarget, memberName, entries(member)) : open(event.clientX, event.clientY)
              }
              onContextMenu={(event) => {
                event.preventDefault();
                open(event.clientX, event.clientY);
              }}
            >
              <Avatar fileId={user?.avatarFileId ?? null} seed={member.uin} name={memberName} size={32} online={user?.presence.online ?? false} />
              <span className="contact-text">
                <span className="contact-name">{memberName}</span>
                {user && <span className="contact-sub">{formatPresence(user.presence, now)}</span>}
              </span>
              {role && <span className="member-role">{role}</span>}
            </button>
          </li>
        );
      })}
      {menu.menu}
    </ul>
  );
}
