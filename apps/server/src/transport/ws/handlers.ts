/** The handler map: one small function per request type, delegating to the application services. */
import type { AuthService } from '../../application/auth-service.ts';
import type { ChatService } from '../../application/chat-service.ts';
import type { FileService } from '../../application/file-service.ts';
import type { GroupMembershipService } from '../../application/group-membership-service.ts';
import type { GroupService } from '../../application/group-service.ts';
import type { MessageService } from '../../application/message-service.ts';
import type { PresenceService } from '../../application/presence-service.ts';
import type { SessionService } from '../../application/session-service.ts';
import type { UserService } from '../../application/user-service.ts';
import { DomainError } from '../../domain/errors.ts';
import type { Clock } from '../../domain/ports.ts';
import { SlidingWindowRateLimiter } from '../rate-limiter.ts';
import type { ConnectionLifecycle } from './connection-lifecycle.ts';
import type { RequestHandlers } from './request-router.ts';

export const MESSAGE_RATE_LIMITED = 'You are sending messages too fast. Please wait a moment and try again.';
export const TYPING_RATE_LIMITED = 'Typing notifications are limited to one every 2 seconds per chat.';
export const PASSWORD_RATE_LIMITED = 'Too many password change attempts. Please wait a while and try again.';
export const WRITE_RATE_LIMITED = 'You are editing, deleting or reacting too fast. Please wait a moment and try again.';
export const GROUP_CREATE_RATE_LIMITED = 'You have created too many groups. Please wait a while and try again.';

/** Plan rule 14. Kept per UIN (and per chat for typing), so reconnecting or a second device does not reset them. */
export const MESSAGE_LIMIT = { attempts: 20, windowMs: 10_000 } as const;
export const TYPING_LIMIT = { attempts: 1, windowMs: 2_000 } as const;
/** Each attempt costs a scrypt verification. */
export const PASSWORD_CHANGE_LIMIT = { attempts: 5, windowMs: 15 * 60 * 1000 } as const;
/** Edits, reactions and deletes together: each one fans out an event to every member of the chat. */
export const WRITE_LIMIT = { attempts: 30, windowMs: 10_000 } as const;
export const GROUP_CREATE_LIMIT = { attempts: 10, windowMs: 60 * 60 * 1000 } as const;

export interface ApplicationServices {
  readonly auth: AuthService;
  readonly session: SessionService;
  readonly presence: PresenceService;
  readonly chats: ChatService;
  readonly messages: MessageService;
  readonly groups: GroupService;
  readonly membership: GroupMembershipService;
  readonly users: UserService;
  readonly files: FileService;
}

export function createRequestHandlers(
  services: ApplicationServices,
  lifecycle: ConnectionLifecycle,
  clock: Clock,
): RequestHandlers {
  const { auth, session, chats, messages, groups, membership, users } = services;
  const now = () => clock.now().getTime();
  const messageLimiter = new SlidingWindowRateLimiter(MESSAGE_LIMIT.attempts, MESSAGE_LIMIT.windowMs, now);
  const typingLimiter = new SlidingWindowRateLimiter(TYPING_LIMIT.attempts, TYPING_LIMIT.windowMs, now);
  const passwordLimiter = new SlidingWindowRateLimiter(PASSWORD_CHANGE_LIMIT.attempts, PASSWORD_CHANGE_LIMIT.windowMs, now);
  const writeLimiter = new SlidingWindowRateLimiter(WRITE_LIMIT.attempts, WRITE_LIMIT.windowMs, now);
  const groupLimiter = new SlidingWindowRateLimiter(GROUP_CREATE_LIMIT.attempts, GROUP_CREATE_LIMIT.windowMs, now);
  const limitMessages = (uin: number): void => {
    if (!messageLimiter.attempt(String(uin)).allowed) throw new DomainError('rate_limited', MESSAGE_RATE_LIMITED);
  };
  const limitWrites = (uin: number): void => {
    if (!writeLimiter.attempt(String(uin)).allowed) throw new DomainError('rate_limited', WRITE_RATE_LIMITED);
  };
  return {
    'session.start': ({ actor, connection }) => {
      lifecycle.activate(connection);
      return session.start(actor.uin);
    },

    'chat.history': ({ actor }, query) => chats.history(actor, query),
    'chat.direct': ({ actor }, { uin }) => chats.direct(actor, uin),
    'chat.read': ({ actor }, { chatId, messageId }) => {
      chats.read(actor, chatId, messageId);
      return {};
    },
    'chat.markUnread': ({ actor }, { chatId }) => {
      chats.markUnread(actor, chatId);
      return {};
    },
    'chat.update': ({ actor }, { chatId, pinned, muted }) => ({ chat: chats.update(actor, chatId, { pinned, muted }).chat }),
    'chat.clear': ({ actor }, { chatId }) => {
      chats.clear(actor, chatId);
      return {};
    },
    'chat.remove': ({ actor }, { chatId }) => {
      chats.remove(actor, chatId);
      return {};
    },
    typing: ({ actor }, { chatId }) => {
      if (!typingLimiter.attempt(`${actor.uin}:${chatId}`).allowed) throw new DomainError('rate_limited', TYPING_RATE_LIMITED);
      chats.typing(actor, chatId);
      return {};
    },

    'message.send': ({ actor }, input) => {
      limitMessages(actor.uin);
      return { message: messages.send(actor, input) };
    },
    'message.forward': ({ actor }, { fromChatId, messageIds, toChatId }) => {
      limitMessages(actor.uin);
      return { messages: messages.forward(actor, fromChatId, messageIds, toChatId) };
    },
    'message.edit': ({ actor }, { messageId, text }) => {
      limitWrites(actor.uin);
      return { message: messages.edit(actor, messageId, text) };
    },
    'message.delete': async ({ actor }, input) => {
      limitWrites(actor.uin);
      await messages.delete(actor, input);
      return {};
    },
    'message.react': ({ actor }, { messageId, reaction }) => {
      limitWrites(actor.uin);
      return { message: messages.react(actor, messageId, reaction) };
    },

    'user.search': ({ actor }, { query }) => ({ users: users.search(actor.uin, query) }),
    'user.get': ({ actor }, { uin }) => ({ user: users.get(actor.uin, uin) }),
    'user.block': ({ actor }, { uin, blocked }) => ({ user: users.block(actor, uin, blocked) }),
    'contact.add': ({ actor }, { uin }) => ({ user: users.addContact(actor, uin) }),
    'contact.remove': ({ actor }, { uin }) => {
      users.removeContact(actor, uin);
      return {};
    },

    'profile.update': ({ actor }, update) => ({ me: users.updateProfile(actor, update) }),
    'nickname.check': ({ actor }, { nickname }) => users.checkNickname(actor.uin, nickname),
    'settings.update': ({ actor }, { groupInvites }) => ({ settings: users.updateSettings(actor.uin, groupInvites) }),
    'password.change': async ({ actor, sessionId, connection }, { oldPassword, newPassword }) => {
      if (!passwordLimiter.attempt(String(actor.uin)).allowed) throw new DomainError('rate_limited', PASSWORD_RATE_LIMITED);
      let closed: number[];
      try {
        closed = await auth.changePassword(actor.uin, sessionId, oldPassword, newPassword);
      } catch (error) {
        if (error instanceof DomainError) connection.log.warn({ code: error.code }, 'password change refused');
        throw error;
      }
      // The connection logger carries the UIN and the session; the passwords never reach the log.
      connection.log.warn({ closedSessionIds: closed }, 'password changed');
      lifecycle.closeSessions(closed, 'closed_remotely');
      return {};
    },
    'sessions.list': ({ actor, sessionId }) => ({ sessions: auth.listSessions(actor.uin, sessionId) }),
    'sessions.close': ({ actor, sessionId, connection }, payload) => {
      const closed =
        'others' in payload
          ? auth.closeOtherSessions(actor.uin, sessionId)
          : auth.closeSession(actor.uin, sessionId, payload.sessionId);
      connection.log.warn({ closedSessionIds: closed }, 'sessions closed remotely');
      lifecycle.closeSessions(closed, 'closed_remotely');
      return {};
    },

    'group.create': ({ actor }, input) => {
      if (!groupLimiter.attempt(String(actor.uin)).allowed) throw new DomainError('rate_limited', GROUP_CREATE_RATE_LIMITED);
      return groups.create(actor, input);
    },
    'group.update': ({ actor }, input) => ({ chat: groups.update(actor, input).chat }),
    'group.members': ({ actor }, { chatId }) => groups.members(actor, chatId),
    'group.addMembers': ({ actor }, { chatId, uins }) => membership.addMembers(actor, chatId, uins),
    'group.removeMember': ({ actor }, { chatId, uin }) => {
      membership.removeMember(actor, chatId, uin);
      return {};
    },
    'group.setRole': ({ actor }, { chatId, uin, role }) => {
      groups.setRole(actor, chatId, uin, role);
      return {};
    },
    'group.regenerateLink': ({ actor }, { chatId }) => ({ inviteToken: groups.regenerateLink(actor, chatId) }),
    'group.preview': ({ actor }, { inviteToken }) => ({ group: membership.preview(actor, inviteToken) }),
    'group.join': ({ actor }, { inviteToken }) => membership.join(actor, inviteToken),
    'group.requests': ({ actor }, { chatId }) => membership.requests(actor, chatId),
    'group.resolveRequest': ({ actor }, { chatId, uin, approve }) => {
      membership.resolveRequest(actor, chatId, uin, approve);
      return {};
    },

    ping: () => ({ serverTime: clock.now().toISOString() }),
  };
}
