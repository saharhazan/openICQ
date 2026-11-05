/**
 * Defaults for new accounts, taken from the original ICQ 2001b client
 * (docs/research/icq-2001b-findings.md, Q5, Q6 and Q13). Kept in one module on purpose.
 */
import type { AwayMessages, Preferences } from '@openicq/protocol';

export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({
  soundsEnabled: true,
  popupIncoming: false,
  /** MoveToAwayDelay: minutes of not using the computer before Away. */
  autoAwayMinutes: 10,
  /** MoveFromAwayToOutDelay: minutes in Away mode before N/A. */
  autoNaMinutes: 20,
});

/** The original default status messages (CRLF of the binary normalised to LF). */
export const DEFAULT_AWAY_MESSAGES: Readonly<AwayMessages> = Object.freeze({
  away: 'User is currently away\nYou can leave him/her a message',
  na: 'User is currently N/A\nYou can leave him/her a message',
  occupied: 'User is currently Occupied',
  dnd: 'User is currently in DND mode',
  ffc: 'I would like to chat about anything',
});

export const DEFAULT_WEB_AWARE = false;
export const DEFAULT_HIDE_EMAIL = false;
