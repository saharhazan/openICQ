/**
 * My avatar with a button that uploads a new one (POST /api/files?purpose=avatar)
 * and saves it with profile.update. Images under 200 x 200 are refused
 * ("Image should be at least 200x200 px", sidebar/MyProfilePage.cpp).
 */
import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { useApp, useServices } from '../../app/AppContext';
import { displayName } from '../../state/selectors';
import { S } from '../../strings';
import { Avatar } from '../../ui/Avatar';
import './settings.css';

export const AVATAR_MIN_SIDE = 200;
const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp';

/** True when the picture is big enough, or when the size cannot be measured here (the server decides). */
export async function avatarBigEnough(file: Blob): Promise<boolean> {
  if (typeof createImageBitmap !== 'function') return true;
  const bitmap = await createImageBitmap(file);
  const ok = bitmap.width >= AVATAR_MIN_SIDE && bitmap.height >= AVATAR_MIN_SIDE;
  bitmap.close();
  return ok;
}

export function AvatarPicker({ size, label }: { size: number; label: string }) {
  const { account, store } = useServices();
  const me = useApp((s) => s.data.me);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      if (!(await avatarBigEnough(file))) {
        setError(S.profile.avatarTooSmall);
        return;
      }
      const attachment = await account.uploadAvatar(file);
      if (!attachment) return;
      if (await account.updateProfile({ avatarFileId: attachment.fileId })) store.getState().toast(S.profile.updated);
    } catch (failure) {
      store.getState().reportError(new Error(S.profile.avatarError, { cause: failure }));
    } finally {
      setBusy(false);
    }
  };

  if (!me) return null;
  return (
    <div className="avatar-picker">
      <Avatar fileId={me.avatarFileId} seed={me.uin} name={displayName(me) || me.firstName} size={size} />
      <button type="button" className="text-button avatar-picker-button" disabled={busy} onClick={() => input.current?.click()}>
        <Camera size={16} aria-hidden="true" />
        <span>{label}</span>
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        aria-label={label}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void upload(file);
        }}
      />
      {error && (
        <p className="error-text avatar-picker-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
