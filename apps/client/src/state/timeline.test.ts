import { describe, expect, it } from 'vitest';
import { ME, chat, message } from '../../tests/fixtures';
import { buildTimeline, memberMarks, readState, type BubbleItem } from './timeline';
import type { OutgoingMessage } from './types';

const PEER = 200;
const at = (minutes: number) => new Date(Date.UTC(2026, 10, 5, 10, minutes)).toISOString();

function bubbles(items: ReturnType<typeof buildTimeline>): BubbleItem[] {
  return items.filter((i): i is BubbleItem => i.kind === 'bubble');
}

describe('buildTimeline', () => {
  it('chains consecutive messages of one sender and breaks on sender change', () => {
    const items = buildTimeline({
      messages: [
        message(1, PEER, 'a', { id: 1, sentAt: at(0) }),
        message(1, PEER, 'b', { id: 2, sentAt: at(1) }),
        message(1, PEER, 'c', { id: 3, sentAt: at(2) }),
        message(1, ME, 'd', { id: 4, sentAt: at(3) }),
      ],
      outbox: [],
      me: ME,
      isGroup: false,
      newPlateAfterId: null,
    });
    expect(items[0]?.kind).toBe('date');
    expect(bubbles(items).map((b) => [b.chainedPrev, b.chainedNext])).toEqual([
      [false, true],
      [true, true],
      [true, false],
      [false, false],
    ]);
  });

  it('does not chain across a 10 minute gap, a day or a service event', () => {
    const items = buildTimeline({
      messages: [
        message(1, PEER, 'a', { id: 1, sentAt: at(0) }),
        message(1, PEER, 'b', { id: 2, sentAt: at(10) }),
        message(1, PEER, '', { id: 3, sentAt: at(11), event: { type: 'renamed', actor: PEER, target: null, value: 'X' } }),
        message(1, PEER, 'c', { id: 4, sentAt: at(12) }),
        message(1, PEER, 'd', { id: 5, sentAt: '2026-11-06T10:13:00.000Z' }),
      ],
      outbox: [],
      me: ME,
      isGroup: false,
      newPlateAfterId: null,
    });
    expect(items.map((i) => i.kind)).toEqual(['date', 'bubble', 'bubble', 'event', 'bubble', 'date', 'bubble']);
    expect(bubbles(items).every((b) => !b.chainedPrev && !b.chainedNext)).toBe(true);
  });

  it('puts the New messages plate before the first unread incoming message', () => {
    const items = buildTimeline({
      messages: [message(1, PEER, 'old', { id: 1, sentAt: at(0) }), message(1, ME, 'mine', { id: 2, sentAt: at(1) }), message(1, PEER, 'new', { id: 3, sentAt: at(2) })],
      outbox: [],
      me: ME,
      isGroup: false,
      newPlateAfterId: 1,
    });
    expect(items.map((i) => i.kind)).toEqual(['date', 'bubble', 'bubble', 'new', 'bubble']);
  });

  it('shows the sender name only at the start of a chain in groups', () => {
    const items = buildTimeline({
      messages: [message(1, PEER, 'a', { id: 1, sentAt: at(0) }), message(1, PEER, 'b', { id: 2, sentAt: at(1) }), message(1, ME, 'c', { id: 3, sentAt: at(2) })],
      outbox: [],
      me: ME,
      isGroup: true,
      newPlateAfterId: null,
    });
    expect(bubbles(items).map((b) => b.showSender)).toEqual([true, false, false]);
  });

  it('appends pending messages after the confirmed ones', () => {
    const pending: OutgoingMessage = { clientId: 'x', chatId: 1, text: 'p', replyTo: null, attachments: [], createdAt: Date.parse(at(2)), state: 'pending' };
    const items = buildTimeline({ messages: [message(1, ME, 'a', { id: 1, sentAt: at(1) })], outbox: [pending], me: ME, isGroup: false, newPlateAfterId: null });
    const list = bubbles(items);
    expect(list.map((b) => b.key)).toEqual(['m1', 'cx']);
    expect(list[1]?.chainedPrev).toBe(true);
  });
});

describe('readState', () => {
  const direct = (peerDeliveredId: number, peerReadId: number) => chat(1, { peer: PEER, peerDeliveredId, peerReadId });
  const mine = [1, 2, 3].map((id) => message(1, ME, `m${id}`, { id, sentAt: at(id) }));

  it('gives sent and delivered ticks to my bubbles newer than the heads', () => {
    const items = buildTimeline({ messages: mine, outbox: [], me: ME, isGroup: false, newPlateAfterId: null });
    const state = readState(items, memberMarks(direct(2, 1), ME, undefined), ME);
    expect(state.heads.get('m1')).toEqual([PEER]);
    expect(state.ticks.get('m1')).toBeUndefined();
    expect(state.ticks.get('m2')).toBe('delivered');
    expect(state.ticks.get('m3')).toBe('sent');
  });

  it('draws no tick on the bubble that carries the heads', () => {
    const items = buildTimeline({ messages: mine, outbox: [], me: ME, isGroup: false, newPlateAfterId: null });
    const state = readState(items, memberMarks(direct(3, 3), ME, undefined), ME);
    expect(state.heads.get('m3')).toEqual([PEER]);
    expect(state.ticks.size).toBe(0);
  });

  it('hides a head once the reader wrote after it', () => {
    const messages = [...mine, message(1, PEER, 'reply', { id: 4, sentAt: at(4) })];
    const items = buildTimeline({ messages, outbox: [], me: ME, isGroup: false, newPlateAfterId: null });
    const state = readState(items, memberMarks(direct(4, 4), ME, undefined), ME);
    expect(state.heads.size).toBe(0);
    expect(state.ticks.size).toBe(0);
  });

  it('gives a pending clock to unsent messages and nothing to failed ones', () => {
    const outbox: OutgoingMessage[] = [
      { clientId: 'a', chatId: 1, text: 'x', replyTo: null, attachments: [], createdAt: Date.parse(at(5)), state: 'pending' },
      { clientId: 'b', chatId: 1, text: 'y', replyTo: null, attachments: [], createdAt: Date.parse(at(6)), state: 'failed' },
    ];
    const items = buildTimeline({ messages: mine, outbox, me: ME, isGroup: false, newPlateAfterId: null });
    const state = readState(items, memberMarks(direct(0, 0), ME, undefined), ME);
    expect(state.ticks.get('ca')).toBe('pending');
    expect(state.ticks.has('cb')).toBe(false);
  });

  it('collects group readers under the newest message each one read', () => {
    const messages = [message(9, ME, 'a', { id: 1, sentAt: at(1) }), message(9, ME, 'b', { id: 2, sentAt: at(2) })];
    const items = buildTimeline({ messages, outbox: [], me: ME, isGroup: true, newPlateAfterId: null });
    const marks = {
      3: { uin: 3, lastReadId: 2, lastDeliveredId: 2 },
      4: { uin: 4, lastReadId: 2, lastDeliveredId: 2 },
      [ME]: { uin: ME, lastReadId: 2, lastDeliveredId: 2 },
    };
    const state = readState(items, memberMarks(chat(9, { type: 'group' }), ME, marks), ME);
    expect(state.heads.get('m2')).toEqual([3, 4]);
  });
});
