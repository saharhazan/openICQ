import { LIMITS, STATUS_MESSAGE_STATUSES, type StatusMessageStatus } from '@openicq/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIcq, useServices } from '../../app/AppContext';
import { StatusIcon } from '../../ui/icons/StatusIcon';
import { PopupMenu, type MenuAnchor } from '../../ui/PopupMenu';
import { WindowFrame } from '../../ui/WindowFrame';
import { AWAY_DIALOG, STATUS_MENU_LABEL, STRINGS } from '../strings';
import './Away.css';

/** Seconds before the dialog confirms itself, unless the user starts editing. */
export const AWAY_AUTO_CLOSE_SECONDS = 10;

/** "Change / Confirm ... Message" (icq.exe dialog 2064), for every status that carries a message. */
export function AwayMessageDialog({ windowId, status }: { windowId: string; status: StatusMessageStatus }) {
  const { store, session } = useServices();
  const saved = useIcq((s) => s.settings?.awayMessages ?? null);
  const [text, setText] = useState(() => saved?.[status] ?? '');
  const [seconds, setSeconds] = useState<number | null>(AWAY_AUTO_CLOSE_SECONDS);
  const [presets, setPresets] = useState<MenuAnchor | null>(null);
  const confirmed = useRef(false);
  const textRef = useRef(text);
  const dialog = AWAY_DIALOG[status];

  const confirm = useCallback(
    (message: string) => {
      if (confirmed.current) return;
      confirmed.current = true;
      store.getState().closeWindow(windowId);
      session.setStatus(status, message).catch((error: unknown) => store.getState().reportError(error, AWAY_DIALOG[status].title));
    },
    [store, session, status, windowId],
  );

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  useEffect(() => {
    if (seconds === null) return;
    if (seconds <= 0) {
      confirm(textRef.current);
      return;
    }
    const timer = setTimeout(() => setSeconds((s) => (s === null ? null : s - 1)), 1_000);
    return () => clearTimeout(timer);
  }, [seconds, confirm]);

  const stopCountdown = () => setSeconds(null);

  return (
    <WindowFrame
      windowId={windowId}
      title={dialog.title}
      icon={<StatusIcon status={status} />}
      onClose={() => confirm(saved?.[status] ?? text)}
      minimizable={false}
      className="away-dialog"
    >
      <p className="dialog-text away-dialog__text">{dialog.text}</p>
      <textarea
        className="dialog-textarea away-dialog__edit"
        aria-label={dialog.title}
        value={text}
        maxLength={LIMITS.awayMessage}
        rows={4}
        onFocus={stopCountdown}
        onPointerDown={stopCountdown}
        onChange={(e) => {
          stopCountdown();
          setText(e.target.value);
        }}
      />
      <div className="dialog-buttons dialog-buttons--split">
        <button
          type="button"
          onClick={(e) => {
            stopCountdown();
            const rect = e.currentTarget.getBoundingClientRect();
            setPresets({ x: rect.left, y: rect.bottom });
          }}
        >
          Select Message
        </button>
        <button type="button" className="default away-dialog__ok" autoFocus onClick={() => confirm(text)}>
          {seconds === null ? 'OK' : STRINGS.closingIn(seconds)}
        </button>
      </div>
      {presets && saved ? (
        <PopupMenu
          label="Select Message"
          anchor={presets}
          onClose={() => setPresets(null)}
          items={STATUS_MESSAGE_STATUSES.map((s) => ({
            type: 'item' as const,
            label: `${STATUS_MENU_LABEL[s]}: ${saved[s].slice(0, 40)}${saved[s].length > 40 ? '...' : ''}`,
            icon: <StatusIcon status={s} />,
            onSelect: () => setText(saved[s]),
          }))}
        />
      ) : null}
    </WindowFrame>
  );
}
