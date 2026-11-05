/** Opening #/join/<token>: a preview of the group, then Join or "Wait for join request approval". */
import { useEffect, useRef, useState } from 'react';
import type { GroupPreview } from '@openicq/protocol';
import { useServices } from '../../app/AppContext';
import { S, plural } from '../../strings';
import { Avatar } from '../../ui/Avatar';
import { Button, Dialog } from '../../ui/Dialog';
import './groups.css';

type View = { kind: 'loading' } | { kind: 'failed' } | { kind: 'preview'; group: GroupPreview; pending: boolean };

export function JoinDialog({ token, onClose }: { token: string; onClose: () => void }) {
  const { groups, store } = useServices();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    let cancelled = false;
    void groups.preview(token).then((group) => {
      if (cancelled) return;
      if (!group) {
        setView({ kind: 'failed' });
        return;
      }
      if (group.state === 'member') {
        closeRef.current();
        store.getState().openChat(group.chatId);
        return;
      }
      setView({ kind: 'preview', group, pending: group.state === 'pending' });
    });
    return () => {
      cancelled = true;
    };
  }, [token, groups, store]);

  const join = async (group: GroupPreview) => {
    setBusy(true);
    const state = await groups.join(token);
    setBusy(false);
    if (state === 'member') onClose();
    else if (state === 'pending') setView({ kind: 'preview', group, pending: true });
  };

  if (view.kind !== 'preview') {
    return (
      <Dialog
        title={S.groups.join}
        onClose={onClose}
        footer={
          view.kind === 'failed' ? (
            <Button autoFocus onClick={onClose}>
              {S.dialogs.ok}
            </Button>
          ) : undefined
        }
      >
        {view.kind === 'failed' ? <p className="dialog-text">{S.groups.linkProblem}</p> : <p className="list-empty" aria-busy="true" />}
      </Dialog>
    );
  }

  const { group, pending } = view;
  return (
    <Dialog
      title={group.title}
      onClose={onClose}
      footer={
        pending ? (
          <Button kind="secondary" autoFocus onClick={onClose}>
            {S.dialogs.close}
          </Button>
        ) : (
          <>
            <Button kind="secondary" onClick={onClose}>
              {S.dialogs.cancel}
            </Button>
            <Button autoFocus disabled={busy} onClick={() => void join(group)}>
              {S.groups.join}
            </Button>
          </>
        )
      }
    >
      <div className="join-preview">
        <Avatar fileId={group.avatarFileId} seed={group.chatId} name={group.title} size={80} />
        <p className="join-members">{plural(group.membersCount, S.header.members)}</p>
        {group.about && <p className="join-about">{group.about}</p>}
        {pending ? (
          <p className="join-note" role="status">
            {S.groups.waitApproval}
          </p>
        ) : (
          group.joinWithApproval && <p className="join-note">{S.placeholders.approvalOnly}</p>
        )}
      </div>
    </Dialog>
  );
}
