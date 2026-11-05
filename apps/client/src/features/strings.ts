/**
 * English UI strings of ICQ 2001b, taken from the string tables and dialog
 * resources of the original binaries (icq.exe, icqreg.dll and friends).
 * Keep every user-visible label here so the text stays consistent.
 */
import type { AwayStatus, Status, StatusMessageStatus, SystemNotice } from '@openicq/protocol';

/** Labels of the status menu (icq.exe strings 7220, 6291, 7222, 6258, 6257, 7223, 7224, 7221). */
export const STATUS_MENU_LABEL: Record<Status, string> = {
  online: 'Available/Connect',
  ffc: 'Free For Chat',
  away: 'Away',
  na: 'N/A (Extended Away)',
  occupied: 'Occupied (Urgent Msgs)',
  dnd: 'DND (Do not Disturb)',
  invisible: 'Privacy (Invisible)',
  offline: 'Offline/Disconnect',
};

/** Short status names (status button, tooltips, details). */
export const STATUS_NAME: Record<Status, string> = {
  online: 'Online',
  ffc: 'Free For Chat',
  away: 'Away',
  na: 'N/A',
  occupied: 'Occupied',
  dnd: 'DND',
  invisible: 'Invisible',
  offline: 'Offline',
};

export const CONNECTING = 'Connecting...';

/** "Read ... Message" items of the contact menu, one per away-like status. */
export const READ_AWAY_LABEL: Record<StatusMessageStatus, string> = {
  away: 'Read Away-message',
  na: 'Read N/A-Message',
  occupied: 'Read Occupied-Message',
  dnd: 'Read DND-Message',
  ffc: 'Read Chat Room-Message',
};

/** Title, explanation and edit label of "Change / Confirm ... Message" (dialog 2064 and strings 6262-6265, 7255-7256). */
export const AWAY_DIALOG: Record<StatusMessageStatus, { title: string; text: string }> = {
  away: {
    title: 'Change / Confirm Away Message',
    text: 'This message will be displayed to users when you are marked "away".\nThe message may be modified in your preferences.',
  },
  na: {
    title: 'Change/Confirm N/A Message',
    text: 'This message will be displayed when you are marked as "N/A".\nThe message can be modified in your preferences.',
  },
  occupied: {
    title: 'Change / Confirm Occupied Message',
    text: 'This message will be displayed to users when you are marked as "Occupied".\nThe message can be modified in your preferences.',
  },
  dnd: {
    title: 'Change/Confirm DND Message',
    text: 'This message will be displayed to users when you are marked as "DND".\nThe message can be modified in your preferences.',
  },
  ffc: {
    title: 'Change / Confirm Chat Mode Message',
    text: 'This Message will be displayed to users when you are marked as "Free For Chat". It is recommended to include in the message the topic you wish to discuss in your chat room.',
  },
};

/** "User %s Is Away" family (strings 7242, 6261, 7246, 6269) and the label above the text. */
export const READ_AWAY_DIALOG: Record<StatusMessageStatus, { heading: (nick: string) => string; label: string }> = {
  away: { heading: (n) => `User ${n} Is Away`, label: 'Away message:' },
  na: { heading: (n) => `User ${n} is in N/A mode.`, label: 'User Is in N/A mode:' },
  occupied: { heading: (n) => `User ${n} is in Occupied mode`, label: 'Occupied message:' },
  dnd: { heading: (n) => `User ${n} is in DND mode`, label: 'DND message:' },
  ffc: { heading: (n) => `User ${n} is in Free For Chat mode`, label: 'Free For Chat Mode:' },
};

export const STRINGS = {
  appName: 'openICQ',
  mainButton: 'Main',
  mainMenu: 'Main Menu',
  systemNotice: 'System Notice - Click here',
  addInvite: 'Add/Invite Users',
  shutDown: 'Shut Down',
  confirmShutDownTitle: 'Confirm Shut Down...',
  confirmShutDownText: 'Are you sure you want to shut down openICQ ?',
  confirmDeleteTitle: 'Confirm Delete User',
  confirmDeleteText: (nick: string) => `Delete ${nick} ?`,
  closingIn: (seconds: number) => `Closing in ${seconds} Secs`,
  notConnected: 'You are currently not connected to the ICQ Network.',
  networkError: 'ICQ Network Error',
  retrievingAway: "Retrieving User's Away Message",
  fetchingUser: 'Hold on. Fetching user information...',
  noUsersFound: 'No users found!',
  declineTitle: 'Decline User Request',
  declinePrompt: 'Enter your reason for refusal (or leave blank):',
  noReason: 'No reason given',
  messageLimit: 'Message Character Limit',
  overServerLimit: (limit: number) => `Message exceeds server limit (${limit} chars).\nPlease edit your message before sending`,
  sendUrgent: 'Send Urgent',
  sendToContactList: 'Send To Contact List',
  occupiedPrompt: 'User is in Occupied mode. Urgent Events  will blink. Other events will be indicated on his/her contact list.',
  dndPrompt: 'User is in DND mode and selected not to accept urgent events. Send this event to his/her Contact List.',
  addedToList: (nick: string) => `${nick} has been added to your Contact List.\nICQ servers will alert you when user is online.`,
} as const;

/** Shown after sending to someone in an away-like status (icq.exe 7241, 6259, 7245, 6267). */
export const AUTO_RESPONSE_NOTICE: Record<AwayStatus, string> = {
  away: 'User is away.\nYour event has been saved on his/her Contact List.',
  na: 'User is in N/A mode.\nYour event has been saved on his/her Contact List.',
  occupied: 'User is in Occupied mode. Urgent Events  will blink. Other events will be indicated on his/her contact list.',
  dnd: 'User is in DND Mode',
};

/** System Notice captions by kind (icq.exe dialog 2504 and its variants). */
export const NOTICE_TITLE: Record<SystemNotice['kind'], string> = {
  auth_request: 'Request For Authorization',
  auth_granted: '"Authorization" Request Accepted',
  auth_denied: '"Authorization" Request Denied',
  added_you: '"You Were Added"',
};
