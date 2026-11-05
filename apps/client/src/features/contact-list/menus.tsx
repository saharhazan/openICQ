/**
 * The Main menu, the status menu and the contact menu of the Contact List.
 * Captions come from icq.exe; the order follows the research (docs/research Q2, Q3).
 * Only items this rebuild can carry out are listed.
 */
import { hasStatusMessage, type Status, type Uin } from '@openicq/protocol';
import type { Services } from '../../app/services';
import type { ContactRow } from '../../state/contactList';
import { MessageIcon } from '../../ui/icons/MessageIcon';
import { StatusIcon } from '../../ui/icons/StatusIcon';
import type { MenuItem } from '../../ui/PopupMenu';
import { READ_AWAY_LABEL, STATUS_MENU_LABEL, STRINGS } from '../strings';

const STATUS_ORDER: Status[] = ['online', 'ffc', 'away', 'na', 'occupied', 'dnd', 'invisible', 'offline'];

function reportFailure(services: Services, title: string) {
  return (error: unknown) => services.store.getState().reportError(error, title);
}

/** Statuses with a status message first ask for it ("Change / Confirm ... Message"). */
export function chooseStatus(services: Services, status: Status): void {
  if (hasStatusMessage(status)) {
    services.store.getState().openWindow({ kind: 'awayMessage', status });
    return;
  }
  services.session.setStatus(status).catch(reportFailure(services, STRINGS.appName));
}

export function statusMenu(services: Services, current: Status): MenuItem[] {
  return [
    { type: 'title', label: 'Online Status' },
    ...STATUS_ORDER.map(
      (status): MenuItem => ({
        type: 'item',
        label: STATUS_MENU_LABEL[status],
        icon: <StatusIcon status={status} />,
        isDefault: status === current,
        onSelect: () => chooseStatus(services, status),
      }),
    ),
  ];
}

export function mainMenu(services: Services, selected: Uin | null, online: boolean): MenuItem[] {
  const { store, session } = services;
  const open = store.getState().openWindow;
  const self = store.getState().session?.uin ?? null;
  return [
    { type: 'item', label: 'Add / Invite Users', icon: <StatusIcon status="logo" />, onSelect: () => open({ kind: 'addUser' }), disabled: !online },
    { type: 'item', label: 'Find User - Add To List', onSelect: () => open({ kind: 'addUser' }), disabled: !online },
    { type: 'separator' },
    { type: 'item', label: 'Preferences', onSelect: () => open({ kind: 'preferences' }), disabled: !online },
    { type: 'item', label: 'Security & Privacy', onSelect: () => open({ kind: 'security', tab: 'general' }), disabled: !online },
    {
      type: 'item',
      label: 'View / Change My Details',
      onSelect: () => {
        if (self !== null) open({ kind: 'userDetails', uin: self });
      },
      disabled: !online || self === null,
    },
    { type: 'separator' },
    {
      type: 'submenu',
      label: 'Change The Active User',
      items: [
        { type: 'item', label: 'Change The Active User', onSelect: () => session.signOut().catch(reportFailure(services, STRINGS.appName)) },
        { type: 'item', label: 'Register A New User', onSelect: () => open({ kind: 'register' }) },
      ],
    },
    {
      type: 'item',
      label: 'View Message History',
      icon: <MessageIcon />,
      onSelect: () => {
        if (selected !== null) open({ kind: 'history', uin: selected });
      },
      disabled: !online || selected === null,
    },
    { type: 'separator' },
    { type: 'item', label: 'About', onSelect: () => open({ kind: 'about' }) },
    { type: 'separator' },
    { type: 'item', label: STRINGS.shutDown, onSelect: () => open({ kind: 'confirmShutDown' }) },
  ];
}

/** Right-click menu of one contact (or of a "Not In List" sender). */
export function contactMenu(services: Services, row: ContactRow, online: boolean, startRename: () => void): MenuItem[] {
  const open = services.store.getState().openWindow;
  const items: MenuItem[] = [
    { type: 'title', label: 'Send' },
    { type: 'item', label: 'Message', icon: <MessageIcon />, isDefault: true, onSelect: () => open({ kind: 'message', uin: row.uin }) },
  ];
  if (row.inList && hasStatusMessage(row.status)) {
    items.push({
      type: 'item',
      label: READ_AWAY_LABEL[row.status],
      icon: <StatusIcon status={row.status} />,
      onSelect: () => open({ kind: 'readAway', uin: row.uin }),
      disabled: !online,
    });
  }
  items.push(
    { type: 'separator' },
    { type: 'item', label: 'Message History', onSelect: () => open({ kind: 'history', uin: row.uin }), disabled: !online },
    { type: 'item', label: "User's Details", onSelect: () => open({ kind: 'userDetails', uin: row.uin }), disabled: !online },
  );
  if (!row.inList) {
    items.push({
      type: 'item',
      label: 'Add to Contact List',
      disabled: !online,
      onSelect: () => open({ kind: 'authRequest', uin: row.uin, nickname: row.nickname, mode: 'add' }),
    });
  }
  const more: MenuItem[] = [];
  if (row.inList) {
    more.push(
      { type: 'item', label: 'Rename', onSelect: startRename, disabled: !online },
      { type: 'item', label: 'Delete', onSelect: () => open({ kind: 'confirm', action: 'delete', uin: row.uin }), disabled: !online },
    );
  } else {
    more.push({
      type: 'item',
      label: 'Delete',
      onSelect: () =>
        services.store.getState().updateChat((chat) => ({ ...chat, notInList: chat.notInList.filter((e) => e.uin !== row.uin) })),
    });
  }
  more.push({
    type: 'item',
    label: 'Add To Ignore List',
    onSelect: () => open({ kind: 'confirm', action: 'ignore', uin: row.uin }),
    disabled: !online,
  });
  if (row.inList && row.awaitingAuth) {
    more.push({
      type: 'item',
      label: 'Re-Request Authorization',
      disabled: !online,
      onSelect: () => open({ kind: 'authRequest', uin: row.uin, nickname: row.nickname, mode: 'request' }),
    });
  }
  items.push({ type: 'separator' }, { type: 'submenu', label: 'More (Rename, Delete...)', items: more });
  return items;
}
