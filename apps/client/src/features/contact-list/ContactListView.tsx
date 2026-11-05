import { LIMITS, type Uin } from '@openicq/protocol';
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { ContactRow, ContactSection } from '../../state/contactList';
import { MessageIcon } from '../../ui/icons/MessageIcon';
import { StatusIcon } from '../../ui/icons/StatusIcon';
import { useBlink } from '../../ui/useTicker';
import { STATUS_NAME } from '../strings';

export interface ContactListViewProps {
  sections: ContactSection[];
  selected: Uin | null;
  renaming: Uin | null;
  onSelect: (uin: Uin) => void;
  onOpen: (row: ContactRow) => void;
  onMenu: (row: ContactRow, x: number, y: number) => void;
  onDelete: (row: ContactRow) => void;
  onRename: (uin: Uin, nickname: string) => void;
  onRenameCancel: () => void;
}

/** An unread message replaces the flower with the balloon, blinking against its white outline. */
function RowIcon({ row }: { row: ContactRow }) {
  const lit = useBlink(row.unread > 0);
  if (row.unread > 0) return <MessageIcon off={!lit} />;
  if (row.awaitingAuth) return <StatusIcon status="awaiting" />;
  return <StatusIcon status={row.inList ? row.status : 'offline'} />;
}

function RenameField({ row, onRename, onCancel }: { row: ContactRow; onRename: (uin: Uin, name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(row.nickname);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.select();
  }, []);
  const commit = () => {
    const name = value.trim();
    if (name === '' || name === row.nickname) onCancel();
    else onRename(row.uin, name);
  };
  return (
    <input
      ref={ref}
      className="cl-row__rename"
      type="text"
      aria-label="New name"
      value={value}
      maxLength={LIMITS.nickname}
      autoFocus
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') onCancel();
      }}
    />
  );
}

function tooltip(row: ContactRow): string {
  const parts = [`${row.nickname} (${row.uin})`, row.awaitingAuth ? 'Awaiting authorization' : STATUS_NAME[row.status]];
  if (row.unread > 0) parts.push(`${row.unread} unread message${row.unread === 1 ? '' : 's'}`);
  return parts.join('\n');
}

/** The white list area: section bars, one row per contact, keyboard and mouse handling. */
export function ContactListView(props: ContactListViewProps) {
  const { sections, selected, renaming, onSelect, onOpen, onMenu, onDelete, onRename, onRenameCancel } = props;
  const rows = sections.flatMap((s) => s.rows);
  const selectedRow = rows.find((r) => r.uin === selected) ?? null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (renaming !== null) return;
    const index = selectedRow ? rows.indexOf(selectedRow) : -1;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = rows[Math.min(rows.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))];
      if (next) onSelect(next.uin);
    } else if (event.key === 'Enter' && selectedRow) {
      onOpen(selectedRow);
    } else if (event.key === 'Delete' && selectedRow) {
      onDelete(selectedRow);
    } else if ((event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) && selectedRow) {
      event.preventDefault();
      const el = event.currentTarget.querySelector<HTMLElement>(`[data-uin="${selectedRow.uin}"]`);
      const rect = el?.getBoundingClientRect();
      onMenu(selectedRow, rect ? rect.left + 20 : 0, rect ? rect.bottom : 0);
    }
  };

  const contextMenu = (row: ContactRow) => (event: MouseEvent) => {
    event.preventDefault();
    onSelect(row.uin);
    onMenu(row, event.clientX, event.clientY);
  };

  return (
    <div className="cl-list" role="listbox" aria-label="Contact List" tabIndex={0} onKeyDown={onKeyDown}>
      {sections.map((section) => (
        <div key={section.id} role="group" aria-label={section.title} className={`cl-section cl-section--${section.id}`}>
          <div className="cl-section__bar" aria-hidden="true">
            <span>{section.title}</span>
          </div>
          {section.rows.map((row) => (
            <div
              key={row.uin}
              role="option"
              aria-selected={row.uin === selected}
              data-uin={row.uin}
              title={tooltip(row)}
              className={[
                'cl-row',
                `cl-row--${section.id}`,
                row.uin === selected ? 'is-selected' : '',
                row.unread > 0 ? 'has-unread' : '',
                row.awaitingAuth ? 'is-awaiting' : '',
              ].join(' ')}
              onPointerDown={(e) => {
                if (e.button === 0) onSelect(row.uin);
              }}
              onDoubleClick={() => onOpen(row)}
              onContextMenu={contextMenu(row)}
            >
              <span className="cl-row__icon">
                <RowIcon row={row} />
              </span>
              {renaming === row.uin ? (
                <RenameField row={row} onRename={onRename} onCancel={onRenameCancel} />
              ) : (
                <span className="cl-row__name">{row.nickname}</span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
