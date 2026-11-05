/** The handler map: one small function per request type, delegating to the application services. */
import type { AuthService } from '../../application/auth-service.ts';
import type { ContactService } from '../../application/contact-service.ts';
import type { DirectoryService } from '../../application/directory-service.ts';
import type { MessagingService } from '../../application/messaging-service.ts';
import type { PresenceService } from '../../application/presence-service.ts';
import type { SessionService } from '../../application/session-service.ts';
import type { SettingsService } from '../../application/settings-service.ts';
import { DomainError } from '../../domain/errors.ts';
import type { Clock } from '../../domain/ports.ts';
import { SlidingWindowRateLimiter } from '../rate-limiter.ts';
import type { ConnectionLifecycle } from './connection-lifecycle.ts';
import type { RequestHandlers } from './request-router.ts';

export const MESSAGE_RATE_LIMITED = 'You are sending messages too fast. Please wait a moment and try again.';
export const PASSWORD_RATE_LIMITED = 'Too many password change attempts. Please wait a while and try again.';

/**
 * Limits are kept per UIN rather than per socket, so reconnecting does not
 * reset them (there is only one live connection per UIN anyway).
 */
const MESSAGE_LIMIT = { attempts: 10, windowMs: 10_000 } as const;
/** Each attempt costs a scrypt verification. */
const PASSWORD_CHANGE_LIMIT = { attempts: 5, windowMs: 15 * 60 * 1000 } as const;

export interface ApplicationServices {
  readonly auth: AuthService;
  readonly session: SessionService;
  readonly presence: PresenceService;
  readonly contacts: ContactService;
  readonly messaging: MessagingService;
  readonly directory: DirectoryService;
  readonly settings: SettingsService;
}

export function createRequestHandlers(
  services: ApplicationServices,
  lifecycle: ConnectionLifecycle,
  clock: Clock,
): RequestHandlers {
  const { auth, session, presence, contacts, messaging, directory, settings } = services;
  const now = () => clock.now().getTime();
  const messageLimiter = new SlidingWindowRateLimiter(MESSAGE_LIMIT.attempts, MESSAGE_LIMIT.windowMs, now);
  const passwordLimiter = new SlidingWindowRateLimiter(PASSWORD_CHANGE_LIMIT.attempts, PASSWORD_CHANGE_LIMIT.windowMs, now);
  return {
    'session.start': ({ connection }, { status }) => {
      lifecycle.activate(connection);
      return session.start(connection.uin, status);
    },
    'status.set': ({ uin }, { status, awayMessage }) => ({ status: presence.setStatus(uin, status, awayMessage) }),
    'contact.add': ({ uin }, payload) => ({ contact: contacts.add(uin, payload) }),
    'contact.remove': ({ uin }, payload) => {
      contacts.remove(uin, payload.uin);
      return {};
    },
    'contact.rename': ({ uin }, payload) => ({ contact: contacts.rename(uin, payload.uin, payload.nickname) }),
    'auth.request': ({ uin }, payload) => {
      contacts.requestAuth(uin, payload.uin, payload.reason);
      return {};
    },
    'auth.respond': ({ uin }, { noticeId, grant, reason }) => {
      contacts.respondAuth(uin, noticeId, grant, reason);
      return {};
    },
    'notice.dismiss': ({ uin }, { noticeId }) => {
      contacts.dismissNotice(uin, noticeId);
      return {};
    },
    'message.send': ({ uin }, { to, text, urgent }) => {
      if (!messageLimiter.attempt(String(uin)).allowed) throw new DomainError('rate_limited', MESSAGE_RATE_LIMITED);
      return messaging.send(uin, to, text, urgent);
    },
    'message.markRead': ({ uin }, { from }) => ({ count: messaging.markRead(uin, from) }),
    'history.get': ({ uin }, payload) => messaging.history(uin, payload.uin, payload.beforeId, payload.limit),
    'search.users': ({ uin }, query) => ({ results: directory.search(uin, query) }),
    'profile.get': ({ uin }, payload) => ({ profile: directory.getProfile(uin, payload.uin) }),
    'profile.update': ({ uin }, update) => ({ profile: directory.updateProfile(uin, update) }),
    'away.get': ({ uin }, payload) => directory.getAway(uin, payload.uin),
    'settings.update': ({ uin }, update) => ({ settings: settings.update(uin, update) }),
    'ignore.add': ({ uin }, payload) => {
      settings.ignore(uin, payload.uin);
      return {};
    },
    'ignore.remove': ({ uin }, payload) => {
      settings.unignore(uin, payload.uin);
      return {};
    },
    'password.change': async ({ uin, connection }, { currentPassword, newPassword }) => {
      if (!passwordLimiter.attempt(String(uin)).allowed) throw new DomainError('rate_limited', PASSWORD_RATE_LIMITED);
      await auth.changePassword(uin, connection.tokenHash, currentPassword, newPassword);
      lifecycle.endOtherSessions(uin, connection.tokenHash);
      return {};
    },
    'ping': () => ({ serverTime: clock.now().toISOString() }),
  };
}
