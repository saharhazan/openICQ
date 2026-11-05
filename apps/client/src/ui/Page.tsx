import type { ReactNode } from 'react';
import { ChevronLeft, X } from 'lucide-react';
import { S } from '../strings';
import './ui.css';
import './page.css';

export interface PageProps {
  title: string;
  children: ReactNode;
  /** Shows a back arrow (nested settings and sidebar pages). */
  onBack?: () => void;
  /** Shows a close cross on the right (the sidebar). */
  onClose?: () => void;
  actions?: ReactNode;
  /** The landmark name; defaults to the title. */
  label?: string;
}

/** A main-area or sidebar page: a 56 px header with the title, then scrolling content. */
export function Page({ title, children, onBack, onClose, actions, label }: PageProps) {
  return (
    <section className="page" aria-label={label ?? title}>
      <header className="page-header">
        {onBack && (
          <button type="button" className="icon-button" aria-label={S.header.back} onClick={onBack}>
            <ChevronLeft size={24} />
          </button>
        )}
        <h2 className="page-title">{title}</h2>
        {actions}
        {onClose && (
          <button type="button" className="icon-button" aria-label={S.dialogs.close} onClick={onClose}>
            <X size={22} />
          </button>
        )}
      </header>
      <div className="page-body">{children}</div>
    </section>
  );
}

/** A clickable row with an icon tile, label and optional value (settings and sidebars). */
export function ActionRow({
  icon,
  label,
  value,
  onClick,
  danger,
  tile,
}: {
  icon?: ReactNode;
  label: string;
  value?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  /** Background colour of a 32 px rounded tile behind the icon (the settings list). */
  tile?: string;
}) {
  const content = (
    <>
      {icon && (
        <span className={tile ? 'row-tile' : 'row-icon'} style={tile ? { background: tile } : undefined} aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="row-label">{label}</span>
      {value !== undefined && (
        <>
          {/* Keeps "Nickname, sahar" apart in the accessible name. */}
          <span className="visually-hidden">, </span>
          <span className="row-value">{value}</span>
        </>
      )}
    </>
  );
  return onClick ? (
    <button type="button" className={`action-row${danger ? ' action-row-danger' : ''}`} onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="action-row action-row-static">{content}</div>
  );
}
