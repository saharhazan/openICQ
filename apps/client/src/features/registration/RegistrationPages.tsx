import { LIMITS, type Uin } from '@openicq/protocol';
import { useId } from 'react';
import type { RegistrationFields } from './registrationForm';

export interface Privacy {
  authRequired: boolean;
  webAware: boolean;
}

/** Page 8553: choose between a new ICQ# and an existing one. */
export function StartPage({ onNew, onExisting }: { onNew: () => void; onExisting: () => void }) {
  return (
    <div className="reg-page reg-page--start">
      <fieldset className="reg-choice">
        <button type="button" className="reg-choice__button" onClick={onNew} autoFocus>
          NEW ICQ#
        </button>
        <span>Click here to register and receive a new ICQ#.</span>
      </fieldset>
      <fieldset className="reg-choice">
        <button type="button" className="reg-choice__button" onClick={onExisting}>
          EXISTING USER
        </button>
        <span>I already have my own ICQ# and would like to use it on this computer.</span>
      </fieldset>
    </div>
  );
}

/** Page 8556: details and password. */
export function DetailsPage({ fields, onChange }: { fields: RegistrationFields; onChange: (f: RegistrationFields) => void }) {
  const id = useId();
  const set = <K extends keyof RegistrationFields>(key: K, value: RegistrationFields[K]) => onChange({ ...fields, [key]: value });
  return (
    <div className="reg-page">
      <p className="dialog-text">Enter your details so that others will easily be able to locate you on ICQ.</p>
      <p className="dialog-text">
        Note: Providing any information about yourself is voluntary. Any information you provide will be published on the ICQ
        directories and will be avalible to ICQ &amp; Internet users.
      </p>
      <fieldset>
        <legend>Details</legend>
        <div className="field-grid reg-grid">
          <label htmlFor={`${id}-first`}>First Name:</label>
          <input id={`${id}-first`} type="text" maxLength={LIMITS.personName} value={fields.firstName} onChange={(e) => set('firstName', e.target.value)} autoFocus />
          <label htmlFor={`${id}-last`}>Last Name:</label>
          <input id={`${id}-last`} type="text" maxLength={LIMITS.personName} value={fields.lastName} onChange={(e) => set('lastName', e.target.value)} />
          <label htmlFor={`${id}-nick`}>Nickname: </label>
          <input id={`${id}-nick`} type="text" maxLength={LIMITS.nickname} value={fields.nickname} onChange={(e) => set('nickname', e.target.value)} />
          <label htmlFor={`${id}-email`}>Email (i.e. john@isp.com):</label>
          <input id={`${id}-email`} type="email" maxLength={LIMITS.email} value={fields.email} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div className="field-row">
          <input id={`${id}-hide`} type="checkbox" checked={fields.hideEmail} onChange={(e) => set('hideEmail', e.target.checked)} />
          <label htmlFor={`${id}-hide`}>
            {"Don't publish my Email address on ICQ directories. Save for password retrieval purposes."}
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Password</legend>
        <p className="dialog-text">
          Select your ICQ password. We recommend using a combination of numbers and letters. Note: Retrieving a password is possible only
          if you have entered an Email address.
        </p>
        <div className="field-grid reg-grid reg-grid--narrow">
          <label htmlFor={`${id}-pw`}>Password:</label>
          <input id={`${id}-pw`} type="password" autoComplete="new-password" maxLength={LIMITS.passwordMax} value={fields.password} onChange={(e) => set('password', e.target.value)} />
          <label htmlFor={`${id}-pw2`}>Confirm Password:</label>
          <input id={`${id}-pw2`} type="password" autoComplete="new-password" maxLength={LIMITS.passwordMax} value={fields.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)} />
          <span />
          <span className="field-row">
            <input id={`${id}-save`} type="checkbox" checked={fields.savePassword} onChange={(e) => set('savePassword', e.target.checked)} />
            <label htmlFor={`${id}-save`}>Auto Save Password</label>
          </span>
        </div>
      </fieldset>
    </div>
  );
}

export interface ExistingUser {
  uin: string;
  password: string;
  savePassword: boolean;
}

/** Page 8529: sign in with an existing ICQ#. */
export function ExistingUserPage({ value, onChange }: { value: ExistingUser; onChange: (v: ExistingUser) => void }) {
  const id = useId();
  return (
    <div className="reg-page">
      <p className="dialog-text">{"Enter your existing ICQ# and password to use ICQ on this computer then just click the 'Next' button."}</p>
      <fieldset>
        <div className="field-grid reg-grid reg-grid--narrow">
          <label htmlFor={`${id}-uin`}>ICQ#:</label>
          <input id={`${id}-uin`} type="text" inputMode="numeric" maxLength={10} value={value.uin} onChange={(e) => onChange({ ...value, uin: e.target.value })} autoFocus />
          <label htmlFor={`${id}-pw`}>Password:</label>
          <input id={`${id}-pw`} type="password" autoComplete="current-password" maxLength={LIMITS.passwordMax} value={value.password} onChange={(e) => onChange({ ...value, password: e.target.value })} />
          <span />
          <span className="field-row">
            <input id={`${id}-save`} type="checkbox" checked={value.savePassword} onChange={(e) => onChange({ ...value, savePassword: e.target.checked })} />
            <label htmlFor={`${id}-save`}>Auto Save Password</label>
          </span>
        </div>
      </fieldset>
    </div>
  );
}

/** Page 8551: registration status, then the new ICQ# and the privacy settings. */
export function RegisteringPage({
  uin,
  status,
  privacy,
  onPrivacy,
  onRetry,
}: {
  uin: Uin | null;
  status: 'idle' | 'busy' | 'failed';
  privacy: Privacy;
  onPrivacy: (p: Privacy) => void;
  onRetry: () => void;
}) {
  const id = useId();
  return (
    <div className="reg-page">
      <fieldset>
        <legend>Registration Status</legend>
        <p className="reg-status" aria-live="polite">
          {uin === null && status === 'busy' ? 'Registering User' : null}
          {uin === null && status === 'failed' ? 'Could not complete registration!\nPlease check status of Internet connection.' : null}
          {uin !== null ? `Your new ICQ# is ${uin}` : null}
          {uin !== null && status === 'busy' ? '\nConnecting...' : null}
        </p>
        {uin === null && status === 'failed' ? (
          <div className="dialog-buttons dialog-buttons--center">
            <button type="button" onClick={onRetry}>
              Retry
            </button>
          </div>
        ) : null}
      </fieldset>
      {uin !== null ? (
        <>
          <fieldset>
            <legend>Your ICQ#</legend>
            <p className="reg-uin" data-testid="new-uin">
              {uin}
            </p>
            <p className="dialog-text">Your ICQ# is a unique number that identifies you as a registered ICQ user. </p>
          </fieldset>
          <p className="dialog-text">
            ICQ has registered the following Privacy &amp; Security settings for you. You may change them now or at any time via the Security
            &amp; Privacy settings in your ICQ.
          </p>
          <fieldset>
            <legend>Privacy &amp; Security Settings</legend>
            <div className="field-row">
              <input id={`${id}-all`} type="radio" name={`${id}-auth`} checked={!privacy.authRequired} onChange={() => onPrivacy({ ...privacy, authRequired: false })} />
              <label htmlFor={`${id}-all`}>All users may add me to their Contact List</label>
            </div>
            <div className="field-row">
              <input id={`${id}-auth`} type="radio" name={`${id}-auth`} checked={privacy.authRequired} onChange={() => onPrivacy({ ...privacy, authRequired: true })} />
              <label htmlFor={`${id}-auth`}>My authorization is required before users add me to their Contact List</label>
            </div>
            <div className="field-row">
              <input id={`${id}-web`} type="checkbox" checked={privacy.webAware} onChange={(e) => onPrivacy({ ...privacy, webAware: e.target.checked })} />
              <label htmlFor={`${id}-web`}>Allow others to view my online/offline status from the Web</label>
            </div>
          </fieldset>
          <p className="dialog-text">Helpful Hint: Put your ICQ# on your business card.</p>
        </>
      ) : null}
    </div>
  );
}
