/**
 * Turns a chat's messages into what the history draws: date pills, the
 * "New messages" plate, service events and bubbles with their chaining,
 * delivery ticks and read heads. Rules from MessagesScrollAreaLayout.cpp,
 * types/message.cpp and HistoryControlPage.cpp of the original.
 */
import type { Chat, Message, ReadMark, Uin } from './protocolTypes';
import { dayKey } from './format';
import type { OutgoingMessage } from './types';

/** Messages further apart than this are not chained (types/message.cpp timeDiffForIndent). */
export const CHAIN_GAP_MS = 10 * 60 * 1000;

export interface BubbleItem {
  kind: 'bubble';
  key: string;
  message: Message | null;
  outgoing: OutgoingMessage | null;
  sender: Uin;
  mine: boolean;
  at: Date;
  /** Same sender, no gap: the joined corners become 4 px. */
  chainedPrev: boolean;
  chainedNext: boolean;
  /** Groups, incoming, first of a chain. */
  showSender: boolean;
}

export type TimelineItem =
  | { kind: 'date'; key: string; at: Date }
  | { kind: 'new'; key: 'new-plate' }
  | { kind: 'event'; key: string; message: Message }
  | BubbleItem;

export interface TimelineInput {
  messages: readonly Message[];
  outbox: readonly OutgoingMessage[];
  me: Uin;
  isGroup: boolean;
  /** Messages with a bigger id from others start below the plate; null hides it. */
  newPlateAfterId: number | null;
}

interface Entry {
  key: string;
  message: Message | null;
  outgoing: OutgoingMessage | null;
  sender: Uin;
  at: Date;
}

function chainable(entry: Entry): boolean {
  return entry.message === null || (!entry.message.deleted && entry.message.event === null);
}

function chained(a: Entry, b: Entry): boolean {
  return (
    a.sender === b.sender &&
    chainable(a) &&
    chainable(b) &&
    Math.abs(b.at.getTime() - a.at.getTime()) < CHAIN_GAP_MS &&
    dayKey(a.at) === dayKey(b.at)
  );
}

export function buildTimeline(input: TimelineInput): TimelineItem[] {
  const entries: Entry[] = [
    ...input.messages.map((message) => ({
      key: `m${message.id}`,
      message,
      outgoing: null,
      sender: message.sender,
      at: new Date(message.sentAt),
    })),
    ...input.outbox.map((outgoing) => ({
      key: `c${outgoing.clientId}`,
      message: null,
      outgoing,
      sender: input.me,
      at: new Date(outgoing.createdAt),
    })),
  ];
  const items: TimelineItem[] = [];
  let plateDone = input.newPlateAfterId === null;
  let previous: Entry | null = null;
  let lastBubble: BubbleItem | null = null;
  for (const [index, entry] of entries.entries()) {
    const next = entries[index + 1];
    let breakChain = false;
    if (!previous || dayKey(previous.at) !== dayKey(entry.at)) {
      items.push({ kind: 'date', key: `d${dayKey(entry.at)}`, at: entry.at });
      breakChain = true;
    }
    const message = entry.message;
    if (!plateDone && message && message.sender !== input.me && message.id > (input.newPlateAfterId ?? 0)) {
      items.push({ kind: 'new', key: 'new-plate' });
      plateDone = true;
      breakChain = true;
    }
    if (message?.event) {
      items.push({ kind: 'event', key: entry.key, message });
      previous = entry;
      lastBubble = null;
      continue;
    }
    const chainedPrev = !breakChain && previous !== null && chained(previous, entry);
    if (lastBubble && !chainedPrev) lastBubble.chainedNext = false;
    const bubble: BubbleItem = {
      kind: 'bubble',
      key: entry.key,
      message,
      outgoing: entry.outgoing,
      sender: entry.sender,
      mine: entry.sender === input.me,
      at: entry.at,
      chainedPrev,
      chainedNext: next !== undefined && chained(entry, next),
      showSender: input.isGroup && entry.sender !== input.me && !chainedPrev,
    };
    items.push(bubble);
    previous = entry;
    lastBubble = bubble;
  }
  return items;
}

export type Tick = 'pending' | 'sent' | 'delivered';

export interface ReadState {
  /** Tick beside my outgoing bubbles, by item key; absent means none. */
  ticks: Map<string, Tick>;
  /** Readers' avatars under a message, by item key. */
  heads: Map<string, Uin[]>;
}

/** Each other member's marks: the peer of a direct chat, or the group's read marks. */
export function memberMarks(chat: Chat, me: Uin, groupMarks: Readonly<Record<number, ReadMark>> | undefined): ReadMark[] {
  if (chat.type === 'direct') {
    return chat.peer === null ? [] : [{ uin: chat.peer, lastReadId: chat.peerReadId, lastDeliveredId: chat.peerDeliveredId }];
  }
  if (chat.type === 'favorites') return [];
  return Object.values(groupMarks ?? {}).filter((mark) => mark.uin !== me);
}

/**
 * Ticks and heads (HistoryControlPage::changeDlgStateContact): a head sits under
 * the newest message a member has read, unless that member wrote something
 * after it. My bubbles newer than every head get a tick: a clock while
 * pending, one check at the server, two checks when delivered. Older bubbles
 * and the bubble carrying heads get none.
 */
export function readState(items: readonly TimelineItem[], marks: readonly ReadMark[], me: Uin): ReadState {
  const bubbles = items.filter((item): item is BubbleItem => item.kind === 'bubble');
  const heads = new Map<string, Uin[]>();
  let newestHeadIndex = -1;
  for (const mark of marks) {
    let anchor = -1;
    for (let i = bubbles.length - 1; i >= 0; i -= 1) {
      const message = bubbles[i]?.message;
      if (message && message.id <= mark.lastReadId && !message.deleted) {
        anchor = i;
        break;
      }
    }
    const anchorBubble = bubbles[anchor];
    if (!anchorBubble || anchorBubble.sender === mark.uin) continue;
    const wroteSince = bubbles.slice(anchor + 1).some((b) => b.sender === mark.uin);
    if (wroteSince) continue;
    heads.set(anchorBubble.key, [...(heads.get(anchorBubble.key) ?? []), mark.uin]);
    newestHeadIndex = Math.max(newestHeadIndex, anchor);
  }
  const ticks = new Map<string, Tick>();
  const delivered = marks.reduce((max, mark) => Math.max(max, mark.lastDeliveredId), 0);
  for (let i = bubbles.length - 1; i > newestHeadIndex; i -= 1) {
    const bubble = bubbles[i];
    if (!bubble) continue;
    // The original stops at the newest incoming message: older ticks are implied.
    if (bubble.sender !== me) break;
    if (bubble.outgoing) {
      if (bubble.outgoing.state !== 'failed') ticks.set(bubble.key, 'pending');
      continue;
    }
    if (bubble.message && !bubble.message.deleted) ticks.set(bubble.key, bubble.message.id <= delivered ? 'delivered' : 'sent');
  }
  return { ticks, heads };
}
