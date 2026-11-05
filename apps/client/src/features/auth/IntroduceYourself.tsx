/** "Introduce yourself" (IntroduceYourself.cpp): a name and an avatar before the main window. */
import { useState, type FormEvent } from 'react';
import { LIMITS } from '@openicq/protocol';
import { useApp, useServices } from '../../app/AppContext';
import { S, fmt } from '../../strings';
import { Button } from '../../ui/Dialog';
import { TextField } from '../../ui/controls';
import { AvatarPicker } from '../settings/AvatarPicker';
import './auth.css';

/** avatar_upload context. */
const UPLOAD_PHOTO = 'Upload photo';

export function IntroduceYourself() {
  const { account, session } = useServices();
  const me = useApp((s) => s.data.me);
  const [firstName, setFirstName] = useState(me?.firstName ?? '');
  const [lastName, setLastName] = useState(me?.lastName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const first = firstName.trim();
    const last = lastName.trim();
    if (first === '') {
      setError(S.login.firstNameRequired);
      return;
    }
    if (first.length > LIMITS.personName || last.length > LIMITS.personName) {
      setError(fmt(S.profile.maxLength, LIMITS.personName));
      return;
    }
    setError(null);
    setBusy(true);
    const unchanged = me !== null && me.firstName === first && me.lastName === last;
    const ok = unchanged || (await account.updateProfile({ firstName: first, lastName: last }));
    setBusy(false);
    if (ok) session.finishIntroduce();
  };

  return (
    <div className="auth-screen">
      <form className="auth-form" noValidate onSubmit={(event) => void submit(event)} aria-labelledby="introduce-title">
        <h1 id="introduce-title" className="auth-title">
          {S.introduce.title}
        </h1>
        <p className="auth-hint">{S.introduce.subtitle}</p>
        <div className="auth-avatar">
          <AvatarPicker size={96} label={UPLOAD_PHOTO} />
        </div>
        <TextField label={S.introduce.firstName} value={firstName} onChange={setFirstName} autoFocus autoComplete="given-name" error={error} />
        <TextField label={S.introduce.lastName} value={lastName} onChange={setLastName} autoComplete="family-name" />
        <Button type="submit" wide disabled={busy}>
          {S.introduce.continue}
        </Button>
      </form>
    </div>
  );
}
