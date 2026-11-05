import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { S } from '../strings';
import './ui.css';

export interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Buttons row, right aligned (DialogButton pills). */
  footer?: ReactNode;
  width?: number;
  /** Hides the title bar text but keeps the dialog named. */
  hideTitle?: boolean;
}

/** A modal dialog (controls/GeneralDialog.cpp): 360 wide by default, pill buttons, Escape closes. */
export function Dialog({ title, onClose, children, footer, width = 360, hideTitle = false }: DialogProps) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    opener.current = document.activeElement;
    const el = ref.current;
    const first =
      el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>('input, textarea, select, button:not([data-close])');
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, []);

  return createPortal(
    <div
      className="dialog-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={ref} className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ width }}>
        <div className="dialog-header">
          <h2 id={titleId} className={hideTitle ? 'visually-hidden' : 'dialog-title'}>
            {title}
          </h2>
          <button type="button" className="icon-button dialog-close" aria-label={S.dialogs.close} data-close onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  kind?: 'primary' | 'secondary' | 'destructive';
  type?: 'button' | 'submit';
  disabled?: boolean;
  autoFocus?: boolean;
  wide?: boolean;
}

/** DialogButton: a pill, primary green, destructive red, secondary outlined. */
export function Button({ children, onClick, kind = 'primary', type = 'button', disabled, autoFocus, wide }: ButtonProps) {
  return (
    <button
      type={type}
      className={`pill-button pill-${kind}${wide ? ' pill-wide' : ''}`}
      onClick={onClick}
      disabled={disabled}
      data-autofocus={autoFocus ? true : undefined}
    >
      {children}
    </button>
  );
}

export interface ConfirmDialogProps {
  title: string;
  text: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ title, text, confirmLabel, destructive, onConfirm, onClose }: ConfirmDialogProps) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button kind="secondary" onClick={onClose}>
            {S.dialogs.cancel}
          </Button>
          <Button
            kind={destructive ? 'destructive' : 'primary'}
            autoFocus
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="dialog-text">{text}</p>
    </Dialog>
  );
}
