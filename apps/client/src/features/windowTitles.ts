/** Window captions, shared by each window frame and the taskbar. */
import { hasStatusMessage, type Status, type Uin } from '@openicq/protocol';
import { findContact } from '../state/chat';
import type { AppState } from '../state/store';
import type { WindowSpec } from '../state/windows';
import { AWAY_DIALOG, NOTICE_TITLE, READ_AWAY_DIALOG, STATUS_NAME, STRINGS } from './strings';

export const LOGIN_TITLE = 'Connect to The ICQ Network';
export const REGISTRATION_TITLE = 'ICQ Registration';
export const ADD_USER_TITLE = 'Find / Add Users to your list';

/** The local alias of a contact, the nickname of a stranger, or the ICQ# itself. */
export function displayName(state: AppState, uin: Uin): string {
  if (state.self && state.self.uin === uin) return state.self.nickname || String(uin);
  const contact = findContact(state.chat, uin);
  if (contact) return contact.nickname || String(uin);
  const stranger = state.chat.notInList.find((e) => e.uin === uin);
  return stranger ? stranger.nickname : String(uin);
}

function autoResponseTitle(status: Status, nick: string): string {
  return hasStatusMessage(status) ? READ_AWAY_DIALOG[status].heading(nick) : nick;
}

function ownName(state: AppState): string {
  return state.self?.nickname ?? state.session?.nickname ?? '';
}

export function windowTitle(spec: WindowSpec, state: AppState): string {
  switch (spec.kind) {
    case 'login':
      return LOGIN_TITLE;
    case 'register':
      return REGISTRATION_TITLE;
    case 'contactList':
      return state.session ? String(state.session.uin) : STRINGS.appName;
    case 'message':
      return `${displayName(state, spec.uin)} (${STATUS_NAME[findContact(state.chat, spec.uin)?.status ?? 'offline']}) - Message Session`;
    case 'history':
      return `History Of Events: ${displayName(state, spec.uin)}`;
    case 'userDetails':
      return `User Info ${displayName(state, spec.uin)}`;
    case 'readAway':
      return 'Away Message';
    case 'autoResponse':
      return autoResponseTitle(spec.status, displayName(state, spec.uin));
    case 'awayMessage':
      return AWAY_DIALOG[spec.status].title;
    case 'addUser':
      return ADD_USER_TITLE;
    case 'authRequest':
      return spec.mode === 'add' ? 'Add User to Contact List' : 'Resend Request For Authorization From User';
    case 'notice': {
      const notice = state.chat.notices.find((n) => n.id === spec.noticeId);
      return notice ? NOTICE_TITLE[notice.kind] : 'System Notice';
    }
    case 'preferences':
      return `Owner Preferences For: ${ownName(state)}`;
    case 'security':
      return `Security and Privacy Permissions (Ignore/Spam, harassment control) For: ${ownName(state)}`;
    case 'confirm':
      return spec.action === 'delete' ? 'Confirm Delete User' : 'Add To Ignore List';
    case 'kicked':
      return 'ICQ Network Error';
    case 'about':
      return `About ${STRINGS.appName}`;
    case 'confirmShutDown':
      return 'Confirm Shut Down...';
    case 'error':
      return state.errors.find((e) => e.id === spec.errorId)?.title ?? STRINGS.appName;
  }
}
