/** "Waiting for approval": join requests with Approve, Reject and "Approve All" (admins only). */
import { useEffect, useState } from 'react';
import { useApp, useServices } from '../../app/AppContext';
import type { JoinRequest } from '../../app/GroupCommands';
import { displayName } from '../../state/selectors';
import { S } from '../../strings';
import { Avatar } from '../../ui/Avatar';

export function GroupRequests({ chatId, pending, onChanged }: { chatId: number; pending: number; onChanged: () => void }) {
  const { groups } = useServices();
  const users = useApp((s) => s.data.users);
  const [requests, setRequests] = useState<JoinRequest[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void groups.requests(chatId).then((list) => {
      if (!cancelled) setRequests(list ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [chatId, groups, pending]);

  const resolve = async (uins: number[], approve: boolean) => {
    const results = await Promise.all(uins.map((uin) => groups.resolveRequest(chatId, uin, approve)));
    const done = new Set(uins.filter((_, i) => results[i]));
    setRequests((current) => (current ?? []).filter((r) => !done.has(r.uin)));
    if (done.size > 0) onChanged();
  };

  if (!requests || requests.length === 0) return null;
  return (
    <section className="sidebar-section" aria-label={S.groups.waitingForApproval}>
      <div className="sidebar-section-head">
        <h3 className="sidebar-caption">{S.groups.waitingForApproval}</h3>
        <button type="button" className="text-button" onClick={() => void resolve(requests.map((r) => r.uin), true)}>
          {S.groups.approveAll}
        </button>
      </div>
      <ul className="member-list">
        {requests.map((request) => {
          const name = displayName(users[request.uin], request.uin);
          return (
            <li key={request.uin} className="contact-row request-row" aria-label={name}>
              <Avatar fileId={users[request.uin]?.avatarFileId ?? null} seed={request.uin} name={name} size={32} />
              <span className="contact-name">{name}</span>
              <button type="button" className="text-button" onClick={() => void resolve([request.uin], true)}>
                {S.groups.approve}
              </button>
              <button type="button" className="text-button text-button-danger" onClick={() => void resolve([request.uin], false)}>
                {S.groups.reject}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
