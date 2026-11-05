import type { Uin } from '@openicq/protocol';
import { useState } from 'react';
import { useServices } from '../../app/AppContext';
import { StatusIcon } from '../../ui/icons/StatusIcon';
import { VerticalBanner } from '../../ui/VerticalBanner';
import { WindowFrame } from '../../ui/WindowFrame';
import { validateLogin } from '../login/loginForm';
import { REGISTRATION_TITLE } from '../windowTitles';
import { DetailsPage, ExistingUserPage, RegisteringPage, StartPage, type Privacy } from './RegistrationPages';
import { validateRegistration, type RegistrationFields } from './registrationForm';
import './RegistrationWizard.css';

type Page = 'start' | 'details' | 'registering' | 'existing';

const EMPTY_FIELDS: RegistrationFields = {
  nickname: '',
  firstName: '',
  lastName: '',
  email: '',
  hideEmail: false,
  password: '',
  confirmPassword: '',
  savePassword: false,
};

/** "ICQ Registration" wizard (icqreg.dll dialog 3017 and its pages). */
export function RegistrationWizard({ windowId }: { windowId: string }) {
  const { store, session, commands } = useServices();
  const [page, setPage] = useState<Page>('start');
  const [fields, setFields] = useState<RegistrationFields>(EMPTY_FIELDS);
  const [existing, setExisting] = useState({ uin: '', password: '', savePassword: false });
  const [privacy, setPrivacy] = useState<Privacy>({ authRequired: false, webAware: false });
  const [problem, setProblem] = useState<string | null>(null);
  const [newUin, setNewUin] = useState<Uin | null>(null);
  const [status, setStatus] = useState<'idle' | 'busy' | 'failed'>('idle');

  const close = () => store.getState().closeWindow(windowId);
  const report = (error: unknown) => {
    setStatus('failed');
    store.getState().reportError(error, REGISTRATION_TITLE);
  };

  const register = async () => {
    const check = validateRegistration(fields);
    if (!check.ok) {
      setProblem(check.message);
      return;
    }
    setProblem(null);
    setPage('registering');
    setStatus('busy');
    const uin = await session.register(check.body);
    if (uin === null) {
      setStatus('failed');
      return;
    }
    setNewUin(uin);
    setStatus('idle');
  };

  const connectNewUser = async () => {
    if (newUin === null) return;
    setStatus('busy');
    const outcome = await session.login({ uin: newUin, password: fields.password, remember: fields.savePassword });
    if (outcome !== 'connected') {
      setStatus('failed');
      return;
    }
    // Privacy choices are shown after registering, as in the original; apply the ones that differ.
    const settings = store.getState().settings;
    const update = {
      ...(settings?.authRequired !== privacy.authRequired ? { authRequired: privacy.authRequired } : {}),
      ...(settings?.webAware !== privacy.webAware ? { webAware: privacy.webAware } : {}),
      ...(fields.hideEmail && !settings?.hideEmail ? { hideEmail: true } : {}),
    };
    if (Object.keys(update).length > 0) await commands.updateSettings(update);
  };

  const connectExisting = async () => {
    const check = validateLogin(existing);
    if (!check.ok) {
      setProblem(check.message);
      return;
    }
    setProblem(null);
    setStatus('busy');
    const outcome = await session.login(check.body);
    if (outcome === 'rejected' || outcome === 'failed') setStatus('idle');
  };

  const next = () => {
    const run = page === 'details' ? register : page === 'existing' ? connectExisting : connectNewUser;
    run().catch(report);
  };

  const canBack = page === 'details' || page === 'existing';
  const canNext = status !== 'busy' && (page === 'details' || page === 'existing' || (page === 'registering' && newUin !== null));

  return (
    <WindowFrame windowId={windowId} title={REGISTRATION_TITLE} icon={<StatusIcon status="logo" />} onClose={close} className="reg-wizard">
      <div className="reg-wizard__main">
        <VerticalBanner text="openICQ" width={50} flowerSize={32} />
        <div className="reg-wizard__page">
          {page === 'start' ? (
            <StartPage
              onNew={() => {
                setProblem(null);
                setPage('details');
              }}
              onExisting={() => {
                setProblem(null);
                setPage('existing');
              }}
            />
          ) : null}
          {page === 'details' ? <DetailsPage fields={fields} onChange={setFields} /> : null}
          {page === 'existing' ? <ExistingUserPage value={existing} onChange={setExisting} /> : null}
          {page === 'registering' ? (
            <RegisteringPage
              uin={newUin}
              status={status}
              privacy={privacy}
              onPrivacy={setPrivacy}
              onRetry={() => register().catch(report)}
            />
          ) : null}
          {problem ? (
            <p className="dialog-error reg-wizard__problem" role="alert">
              {problem}
            </p>
          ) : null}
        </div>
      </div>
      <div className="reg-wizard__rule" />
      <div className="reg-wizard__nav">
        <button type="button" className="reg-wizard__navbtn reg-wizard__navbtn--back" disabled={!canBack || status === 'busy'} onClick={() => setPage('start')}>
          <span className="reg-wizard__arrow reg-wizard__arrow--left" aria-hidden="true" />
          Back
        </button>
        <span className="dialog-spacer" />
        <button type="button" onClick={close} disabled={status === 'busy'}>
          Cancel
        </button>
        <button type="button" className="reg-wizard__navbtn default" disabled={!canNext} onClick={next}>
          Next
          <span className="reg-wizard__arrow reg-wizard__arrow--right" aria-hidden="true" />
        </button>
      </div>
    </WindowFrame>
  );
}
