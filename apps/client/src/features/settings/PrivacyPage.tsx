/**
 * Privacy (settings/PrivacySettingsWidget.cpp, SessionsPage.cpp): who can add
 * me to groups, the session list and the ignore list (the users I blocked).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Monitor } from 'lucide-react';
import type { GroupInvitePolicy, SessionEntry } from '@openicq/protocol';
import { useApp, useServices } from '../../app/AppContext';
import { formatDate, formatTime } from '../../state/format';
import { displayName } from '../../state/selectors';
import { S, fmt } from '../../strings';
import { Avatar } from '../../ui/Avatar';
import { RadioList } from '../../ui/controls';

const POLICY_OPTIONS: ReadonlyArray<{ value: GroupInvitePolicy; label: string }> = [
  { value: 'everybody', label: S.settings.everybody },
  { value: 'contacts', label: S.settings.contactsOnly },
  { value: 'nobody', label: S.settings.nobody },
];

function GroupInvites() {
  const { account } = useServices();
  const stored = useApp((s) => s.data.settings?.groupInvites ?? 'everybody');
  const [pending, setPending] = useState<GroupInvitePolicy | null>(null);
  const choose = (value: GroupInvitePolicy) => {
    setPending(value);
    void account.setGroupInvites(value).finally(() => setPending(null));
  };
  return <RadioList label={S.settings.whoCanAdd} value={pending ?? stored} options={POLICY_OPTIONS} onChange={choose} />;
}

function when(iso: string, now: Date): string {
  const date = new Date(iso);
  return `${formatDate(date, now)} ${formatTime(date)}`;
}

function SessionList() {
  const { account, store } = useServices();
  const [sessions, setSessions] = useState<SessionEntry[] | null>(null);

  const load = useCallback(() => {
    void account.listSessions().then((list) => {
      if (list) setSessions(list);
    });
  }, [account]);

  useEffect(() => {
    load();
  }, [load]);

  const close = (target: { sessionId: number } | { others: true }, text: string) =>
    store.getState().confirm({
      title: S.settings.closeSession,
      text,
      confirmLabel: S.settings.closeSession,
      destructive: true,
      onConfirm: () => {
        void account.closeSession(target).then((ok) => {
          if (!ok) return;
          store.getState().toast(S.settings.sessionClosed);
          load();
        });
      },
    });

  const now = new Date();
  const ordered = sessions ? [...sessions].sort((a, b) => Number(b.current) - Number(a.current) || Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt)) : [];
  const others = ordered.filter((s) => !s.current);
  return (
    <section aria-labelledby="sessions-title">
      <h3 id="sessions-title" className="section-caption">
        {S.settings.sessionList}
      </h3>
      <ul className="session-list" aria-label={S.settings.activeSessions}>
        {ordered.map((session) => (
          <li key={session.id} className="session-row">
            <Monitor size={20} className="session-icon" aria-hidden="true" />
            <span className="session-text">
              <span className="session-device">{session.device}</span>
              <span className="session-meta">{session.current ? S.settings.currentSession : when(session.lastSeenAt, now)}</span>
            </span>
            {!session.current && (
              <button
                type="button"
                className="text-button text-button-danger"
                aria-label={`${S.settings.closeSession}: ${session.device}`}
                onClick={() => close({ sessionId: session.id }, fmt(S.settings.closeSessionConfirm, session.device))}
              >
                {S.settings.closeSession}
              </button>
            )}
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <button type="button" className="text-button text-button-danger session-close-all" onClick={() => close({ others: true }, S.settings.closeOthersConfirm)}>
          {S.settings.closeAllOther}
        </button>
      )}
    </section>
  );
}

function IgnoreList() {
  const { chats, store } = useServices();
  const users = useApp((s) => s.data.users);
  const blocked = useMemo(() => Object.values(users).filter((user) => user.blocked), [users]);
  return (
    <section aria-labelledby="ignore-title">
      <h3 id="ignore-title" className="section-caption">
        {S.settings.ignoreList}
      </h3>
      {blocked.length === 0 ? (
        <p className="settings-empty">{S.settings.noIgnored}</p>
      ) : (
        <ul className="ignore-list" aria-label={S.settings.ignoreList}>
          {blocked.map((user) => {
            const name = displayName(user);
            return (
              <li key={user.uin} className="ignore-row">
                <Avatar fileId={user.avatarFileId} seed={user.uin} name={name} size={32} />
                <span className="ignore-name">{name}</span>
                <button
                  type="button"
                  className="text-button"
                  aria-label={`${S.profile.unblock}: ${name}`}
                  onClick={() =>
                    store.getState().confirm({
                      title: S.settings.ignoreList,
                      text: S.settings.removeFromIgnore,
                      confirmLabel: S.profile.unblock,
                      onConfirm: () => void chats.block(user.uin, false),
                    })
                  }
                >
                  {S.profile.unblock}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function PrivacyPage() {
  return (
    <>
      <GroupInvites />
      <SessionList />
      <IgnoreList />
    </>
  );
}
