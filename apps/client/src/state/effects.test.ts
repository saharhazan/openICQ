import { describe, expect, it } from 'vitest';
import { contact, message, notice, SELF, settings, snapshot } from '../../tests/fixtures';
import { applySnapshot, initialChatState } from './chat';
import { deriveEventEffects, type EffectContext } from './effects';

const ALICE = 200002;
const state = applySnapshot(initialChatState, snapshot({ contacts: [contact(ALICE, 'Alice')] }));
const base: EffectContext = { preferences: settings().preferences, focusedMessageUin: null, ownStatus: 'online' };

describe('deriveEventEffects', () => {
  it('plays the online sound only when a contact comes online', () => {
    expect(deriveEventEffects(state, { type: 'presence', uin: ALICE, status: 'online' }, base)).toEqual([{ type: 'sound', sound: 'online' }]);
    expect(deriveEventEffects(state, { type: 'presence', uin: ALICE, status: 'offline' }, base)).toEqual([]);
  });

  it('plays the message sound and pops up the dialog when the preference asks for it', () => {
    const popup = { ...base, preferences: { ...settings().preferences, popupIncoming: true } };
    expect(deriveEventEffects(state, { type: 'message', message: message(ALICE, SELF, 'hi') }, popup)).toEqual([
      { type: 'sound', sound: 'message' },
      { type: 'openMessage', uin: ALICE },
    ]);
  });

  it('marks read instead of popping up when that dialog has the focus', () => {
    const focused = { ...base, focusedMessageUin: ALICE };
    expect(deriveEventEffects(state, { type: 'message', message: message(ALICE, SELF, 'hi') }, focused)).toContainEqual({ type: 'markRead', uin: ALICE });
  });

  it('delivers silently in Occupied and DND unless the message is urgent', () => {
    const occupied = { ...base, ownStatus: 'occupied' as const, preferences: { ...settings().preferences, popupIncoming: true } };
    expect(deriveEventEffects(state, { type: 'message', message: message(ALICE, SELF, 'hi') }, occupied)).toEqual([]);
    expect(deriveEventEffects(state, { type: 'message', message: message(ALICE, SELF, 'hi', { urgent: true }) }, occupied)).toEqual([
      { type: 'sound', sound: 'message' },
      { type: 'openMessage', uin: ALICE },
    ]);
  });

  it('uses the authorization sound for authorization requests', () => {
    expect(deriveEventEffects(state, { type: 'notice', notice: notice(5, 300) }, base)).toEqual([{ type: 'sound', sound: 'auth' }]);
    expect(deriveEventEffects(state, { type: 'notice', notice: notice(6, 300, { kind: 'added_you' }) }, base)).toEqual([{ type: 'sound', sound: 'notice' }]);
  });

  it('asks to resolve the nickname of an unknown sender and reports a kick', () => {
    expect(deriveEventEffects(state, { type: 'message', message: message(999999, SELF, 'yo') }, base)).toContainEqual({ type: 'resolveNickname', uin: 999999 });
    expect(deriveEventEffects(state, { type: 'session.kicked', reason: 'other_location' }, base)).toEqual([{ type: 'kicked' }]);
  });
});
