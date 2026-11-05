/**
 * Side effects a server event asks for (sounds, automatic windows), derived
 * purely from the state before the event. The controller executes them.
 */
import { SILENT_DELIVERY_STATUSES, type Preferences, type ServerEvent, type Status, type Uin } from '@openicq/protocol';
import { type ChatState, findContact, peerOf } from './chat';

/** Incoming Message (Message.wav), Online Alert, System Message, Authorization Message, ICQ Startup. */
export type SoundName = 'message' | 'online' | 'notice' | 'auth' | 'startup';

export type EventEffect =
  | { type: 'sound'; sound: SoundName }
  | { type: 'openMessage'; uin: Uin }
  | { type: 'markRead'; uin: Uin }
  | { type: 'resolveNickname'; uin: Uin }
  | { type: 'kicked' };

export interface EffectContext {
  preferences: Preferences | null;
  /** UIN of the message dialog that currently has the focus, if any. */
  focusedMessageUin: Uin | null;
  /** Own status: in Occupied and DND, normal messages arrive silently ("to the Contact List"). */
  ownStatus: Status;
}

export function isSilentDelivery(ownStatus: Status, urgent: boolean): boolean {
  return !urgent && (SILENT_DELIVERY_STATUSES as readonly Status[]).includes(ownStatus);
}

export function deriveEventEffects(state: ChatState, event: ServerEvent, context: EffectContext): EventEffect[] {
  switch (event.type) {
    case 'presence': {
      const contact = findContact(state, event.uin);
      const cameOnline = contact !== undefined && contact.status === 'offline' && event.status !== 'offline';
      return cameOnline ? [{ type: 'sound', sound: 'online' }] : [];
    }
    case 'message': {
      const message = event.message;
      if (message.from === state.selfUin) return [];
      const peer = peerOf(message, state.selfUin);
      const silent = isSilentDelivery(context.ownStatus, message.urgent);
      const effects: EventEffect[] = silent ? [] : [{ type: 'sound', sound: 'message' }];
      const known = findContact(state, peer) !== undefined || state.notInList.some((e) => e.uin === peer);
      if (!known) effects.push({ type: 'resolveNickname', uin: peer });
      if (context.focusedMessageUin === peer) effects.push({ type: 'markRead', uin: peer });
      else if (!silent && context.preferences?.popupIncoming) effects.push({ type: 'openMessage', uin: peer });
      return effects;
    }
    case 'notice':
      if (state.notices.some((n) => n.id === event.notice.id)) return [];
      return [{ type: 'sound', sound: event.notice.kind === 'auth_request' ? 'auth' : 'notice' }];
    case 'session.kicked':
      return event.reason === 'other_location' ? [{ type: 'kicked' }] : [];
    case 'contact.updated':
    case 'contact.removed':
      return [];
  }
}
