import { genderSchema, LIMITS, profileUpdateSchema, type Gender, type Profile, type ProfileUpdate, type Uin } from '@openicq/protocol';
import { useCallback, useEffect, useId, useState } from 'react';
import { useIcq, useServices } from '../../app/AppContext';
import { StatusIcon } from '../../ui/icons/StatusIcon';
import { WindowFrame } from '../../ui/WindowFrame';
import { STRINGS } from '../strings';
import { windowTitle } from '../windowTitles';
import './UserDetails.css';

type Tab = 'Main' | 'More' | 'Home' | 'About';
const TABS: Tab[] = ['Main', 'More', 'Home', 'About'];

interface Form {
  nickname: string;
  firstName: string;
  lastName: string;
  email: string;
  gender: Gender;
  age: string;
  homepage: string;
  city: string;
  country: string;
  about: string;
}

function toForm(p: Profile): Form {
  return {
    nickname: p.nickname,
    firstName: p.firstName,
    lastName: p.lastName,
    email: p.email,
    gender: p.gender,
    age: p.age === null ? '' : String(p.age),
    homepage: p.homepage,
    city: p.city,
    country: p.country,
    about: p.about,
  };
}

/** Validates the editable fields with the shared protocol schema. */
export function toProfileUpdate(form: Form): { ok: true; update: ProfileUpdate } | { ok: false; message: string } {
  const age = form.age.trim() === '' ? null : Number(form.age);
  if (age !== null && (!Number.isInteger(age) || age < 0 || age > 150)) return { ok: false, message: 'Age must be a number between 0 and 150.' };
  const parsed = profileUpdateSchema.safeParse({ ...form, age });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: issue ? `${String(issue.path[0] ?? '')}: ${issue.message}` : 'Invalid details' };
  }
  return { ok: true, update: parsed.data };
}

/** "User Info %s" (icqusr.dll 9055 with the icqifdg.dll pages); editable for the owner. */
export function UserDetailsWindow({ windowId, uin }: { windowId: string; uin: Uin }) {
  const { store, commands } = useServices();
  const id = useId();
  const title = useIcq((s) => windowTitle({ kind: 'userDetails', uin }, s));
  const isSelf = useIcq((s) => s.session?.uin === uin);
  const hideEmail = useIcq((s) => s.settings?.hideEmail ?? false);
  const [tab, setTab] = useState<Tab>('Main');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [hide, setHide] = useState(hideEmail);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => store.getState().closeWindow(windowId);

  const show = useCallback((fetched: Profile | null) => {
    if (!fetched) return;
    setProfile(fetched);
    setForm(toForm(fetched));
  }, []);
  const load = () => commands.getProfile(uin).then(show);

  useEffect(() => {
    let alive = true;
    commands
      .getProfile(uin)
      .then((fetched) => {
        if (alive) show(fetched);
      })
      .catch((error: unknown) => store.getState().reportError(error, 'User Details'));
    return () => {
      alive = false;
    };
  }, [commands, store, uin, show]);

  const save = async (andClose: boolean) => {
    if (!form) return;
    const check = toProfileUpdate(form);
    if (!check.ok) {
      setProblem(check.message);
      return;
    }
    setProblem(null);
    setBusy(true);
    const saved = await commands.updateProfile(check.update);
    const savedPrivacy = saved && hide !== hideEmail ? await commands.updateSettings({ hideEmail: hide }) : saved;
    setBusy(false);
    if (saved && savedPrivacy && andClose) close();
  };
  const run = (andClose: boolean) => save(andClose).catch((error: unknown) => {
    setBusy(false);
    store.getState().reportError(error, 'User Details');
  });

  const field = (key: keyof Form, label: string, max: number) =>
    form ? (
      <>
        <label htmlFor={`${id}-${key}`}>{label}</label>
        <input
          id={`${id}-${key}`}
          type="text"
          value={form[key]}
          maxLength={max}
          readOnly={!isSelf}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
      </>
    ) : null;

  return (
    <WindowFrame windowId={windowId} title={title} icon={<StatusIcon status="logo" />} onClose={close} closeOnEscape className="user-details">
      {!form || !profile ? (
        <p className="dialog-text">{STRINGS.fetchingUser}</p>
      ) : (
        <>
          <menu role="tablist" className="user-details__tabs">
            {TABS.map((t) => (
              <li key={t} role="tab" aria-selected={t === tab}>
                <a
                  href={`#${t}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setTab(t);
                  }}
                >
                  {t}
                </a>
              </li>
            ))}
          </menu>
          <div className="window user-details__panel" role="tabpanel" aria-label={tab}>
            <div className="window-body">
              {tab === 'Main' ? (
                <>
                  <div className="field-grid">
                    {field('nickname', 'Nickname:', LIMITS.nickname)}
                    {field('firstName', 'First:', LIMITS.personName)}
                    {field('lastName', 'Last:', LIMITS.personName)}
                    <label htmlFor={`${id}-uin`}>ICQ#:</label>
                    <input id={`${id}-uin`} type="text" readOnly value={String(profile.uin)} />
                  </div>
                  <fieldset>
                    <legend>Email Addresses</legend>
                    <div className="field-grid">{field('email', 'Email:', LIMITS.email)}</div>
                    {isSelf ? (
                      <div className="field-row">
                        <input id={`${id}-hide`} type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
                        <label htmlFor={`${id}-hide`}>{"Don't publish my Email address on ICQ directories"}</label>
                      </div>
                    ) : null}
                  </fieldset>
                  <p className="dialog-text">
                    {profile.authRequired ? 'My authorization is required before users add me to their Contact List' : 'All users may add me to their Contact List'}
                  </p>
                </>
              ) : null}
              {tab === 'More' ? (
                <div className="field-grid">
                  <label htmlFor={`${id}-gender`}>Gender:</label>
                  <select id={`${id}-gender`} value={form.gender} disabled={!isSelf} onChange={(e) => {
                      const gender = genderSchema.safeParse(e.target.value);
                      if (gender.success) setForm({ ...form, gender: gender.data });
                    }}>
                    <option value="unspecified">Not specified</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                  {field('age', 'Age:', 3)}
                  {field('homepage', 'Homepage:', LIMITS.homepage)}
                </div>
              ) : null}
              {tab === 'Home' ? (
                <div className="field-grid">
                  {field('city', 'City:', LIMITS.city)}
                  {field('country', 'Country:', LIMITS.country)}
                </div>
              ) : null}
              {tab === 'About' ? (
                <textarea
                  className="dialog-textarea user-details__about"
                  aria-label="About"
                  value={form.about}
                  maxLength={LIMITS.about}
                  readOnly={!isSelf}
                  onChange={(e) => setForm({ ...form, about: e.target.value })}
                />
              ) : null}
            </div>
          </div>
          {problem ? (
            <p className="dialog-error" role="alert">
              {problem}
            </p>
          ) : null}
        </>
      )}
      <div className="dialog-buttons">
        <button type="button" disabled={busy} onClick={() => load().catch((error: unknown) => store.getState().reportError(error, 'User Details'))}>
          Update from ICQ Directory
        </button>
        <span className="dialog-spacer" />
        <button type="button" className="default" disabled={busy || !form} onClick={() => (isSelf ? run(true) : close())}>
          OK
        </button>
        <button type="button" onClick={close}>
          Cancel
        </button>
        {isSelf ? (
          <button type="button" disabled={busy || !form} onClick={() => run(false)}>
            Apply
          </button>
        ) : null}
      </div>
    </WindowFrame>
  );
}
