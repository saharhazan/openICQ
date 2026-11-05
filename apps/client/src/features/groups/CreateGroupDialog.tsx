/**
 * Create group (GroupChatOperations.cpp): name, avatar, Join with Approval and
 * Public chat, then members. Members the server refused get the invite link.
 */
import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { LIMITS } from '@openicq/protocol';
import { useApp, useServices } from '../../app/AppContext';
import { S } from '../../strings';
import { Avatar } from '../../ui/Avatar';
import { Button, Dialog } from '../../ui/Dialog';
import { SwitchRow, TextField } from '../../ui/controls';
import { pickableContacts } from './groupHelpers';
import { MemberPicker, RefusedStep } from './MemberPicker';
import './groups.css';

type Step = { kind: 'details' } | { kind: 'members' } | { kind: 'confirmEmpty' } | { kind: 'refused'; chatId: number; refused: number[] };

const NO_EXCLUDE: ReadonlySet<number> = new Set();

export function CreateGroupDialog({ onClose }: { onClose: () => void }) {
  const { account, groups, store } = useServices();
  const users = useApp((s) => s.data.users);
  const contacts = useApp((s) => s.data.contacts);
  const [step, setStep] = useState<Step>({ kind: 'details' });
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<{ fileId: number; preview: string | null } | null>(null);
  const [joinWithApproval, setJoinWithApproval] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const trimmed = name.trim();

  const toggle = (uin: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(uin)) next.delete(uin);
      else next.add(uin);
      return next;
    });

  const create = async () => {
    setBusy(true);
    const result = await groups.create({
      name: trimmed,
      avatarFileId: avatar?.fileId ?? null,
      memberUins: [...selected],
      joinWithApproval,
      public: isPublic,
    });
    setBusy(false);
    if (!result) return;
    if (result.refused.length > 0) {
      setStep({ kind: 'refused', chatId: result.chatId, refused: result.refused });
      return;
    }
    onClose();
    store.getState().openChat(result.chatId);
  };

  const finish = (chatId: number) => {
    onClose();
    store.getState().openChat(chatId);
  };

  const pickAvatar = async (file: File) => {
    const uploaded = await account.uploadAvatar(file);
    if (!uploaded) return;
    const reader = new FileReader();
    reader.onload = () => setAvatar({ fileId: uploaded.fileId, preview: typeof reader.result === 'string' ? reader.result : null });
    reader.onerror = () => setAvatar({ fileId: uploaded.fileId, preview: null });
    reader.readAsDataURL(file);
  };

  if (step.kind === 'refused') {
    return (
      <Dialog title={S.groups.createGroup} onClose={() => finish(step.chatId)}>
        <RefusedStep chatId={step.chatId} refused={step.refused} onDone={() => finish(step.chatId)} />
      </Dialog>
    );
  }

  if (step.kind === 'confirmEmpty') {
    return (
      <Dialog
        title={S.groups.createGroup}
        onClose={onClose}
        footer={
          <>
            <Button kind="secondary" onClick={() => setStep({ kind: 'members' })}>
              {S.dialogs.cancel}
            </Button>
            <Button autoFocus disabled={busy} onClick={() => void create()}>
              {S.dialogs.create}
            </Button>
          </>
        }
      >
        <p className="dialog-text">{S.groups.noMembersConfirm}</p>
      </Dialog>
    );
  }

  if (step.kind === 'members') {
    return (
      <Dialog
        title={S.groups.createGroup}
        onClose={onClose}
        width={400}
        footer={
          <>
            <Button kind="secondary" onClick={() => setStep({ kind: 'details' })}>
              {S.dialogs.back}
            </Button>
            <Button disabled={busy} onClick={() => (selected.size === 0 ? setStep({ kind: 'confirmEmpty' }) : void create())}>
              {S.dialogs.create}
            </Button>
          </>
        }
      >
        <MemberPicker candidates={pickableContacts(users, contacts, NO_EXCLUDE)} selected={selected} onToggle={toggle} />
      </Dialog>
    );
  }

  return (
    <Dialog
      title={S.groups.createGroup}
      onClose={onClose}
      footer={
        <>
          <Button kind="secondary" onClick={onClose}>
            {S.dialogs.cancel}
          </Button>
          <Button disabled={trimmed === ''} onClick={() => setStep({ kind: 'members' })}>
            {S.dialogs.next}
          </Button>
        </>
      }
    >
      <form
        className="group-details"
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed !== '') setStep({ kind: 'members' });
        }}
      >
        <button type="button" className="avatar-picker" aria-label={S.profile.changeAvatar} onClick={() => fileInput.current?.click()}>
          <Avatar fileId={avatar?.fileId ?? null} previewUrl={avatar?.preview ?? null} seed={0} name={trimmed || S.groups.groupName} size={80} />
          <span className="avatar-picker-badge" aria-hidden="true">
            <Camera size={16} />
          </span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void pickAvatar(file);
          }}
        />
        <TextField label={S.groups.groupName} value={name} onChange={setName} maxLength={LIMITS.groupName} autoFocus />
        <SwitchRow label={S.groups.joinWithApproval} hint={S.groups.joinWithApprovalHint} checked={joinWithApproval} onChange={setJoinWithApproval} />
        <SwitchRow label={S.groups.publicChat} hint={S.groups.publicChatHint} checked={isPublic} onChange={setIsPublic} />
      </form>
    </Dialog>
  );
}
