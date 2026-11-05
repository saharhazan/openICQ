/**
 * The message context menu in the original order (ComplexMessageItem.cpp
 * ~3060-3330), limited to this version: Reply, Copy, Forward, Select, Edit,
 * Delete for me, Delete for all. Favorites has a single "Delete".
 */
import type { Chat, Message } from '@openicq/protocol';
import { S } from '../../strings';

export type MessageAction = 'reply' | 'copy' | 'forward' | 'select' | 'edit' | 'deleteForMe' | 'deleteForAll';

export interface MessageMenuEntry {
  action: MessageAction;
  label: string;
  danger: boolean;
}

export interface MessageMenuContext {
  chat: Chat;
  me: number;
  /** False when I am banned to write (read only) or the peer is blocked. */
  canWrite: boolean;
}

export function isAdmin(chat: Chat): boolean {
  const role = chat.group?.myRole;
  return role === 'admin' || role === 'creator';
}

export function canDeleteForAll(message: Message, context: MessageMenuContext): boolean {
  if (message.deleted || message.event) return false;
  return message.sender === context.me || (context.chat.type === 'group' && isAdmin(context.chat));
}

export function canEdit(message: Message, me: number): boolean {
  return message.sender === me && !message.deleted && message.event === null && message.text.trim() !== '';
}

export function messageMenuEntries(message: Message, context: MessageMenuContext): MessageMenuEntry[] {
  const entries: MessageMenuEntry[] = [];
  const add = (action: MessageAction, label: string, danger = false) => entries.push({ action, label, danger });
  const live = !message.deleted && message.event === null;
  if (live && context.canWrite) add('reply', S.messageMenu.reply);
  if (live && message.text.trim() !== '') add('copy', S.messageMenu.copy);
  if (live) add('forward', S.messageMenu.forward);
  add('select', S.messageMenu.select);
  if (canEdit(message, context.me) && context.canWrite) add('edit', S.messageMenu.edit);
  if (context.chat.type === 'favorites') {
    add('deleteForMe', S.messageMenu.delete, true);
    return entries;
  }
  add('deleteForMe', S.messageMenu.deleteForMe, true);
  if (canDeleteForAll(message, context)) add('deleteForAll', S.messageMenu.deleteForAll, true);
  return entries;
}
