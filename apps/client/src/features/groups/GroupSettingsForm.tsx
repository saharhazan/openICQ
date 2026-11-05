/** "Group settings" for admins: name, avatar, about, rules, Join with Approval, Public chat. */
import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { LIMITS, type Chat } from '@openicq/protocol';
import { useServices } from '../../app/AppContext';
import { S } from '../../strings';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Dialog';
import { SwitchRow, TextField } from '../../ui/controls';
import type { GroupUpdate } from '../../app/GroupCommands';

export function GroupSettingsForm({ chat, onDone }: { chat: Chat; onDone: () => void }) {
  const { groups, account } = useServices();
  const group = chat.group;
  const [name, setName] = useState(chat.title);
  const [about, setAbout] = useState(group?.about ?? '');
  const [rules, setRules] = useState(group?.rules ?? '');
  const [joinWithApproval, setJoinWithApproval] = useState(group?.joinWithApproval ?? false);
  const [isPublic, setIsPublic] = useState(group?.public ?? false);
  const [avatarFileId, setAvatarFileId] = useState(chat.avatarFileId);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const apply = async () => {
    const change: GroupUpdate = {};
    if (name.trim() !== chat.title) change.name = name.trim();
    if (about !== (group?.about ?? '')) change.about = about;
    if (rules !== (group?.rules ?? '')) change.rules = rules;
    if (joinWithApproval !== group?.joinWithApproval) change.joinWithApproval = joinWithApproval;
    if (isPublic !== group?.public) change.public = isPublic;
    if (avatarFileId !== chat.avatarFileId) change.avatarFileId = avatarFileId;
    if (Object.keys(change).length === 0) {
      onDone();
      return;
    }
    setBusy(true);
    const ok = await groups.update(chat.id, change);
    setBusy(false);
    if (ok) onDone();
  };

  return (
    <form
      className="group-details"
      onSubmit={(event) => {
        event.preventDefault();
        void apply();
      }}
    >
      <button type="button" className="avatar-picker" aria-label={S.profile.changeAvatar} onClick={() => fileInput.current?.click()}>
        <Avatar fileId={avatarFileId} seed={chat.id} name={name || chat.title} size={80} />
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
          if (!file) return;
          void account.uploadAvatar(file).then((uploaded) => {
            if (uploaded) setAvatarFileId(uploaded.fileId);
          });
        }}
      />
      <TextField label={S.groups.groupName} value={name} onChange={setName} maxLength={LIMITS.groupName} />
      <TextField label={S.groups.aboutGroup} value={about} onChange={setAbout} maxLength={LIMITS.groupAbout} multiline />
      <TextField label={S.groups.rules} value={rules} onChange={setRules} maxLength={LIMITS.groupRules} multiline />
      <SwitchRow label={S.groups.joinWithApproval} hint={S.groups.joinWithApprovalHint} checked={joinWithApproval} onChange={setJoinWithApproval} />
      <SwitchRow label={S.groups.publicChat} hint={S.groups.publicChatHint} checked={isPublic} onChange={setIsPublic} />
      <div className="form-actions">
        <Button kind="secondary" onClick={onDone}>
          {S.dialogs.cancel}
        </Button>
        <Button type="submit" disabled={busy || name.trim() === ''}>
          {S.groups.apply}
        </Button>
      </div>
    </form>
  );
}
