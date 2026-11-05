import type { Uin } from '@openicq/protocol';
import { useMemo, useState } from 'react';
import { useIcq, useServices } from '../../app/AppContext';
import { groupContacts, type ContactRow } from '../../state/contactList';
import { NoticeIcon } from '../../ui/icons/NoticeIcon';
import { StatusIcon } from '../../ui/icons/StatusIcon';
import { PopupMenu, type MenuAnchor, type MenuItem } from '../../ui/PopupMenu';
import { useBlink, useTick } from '../../ui/useTicker';
import { VerticalBanner } from '../../ui/VerticalBanner';
import { WindowFrame } from '../../ui/WindowFrame';
import { CONNECTING, STATUS_NAME, STRINGS } from '../strings';
import { windowTitle } from '../windowTitles';
import { ContactListView } from './ContactListView';
import { contactMenu, mainMenu, statusMenu } from './menus';
import './ContactList.css';

interface OpenMenu {
  kind: 'main' | 'status' | 'contact';
  anchor: MenuAnchor;
  items: MenuItem[];
}

/** The ICQ main window (icq.exe dialog 2010): the list plus the ICQ and status buttons. */
export function ContactListWindow({ windowId }: { windowId: string }) {
  const services = useServices();
  const { store, commands } = services;
  const chat = useIcq((s) => s.chat);
  const status = useIcq((s) => s.status);
  const title = useIcq((s) => windowTitle({ kind: 'contactList' }, s));
  const connecting = useIcq((s) => s.statusPending || s.connection === 'connecting' || s.connection === 'reconnecting');
  const online = useIcq((s) => s.connection === 'open' && s.status !== 'offline');
  const notices = chat.notices;
  const sections = useMemo(() => groupContacts(chat), [chat]);
  const [selected, setSelected] = useState<Uin | null>(null);
  const [renaming, setRenaming] = useState<Uin | null>(null);
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const frame = useTick(connecting, 120);
  const noticeBlink = useBlink(notices.length > 0);

  const close = () => store.getState().minimizeWindow(windowId);
  const openMessage = (row: ContactRow) => store.getState().openWindow({ kind: 'message', uin: row.uin });
  const openMenuAt = (kind: OpenMenu['kind'], button: HTMLElement, items: MenuItem[]) => {
    const rect = button.getBoundingClientRect();
    setMenu({ kind, items, anchor: { x: rect.left, y: rect.top, above: true } });
  };

  const rename = (uin: Uin, nickname: string) => {
    setRenaming(null);
    commands.renameContact(uin, nickname).catch((error: unknown) => store.getState().reportError(error, 'Rename'));
  };

  const firstNotice = notices[0];
  const statusLabel = connecting ? CONNECTING : STATUS_NAME[status];

  return (
    <WindowFrame
      windowId={windowId}
      title={title}
      icon={<StatusIcon status={connecting ? 'connecting' : status} frame={frame} />}
      onClose={close}
      resizable
      className="contact-list"
    >
      <ContactListView
        sections={sections}
        selected={selected}
        renaming={renaming}
        onSelect={setSelected}
        onOpen={openMessage}
        onMenu={(row, x, y) =>
          setMenu({ kind: 'contact', anchor: { x, y }, items: contactMenu(services, row, online, () => setRenaming(row.uin)) })
        }
        onDelete={(row) => {
          if (row.inList) store.getState().openWindow({ kind: 'confirm', action: 'delete', uin: row.uin });
        }}
        onRename={rename}
        onRenameCancel={() => setRenaming(null)}
      />
      <div className="cl-buttons">
        <button
          type="button"
          className={`cl-button cl-button--notice${firstNotice ? ' has-event' : ''}`}
          title={STRINGS.systemNotice}
          disabled={!firstNotice}
          onClick={() => {
            if (firstNotice) store.getState().openWindow({ kind: 'notice', noticeId: firstNotice.id });
          }}
        >
          {firstNotice ? <NoticeIcon off={!noticeBlink} /> : <StatusIcon status="outline" />}
          <span>System Notice</span>
        </button>
        <button
          type="button"
          className="cl-button cl-button--add"
          disabled={!online}
          onClick={() => store.getState().openWindow({ kind: 'addUser' })}
        >
          {STRINGS.addInvite}
        </button>
        <div className="cl-buttons__bottom">
          <button
            type="button"
            className={`cl-button cl-button--main${menu?.kind === 'main' ? ' is-pressed' : ''}`}
            aria-haspopup="menu"
            title={STRINGS.mainMenu}
            onClick={(e) => openMenuAt('main', e.currentTarget, mainMenu(services, selected, online))}
          >
            <span>{STRINGS.mainButton}</span>
          </button>
          <button
            type="button"
            className={`cl-button cl-button--status${menu?.kind === 'status' ? ' is-pressed' : ''}`}
            aria-haspopup="menu"
            aria-label={`Status: ${statusLabel}`}
            onClick={(e) => openMenuAt('status', e.currentTarget, statusMenu(services, status))}
          >
            <StatusIcon status={connecting ? 'connecting' : status} frame={frame} />
            <span>{statusLabel}</span>
          </button>
        </div>
      </div>
      {menu ? (
        <PopupMenu
          label={menu.kind === 'main' ? STRINGS.mainMenu : menu.kind === 'status' ? 'Online Status' : 'Contact'}
          anchor={menu.anchor}
          items={menu.items}
          banner={menu.kind === 'contact' ? undefined : <VerticalBanner text={menu.kind === 'main' ? 'openICQ' : 'ICQ'} />}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </WindowFrame>
  );
}
