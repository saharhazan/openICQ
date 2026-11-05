import type { Preferences } from '@openicq/protocol';
import { useId, useState } from 'react';
import { useIcq, useServices } from '../../app/AppContext';
import { StatusIcon } from '../../ui/icons/StatusIcon';
import { WindowFrame } from '../../ui/WindowFrame';
import { windowTitle } from '../windowTitles';
import { PrefsFrame } from './PrefsFrame';

type Page = 'events' | 'status';
const PAGES = [
  { id: 'events', label: 'Events' },
  { id: 'status', label: 'Status Mode' },
] as const satisfies ReadonlyArray<{ id: Page; label: string }>;

/** Range of the auto-away spin boxes allowed by the protocol. */
const MAX_MINUTES = 240;

interface Draft {
  soundsEnabled: boolean;
  popupIncoming: boolean;
  awayOn: boolean;
  awayMinutes: string;
  naOn: boolean;
  naMinutes: string;
}

function toDraft(p: Preferences): Draft {
  return {
    soundsEnabled: p.soundsEnabled,
    popupIncoming: p.popupIncoming,
    awayOn: p.autoAwayMinutes > 0,
    awayMinutes: String(p.autoAwayMinutes > 0 ? p.autoAwayMinutes : 10),
    naOn: p.autoNaMinutes > 0,
    naMinutes: String(p.autoNaMinutes > 0 ? p.autoNaMinutes : 20),
  };
}

/** Turns the page state into server preferences; minutes must be whole numbers 1 to 240. */
export function draftToPreferences(d: Draft): { ok: true; value: Preferences } | { ok: false; message: string } {
  const minutes = (on: boolean, text: string, label: string): number | string => {
    if (!on) return 0;
    const n = Number(text);
    return Number.isInteger(n) && n >= 1 && n <= MAX_MINUTES ? n : `${label}: enter whole minutes from 1 to ${MAX_MINUTES}.`;
  };
  const away = minutes(d.awayOn, d.awayMinutes, 'Set "Away" status after');
  const na = minutes(d.naOn, d.naMinutes, 'Set "N/A" status after');
  if (typeof away === 'string') return { ok: false, message: away };
  if (typeof na === 'string') return { ok: false, message: na };
  return { ok: true, value: { soundsEnabled: d.soundsEnabled, popupIncoming: d.popupIncoming, autoAwayMinutes: away, autoNaMinutes: na } };
}

/** "Owner Preferences For: %s": Events (icqstdlg.dll 3038) and Status Mode (3018). */
export function PreferencesWindow({ windowId }: { windowId: string }) {
  const { store, commands } = useServices();
  const id = useId();
  const title = useIcq((s) => windowTitle({ kind: 'preferences' }, s));
  const saved = useIcq((s) => s.settings?.preferences ?? null);
  const [page, setPage] = useState<Page>('events');
  const [draft, setDraft] = useState<Draft | null>(() => (saved ? toDraft(saved) : null));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const close = () => store.getState().closeWindow(windowId);
  const change = (next: Partial<Draft>) => {
    if (!draft) return;
    setDraft({ ...draft, ...next });
    setDirty(true);
  };

  const apply = async (andClose: boolean) => {
    if (!draft) return;
    const check = draftToPreferences(draft);
    if (!check.ok) {
      setProblem(check.message);
      return;
    }
    setProblem(null);
    if (!dirty) {
      if (andClose) close();
      return;
    }
    setBusy(true);
    const ok = await commands.updateSettings({ preferences: check.value });
    setBusy(false);
    if (!ok) return;
    setDirty(false);
    if (andClose) close();
  };
  const run = (andClose: boolean) => {
    apply(andClose).catch((error: unknown) => {
      setBusy(false);
      store.getState().reportError(error, 'ICQ Preferences');
    });
  };

  return (
    <WindowFrame windowId={windowId} title={title} icon={<StatusIcon status="logo" />} onClose={close} closeOnEscape className="prefs">
      <PrefsFrame pages={PAGES} current={page} onPage={setPage} busy={busy} dirty={dirty} onOk={() => run(true)} onCancel={close} onApply={() => run(false)} problem={problem}>
        {!draft ? <p className="dialog-text">You are currently not connected to the ICQ Network.</p> : null}
        {draft && page === 'events' ? (
          <fieldset>
            <p className="dialog-text">The following general options apply to all ICQ events:</p>
            <div className="field-row">
              <input id={`${id}-blink`} type="radio" name={`${id}-incoming`} checked={!draft.popupIncoming} onChange={() => change({ popupIncoming: false })} />
              <label htmlFor={`${id}-blink`}>Blink incoming event on Contact List</label>
            </div>
            <div className="field-row">
              <input id={`${id}-popup`} type="radio" name={`${id}-incoming`} checked={draft.popupIncoming} onChange={() => change({ popupIncoming: true })} />
              <label htmlFor={`${id}-popup`}>Pop-Up incoming event on the Desktop</label>
            </div>
            <div className="field-row">
              <input id={`${id}-sound`} type="checkbox" checked={draft.soundsEnabled} onChange={(e) => change({ soundsEnabled: e.target.checked })} />
              <label htmlFor={`${id}-sound`}>Play a sound upon receipt of an event</label>
            </div>
          </fieldset>
        ) : null}
        {draft && page === 'status' ? (
          <fieldset>
            <legend>Availability-Status Mode Settings</legend>
            <div className="prefs__minutes">
              <input id={`${id}-away`} type="checkbox" checked={draft.awayOn} onChange={(e) => change({ awayOn: e.target.checked })} />
              <label htmlFor={`${id}-away`}>Set &quot;Away&quot; status after</label>
              <input type="number" min={1} max={MAX_MINUTES} aria-label="Away minutes" value={draft.awayMinutes} disabled={!draft.awayOn} onChange={(e) => change({ awayMinutes: e.target.value })} />
              <span>minutes of not using the computer </span>
            </div>
            <div className="prefs__minutes">
              <input id={`${id}-na`} type="checkbox" checked={draft.naOn} disabled={!draft.awayOn} onChange={(e) => change({ naOn: e.target.checked })} />
              <label htmlFor={`${id}-na`}>Set &quot;N/A&quot; status after</label>
              <input type="number" min={1} max={MAX_MINUTES} aria-label="N/A minutes" value={draft.naMinutes} disabled={!draft.awayOn || !draft.naOn} onChange={(e) => change({ naMinutes: e.target.value })} />
              <span>minutes of &quot;Away&quot; mode</span>
            </div>
          </fieldset>
        ) : null}
      </PrefsFrame>
    </WindowFrame>
  );
}
