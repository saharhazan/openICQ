import { useIcq } from '../app/AppContext';
import type { WindowSpec } from '../state/windows';
import { MessageIcon } from './icons/MessageIcon';
import { StatusIcon } from './icons/StatusIcon';

/** The small caption/taskbar icon of a window. */
export function WindowIcon({ spec }: { spec: WindowSpec }) {
  const status = useIcq((s) => (s.session ? s.status : 'offline'));
  if (spec.kind === 'message' || spec.kind === 'history') return <MessageIcon />;
  if (spec.kind === 'contactList') return <StatusIcon status={status} />;
  return <StatusIcon status="logo" />;
}
