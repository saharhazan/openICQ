/**
 * My profile (sidebar/MyProfilePage.cpp): avatar, name, About me, nickname,
 * email, ICQ#, password and Sign out. Each field opens its own small dialog,
 * as the original's Edit name / Edit description / nickname editors did.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { AtSign, Hash, KeyRound, LogOut, Mail, Pencil, UserRound } from 'lucide-react';
import { LIMITS, type Me } from '@openicq/protocol';
import { useApp, useServices } from '../../app/AppContext';
import { displayName } from '../../state/selectors';
import { S, fmt } from '../../strings';
import { ActionRow } from '../../ui/Page';
import { Button, Dialog } from '../../ui/Dialog';
import { TextField } from '../../ui/controls';
import { AvatarPicker } from '../settings/AvatarPicker';
import { NicknameField, canSaveNickname, useNicknameCheck } from './NicknameField';

type Editor = 'name' | 'about' | 'nickname' | 'password' | null;

/** profile_edit_dialogs context. */
const EDIT_DESCRIPTION = 'Edit description';

function FormDialog({ title, onClose, onSubmit, busy, canSave = true, children }: {
  title: string;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  busy: boolean;
  canSave?: boolean;
  children: ReactNode;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!busy && canSave) void onSubmit();
  };
  return (
    <Dialog title={title} onClose={onClose}>
      <form noValidate onSubmit={submit}>
        {children}
        <div className="dialog-footer form-dialog-footer">
          <Button kind="secondary" onClick={onClose}>
            {S.dialogs.cancel}
          </Button>
          <Button type="submit" disabled={busy || !canSave}>
            {S.dialogs.save}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function useSave(onDone: () => void) {
  const { account, store } = useServices();
  const [busy, setBusy] = useState(false);
  const save = async (change: Parameters<typeof account.updateProfile>[0]) => {
    setBusy(true);
    const ok = await account.updateProfile(change);
    setBusy(false);
    if (!ok) return;
    store.getState().toast(S.profile.updated);
    onDone();
  };
  return { busy, save };
}

function NameDialog({ me, onClose }: { me: Me; onClose: () => void }) {
  const [firstName, setFirstName] = useState(me.firstName);
  const [lastName, setLastName] = useState(me.lastName);
  const [error, setError] = useState<string | null>(null);
  const { busy, save } = useSave(onClose);
  return (
    <FormDialog
      title={S.profile.editName}
      onClose={onClose}
      busy={busy}
      onSubmit={async () => {
        if (firstName.trim() === '') {
          setError(S.login.firstNameRequired);
          return;
        }
        await save({ firstName: firstName.trim(), lastName: lastName.trim() });
      }}
    >
      <TextField label={S.profile.firstName} value={firstName} onChange={setFirstName} maxLength={LIMITS.personName} error={error} autoFocus />
      <TextField label={S.profile.lastName} value={lastName} onChange={setLastName} maxLength={LIMITS.personName} />
    </FormDialog>
  );
}

function AboutDialog({ me, onClose }: { me: Me; onClose: () => void }) {
  const [about, setAbout] = useState(me.about);
  const { busy, save } = useSave(onClose);
  return (
    <FormDialog title={EDIT_DESCRIPTION} onClose={onClose} busy={busy} onSubmit={() => save({ about })}>
      <TextField label={S.profile.aboutMe} value={about} onChange={setAbout} maxLength={LIMITS.about} multiline counter hint={S.profile.aboutHint} autoFocus />
    </FormDialog>
  );
}

function NicknameDialog({ me, onClose }: { me: Me; onClose: () => void }) {
  const [value, setValue] = useState(me.nickname ?? '');
  const status = useNicknameCheck(value, me.nickname);
  const { busy, save } = useSave(onClose);
  return (
    <FormDialog
      title={S.profile.nickname}
      onClose={onClose}
      busy={busy}
      canSave={canSaveNickname(status)}
      onSubmit={() => save({ nickname: status.kind === 'empty' ? null : value.trim().toLowerCase() })}
    >
      <p className="profile-dialog-intro">{S.profile.nicknameIntro}</p>
      <NicknameField value={value} onChange={setValue} status={status} autoFocus />
      <p className="profile-dialog-hint">{S.profile.nicknameHint}</p>
      <p className="profile-dialog-hint">{S.profile.nicknameChars}</p>
    </FormDialog>
  );
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const { account, store } = useServices();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string }>({});
  const [busy, setBusy] = useState(false);
  return (
    <FormDialog
      title={S.profile.changePassword}
      onClose={onClose}
      busy={busy}
      onSubmit={async () => {
        if (current === '') {
          setErrors({ current: S.login.loginRequired });
          return;
        }
        if (next.length < LIMITS.passwordMin) {
          setErrors({ next: fmt(S.profile.minLength, LIMITS.passwordMin) });
          return;
        }
        if (next.length > LIMITS.passwordMax) {
          setErrors({ next: fmt(S.profile.maxLength, LIMITS.passwordMax) });
          return;
        }
        setErrors({});
        setBusy(true);
        const result = await account.changePassword(current, next);
        setBusy(false);
        if (result === 'wrong') setErrors({ current: S.profile.wrongPassword });
        if (result !== 'ok') return;
        store.getState().toast(S.profile.passwordChanged);
        onClose();
      }}
    >
      <TextField label={S.profile.currentPassword} value={current} onChange={setCurrent} type="password" autoComplete="current-password" error={errors.current} autoFocus />
      <TextField label={S.profile.newPassword} value={next} onChange={setNext} type="password" autoComplete="new-password" error={errors.next} />
    </FormDialog>
  );
}

export function MyProfilePage() {
  const { session, store } = useServices();
  const me = useApp((s) => s.data.me);
  const [editor, setEditor] = useState<Editor>(null);
  if (!me) return null;
  const close = () => setEditor(null);
  const name = displayName(me);
  return (
    <div className="my-profile">
      <div className="my-profile-head">
        <AvatarPicker size={96} label={S.profile.changeAvatar} />
        <p className="my-profile-name">{name}</p>
      </div>
      <ActionRow icon={<UserRound size={20} />} label={S.profile.editName} value={name} onClick={() => setEditor('name')} />
      <ActionRow
        icon={<Pencil size={20} />}
        label={S.profile.aboutMe}
        value={me.about ? me.about : S.profile.addDescription}
        onClick={() => setEditor('about')}
      />
      <ActionRow
        icon={<AtSign size={20} />}
        label={S.profile.nickname}
        value={me.nickname ? `@${me.nickname}` : S.profile.addNickname}
        onClick={() => setEditor('nickname')}
      />
      <ActionRow icon={<Mail size={20} />} label={S.profile.email} value={me.email || '-'} />
      <ActionRow icon={<Hash size={20} />} label={S.profile.icqNumber} value={String(me.uin)} />
      <ActionRow icon={<KeyRound size={20} />} label={S.profile.changePassword} onClick={() => setEditor('password')} />
      <ActionRow
        icon={<LogOut size={20} />}
        label={S.profile.signOut}
        danger
        onClick={() =>
          store.getState().confirm({
            title: S.profile.signOut,
            text: S.dialogs.signOutConfirm,
            confirmLabel: S.dialogs.signOut,
            destructive: true,
            onConfirm: () => void session.signOut(),
          })
        }
      />
      {editor === 'name' && <NameDialog me={me} onClose={close} />}
      {editor === 'about' && <AboutDialog me={me} onClose={close} />}
      {editor === 'nickname' && <NicknameDialog me={me} onClose={close} />}
      {editor === 'password' && <PasswordDialog onClose={close} />}
    </div>
  );
}
