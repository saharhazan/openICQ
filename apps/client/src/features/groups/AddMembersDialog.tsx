/** "Add member": contacts who are not in the group yet; refused ones get the invite link. */
import { useEffect, useState } from 'react';
import { useApp, useServices } from '../../app/AppContext';
import { S } from '../../strings';
import { Button, Dialog } from '../../ui/Dialog';
import { pickableContacts } from './groupHelpers';
import { MemberPicker, RefusedStep } from './MemberPicker';
import './groups.css';

export function AddMembersDialog({ chatId, onClose }: { chatId: number; onClose: () => void }) {
  const { groups } = useServices();
  const users = useApp((s) => s.data.users);
  const contacts = useApp((s) => s.data.contacts);
  const [members, setMembers] = useState<ReadonlySet<number> | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [refused, setRefused] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void groups.members(chatId).then((list) => {
      if (!cancelled) setMembers(new Set((list ?? []).map((m) => m.uin)));
    });
    return () => {
      cancelled = true;
    };
  }, [chatId, groups]);

  const toggle = (uin: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(uin)) next.delete(uin);
      else next.add(uin);
      return next;
    });

  const add = async () => {
    setBusy(true);
    const result = await groups.addMembers(chatId, [...selected]);
    setBusy(false);
    if (!result) return;
    if (result.refused.length > 0) setRefused(result.refused);
    else onClose();
  };

  if (refused) {
    return (
      <Dialog title={S.groups.addMembers} onClose={onClose}>
        <RefusedStep chatId={chatId} refused={refused} onDone={onClose} />
      </Dialog>
    );
  }

  return (
    <Dialog
      title={S.groups.addMembers}
      onClose={onClose}
      width={400}
      footer={
        <>
          <Button kind="secondary" onClick={onClose}>
            {S.dialogs.cancel}
          </Button>
          <Button disabled={busy || selected.size === 0} onClick={() => void add()}>
            {S.dialogs.add}
          </Button>
        </>
      }
    >
      {members === null ? (
        <p className="list-empty" aria-busy="true" />
      ) : (
        <MemberPicker candidates={pickableContacts(users, contacts, members)} selected={selected} onToggle={toggle} />
      )}
    </Dialog>
  );
}
