import type { ReactNode } from 'react';
import { DialogIcon, type DialogIconKind } from './icons/DialogIcon';
import { WindowFrame } from './WindowFrame';
import './Dialog.css';

export interface MessageBoxButton {
  label: string;
  onClick: () => void;
  isDefault?: boolean;
}

export interface MessageBoxProps {
  windowId: string;
  title: string;
  icon: DialogIconKind;
  children: ReactNode;
  buttons: MessageBoxButton[];
  onClose: () => void;
}

/** A Win32 MessageBox: icon, text and a centred row of buttons. */
export function MessageBox({ windowId, title, icon, children, buttons, onClose }: MessageBoxProps) {
  return (
    <WindowFrame windowId={windowId} title={title} onClose={onClose} minimizable={false} closeOnEscape className="message-box">
      <div className="message-box__content">
        <DialogIcon kind={icon} />
        <div className="message-box__text">{children}</div>
      </div>
      <div className="dialog-buttons dialog-buttons--center">
        {buttons.map((b, i) => (
          <button key={b.label} type="button" className={b.isDefault ? 'default' : undefined} autoFocus={b.isDefault ?? i === 0} onClick={b.onClick}>
            {b.label}
          </button>
        ))}
      </div>
    </WindowFrame>
  );
}
