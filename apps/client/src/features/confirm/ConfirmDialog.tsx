import type { Uin } from '@openicq/protocol';
import { useState } from 'react';
import { useIcq, useServices } from '../../app/AppContext';
import { findContact } from '../../state/chat';
import type { ConfirmAction } from '../../state/windows';
import { MessageBox } from '../../ui/MessageBox';
import { STRINGS } from '../strings';
import { displayName, windowTitle } from '../windowTitles';

const IGNORE_TEXT = 'User will be moved from your Contact List to your Ignore List.  No events will be received from this user!  Are you sure?';

/** "Confirm Delete User" (dialog 1015) and "Add To Ignore List" confirmations. */
export function ConfirmDialog({ windowId, action, uin }: { windowId: string; action: ConfirmAction; uin: Uin }) {
  const { store, commands } = useServices();
  const title = useIcq((s) => windowTitle({ kind: 'confirm', action, uin }, s));
  const nick = useIcq((s) => displayName(s, uin));
  const inList = useIcq((s) => findContact(s.chat, uin) !== undefined);
  const [busy, setBusy] = useState(false);
  const close = () => store.getState().closeWindow(windowId);

  const run = async () => {
    if (action === 'delete') return commands.removeContact(uin);
    if (!(await commands.setIgnored(uin, true))) return false;
    if (inList) return commands.removeContact(uin);
    store.getState().updateChat((chat) => ({ ...chat, notInList: chat.notInList.filter((e) => e.uin !== uin) }));
    return true;
  };

  const yes = () => {
    if (busy) return;
    setBusy(true);
    run()
      .then((ok) => {
        setBusy(false);
        if (ok) close();
      })
      .catch((error: unknown) => {
        setBusy(false);
        store.getState().reportError(error, title);
      });
  };

  return (
    <MessageBox
      windowId={windowId}
      title={title}
      icon={action === 'delete' ? 'question' : 'warning'}
      buttons={[
        { label: 'Yes', onClick: yes },
        { label: 'No', onClick: close, isDefault: true },
      ]}
      onClose={close}
    >
      {action === 'delete' ? STRINGS.confirmDeleteText(nick) : IGNORE_TEXT}
    </MessageBox>
  );
}
