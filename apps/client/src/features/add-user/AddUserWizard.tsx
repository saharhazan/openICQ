import { LIMITS, searchQuerySchema, type SearchQuery, type SearchResult } from '@openicq/protocol';
import { useId, useState } from 'react';
import { useServices } from '../../app/AppContext';
import { StatusIcon } from '../../ui/icons/StatusIcon';
import { VerticalBanner } from '../../ui/VerticalBanner';
import { WindowFrame } from '../../ui/WindowFrame';
import { ADD_USER_TITLE } from '../windowTitles';
import './AddUser.css';

type Method = 'email' | 'details' | 'uin';
type Page = 'search' | 'results';

export interface SearchForm {
  method: Method;
  email: string;
  nickname: string;
  firstName: string;
  lastName: string;
  uin: string;
}

/** Builds the search.users query from the form; messages from icqsearc.dll strings 8, 9 and 30. */
export function buildQuery(form: SearchForm): { ok: true; query: SearchQuery } | { ok: false; message: string } {
  if (form.method === 'uin') {
    if (form.uin.trim() === '') return { ok: false, message: 'No search data was entered' };
    const parsed = searchQuerySchema.safeParse({ by: 'uin', uin: Number(form.uin.trim()) });
    return parsed.success ? { ok: true, query: parsed.data } : { ok: false, message: 'This ICQ# does not exist' };
  }
  if (form.method === 'email') {
    if (form.email.trim() === '') return { ok: false, message: 'No search data was entered' };
    const parsed = searchQuerySchema.safeParse({ by: 'email', email: form.email });
    return parsed.success ? { ok: true, query: parsed.data } : { ok: false, message: 'Not a valid Email address' };
  }
  const parsed = searchQuerySchema.safeParse({ by: 'details', nickname: form.nickname, firstName: form.firstName, lastName: form.lastName });
  return parsed.success ? { ok: true, query: parsed.data } : { ok: false, message: 'The search must include\nat least one category' };
}

const EMPTY: SearchForm = { method: 'email', email: '', nickname: '', firstName: '', lastName: '', uin: '' };

/** "ICQ Global Directory - Contact List Wizard": search (page 2012), results (2011), not found (2013). */
export function AddUserWizard({ windowId }: { windowId: string }) {
  const { store, commands } = useServices();
  const id = useId();
  const [page, setPage] = useState<Page>('search');
  const [form, setForm] = useState<SearchForm>(EMPTY);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [addToList, setAddToList] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => store.getState().closeWindow(windowId);
  const set = <K extends keyof SearchForm>(key: K, value: SearchForm[K]) => setForm({ ...form, [key]: value });
  const pick = (m: Method) => () => setForm({ ...form, method: m });
  const chosen = results.find((r) => r.uin === selected) ?? null;

  const search = async () => {
    const built = buildQuery(form);
    if (!built.ok) {
      setProblem(built.message);
      return;
    }
    setProblem(null);
    setBusy(true);
    const found = await commands.search(built.query);
    setBusy(false);
    if (!found) return;
    const shown = onlineOnly ? found.filter((r) => r.online === true) : found;
    setResults(shown);
    setSelected(shown[0]?.uin ?? null);
    setPage('results');
  };

  const add = (result: SearchResult) => {
    const state = store.getState();
    state.closeWindow(windowId);
    state.openWindow({ kind: 'authRequest', uin: result.uin, nickname: result.nickname || String(result.uin), mode: 'add', authRequired: result.authRequired });
  };

  const next = () => {
    if (page === 'search') {
      search().catch((error: unknown) => {
        setBusy(false);
        store.getState().reportError(error, ADD_USER_TITLE);
      });
      return;
    }
    if (chosen && addToList) add(chosen);
  };

  const groupProps = (m: Method, legend: string) => ({
    radio: (
      <input id={`${id}-method-${m}`} type="radio" name={`${id}-method`} checked={form.method === m} onChange={pick(m)} />
    ),
    label: <label htmlFor={`${id}-method-${m}`}>{legend}</label>,
  });
  const email = groupProps('email', 'Search by Email - the preferred search criteria');
  const details = groupProps('details', 'Search by any of the following parameters');
  const byUin = groupProps('uin', 'Search by ICQ#');

  return (
    <WindowFrame windowId={windowId} title={ADD_USER_TITLE} icon={<StatusIcon status="logo" />} onClose={close} closeOnEscape className="add-user">
      <div className="add-user__main">
        <VerticalBanner text="openICQ" width={22} />
        <div className="add-user__page">
          {page === 'search' ? (
            <form
              className="add-user__page"
              onSubmit={(e) => {
                e.preventDefault();
                next();
              }}
            >
              <p className="add-user__welcome">Welcome to the ICQ Directory - Contact List Wizard</p>
              <fieldset className="add-user__group" onFocus={pick('email')}>
                <legend>
                  {email.radio}
                  {email.label}
                </legend>
                <div className="field-grid">
                  <label htmlFor={`${id}-email-in`}>EMail:</label>
                  <input id={`${id}-email-in`} type="text" maxLength={LIMITS.email} value={form.email} onChange={(e) => set('email', e.target.value)} autoFocus />
                </div>
              </fieldset>
              <fieldset className="add-user__group" onFocus={pick('details')}>
                <legend>
                  {details.radio}
                  {details.label}
                </legend>
                <div className="field-grid">
                  <label htmlFor={`${id}-nick`}>Nickname:</label>
                  <input id={`${id}-nick`} type="text" maxLength={LIMITS.nickname} value={form.nickname} onChange={(e) => set('nickname', e.target.value)} />
                  <label htmlFor={`${id}-first`}>First Name:</label>
                  <input id={`${id}-first`} type="text" maxLength={LIMITS.personName} value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
                  <label htmlFor={`${id}-last`}>Last Name:</label>
                  <input id={`${id}-last`} type="text" maxLength={LIMITS.personName} value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
                </div>
              </fieldset>
              <fieldset className="add-user__group" onFocus={pick('uin')}>
                <legend>
                  {byUin.radio}
                  {byUin.label}
                </legend>
                <div className="field-grid">
                  <label htmlFor={`${id}-uin`}>ICQ#:</label>
                  <input id={`${id}-uin`} type="text" inputMode="numeric" maxLength={10} value={form.uin} onChange={(e) => set('uin', e.target.value)} />
                </div>
              </fieldset>
              <div className="field-row">
                <input id={`${id}-online`} type="checkbox" checked={onlineOnly} onChange={(e) => setOnlineOnly(e.target.checked)} />
                <label htmlFor={`${id}-online`}>Show Only Online Usres</label>
              </div>
              <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
            </form>
          ) : null}
          {page === 'results' && results.length === 0 ? (
            <div className="add-user__page">
              <p className="add-user__welcome">No User Was Found</p>
              <p className="dialog-text">
                {"The user hasn't yet registered at the ICQ network (or his/her details don't match the details you provided). "}
              </p>
            </div>
          ) : null}
          {page === 'results' && results.length > 0 ? (
            <div className="add-user__page">
              <p className="dialog-text">{'These registered ICQ users were found.\nChoose user by left clicking and press next.'}</p>
              <div className="sunken-panel add-user__results">
                <table className="interactive" aria-label="Search results">
                  <thead>
                    <tr>
                      <th aria-label="Online" />
                      <th>Nickname</th>
                      <th>First</th>
                      <th>Last</th>
                      <th>ICQ #</th>
                      <th>Authorization</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr
                        key={r.uin}
                        className={r.uin === selected ? 'highlighted' : undefined}
                        aria-selected={r.uin === selected}
                        onClick={() => setSelected(r.uin)}
                        onDoubleClick={() => add(r)}
                      >
                        <td>{r.online === null ? null : <StatusIcon status={r.online ? 'online' : 'offline'} />}</td>
                        <td>{r.nickname}</td>
                        <td>{r.firstName}</td>
                        <td>{r.lastName}</td>
                        <td>{r.uin}</td>
                        <td>{r.authRequired ? 'Required' : 'Always'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="dialog-buttons dialog-buttons--split">
                <button type="button" disabled={!chosen} onClick={() => chosen && store.getState().openWindow({ kind: 'userDetails', uin: chosen.uin })}>
                  {"More User's Details"}
                </button>
                <button type="button" disabled={!chosen} onClick={() => chosen && store.getState().openWindow({ kind: 'message', uin: chosen.uin })}>
                  Send Message
                </button>
              </div>
              <div className="field-row">
                <input id={`${id}-add`} type="checkbox" checked={addToList} onChange={(e) => setAddToList(e.target.checked)} />
                <label htmlFor={`${id}-add`}>{"Add to contact list - to start receiving user's online/offline status and contact him/her."}</label>
              </div>
            </div>
          ) : null}
          {problem ? (
            <p className="dialog-error" role="alert" style={{ whiteSpace: 'pre-line' }}>
              {problem}
            </p>
          ) : null}
          {busy ? <p className="dialog-text">Searching the ICQ network</p> : null}
        </div>
      </div>
      <div className="dialog-buttons">
        <button type="button" disabled={page === 'search' || busy} onClick={() => setPage('search')}>
          {'< Back'}
        </button>
        <button type="button" className="default" disabled={busy || (page === 'results' && (!chosen || !addToList))} onClick={next}>
          {'Next >'}
        </button>
        <span className="dialog-spacer" />
        <button type="button" onClick={close}>
          Cancel
        </button>
      </div>
    </WindowFrame>
  );
}
