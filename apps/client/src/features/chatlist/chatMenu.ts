/**
 * The chat row context menu in the original order (ContactListUtils /
 * RecentsModel menus), limited to what this version supports:
 * Mark as read / unread, Pin / Unpin, Turn off / on notifications,
 * Clear history, Block / Unblock, Leave and delete or Hide.
 */
import type { Chat, User } from '@openicq/protocol';
import { S } from '../../strings';

export type ChatAction = 'markRead' | 'markUnread' | 'pin' | 'unpin' | 'mute' | 'unmute' | 'clear' | 'block' | 'unblock' | 'leave' | 'hide';

export interface ChatMenuEntry {
  action: ChatAction;
  label: string;
  danger: boolean;
}

export function chatMenuEntries(chat: Chat, peer: User | undefined): ChatMenuEntry[] {
  const entries: ChatMenuEntry[] = [];
  const add = (action: ChatAction, label: string, danger = false) => entries.push({ action, label, danger });
  if (chat.unread > 0 || chat.markedUnread) add('markRead', S.chatMenu.markRead);
  else if (chat.lastMessage !== null) add('markUnread', S.chatMenu.markUnread);
  if (chat.pinned) add('unpin', S.chatMenu.unpin);
  else add('pin', S.chatMenu.pin);
  if (chat.type !== 'favorites') {
    if (chat.muted) add('unmute', S.chatMenu.muteOn);
    else add('mute', S.chatMenu.muteOff);
  }
  add('clear', S.chatMenu.clearHistory);
  if (chat.type === 'direct' && peer) {
    if (peer.blocked) add('unblock', S.chatMenu.unblock);
    else add('block', S.chatMenu.block, true);
  }
  if (chat.type === 'group') add('leave', S.chatMenu.leaveAndDelete, true);
  if (chat.type === 'direct') add('hide', S.chatMenu.hide);
  return entries;
}
