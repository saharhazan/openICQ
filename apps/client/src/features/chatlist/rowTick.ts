/** The delivery mark of my last message in a chat row: clock, one check, two checks, or the reader's head. */
import type { Chat, ReadMark } from '@openicq/protocol';
import type { OutgoingMessage } from '../../state/types';

export type RowTick = 'pending' | 'failed' | 'sent' | 'delivered' | 'read' | null;

export function rowTick(
  chat: Chat,
  me: number,
  outbox: readonly OutgoingMessage[] | undefined,
  marks: Readonly<Record<number, ReadMark>> | undefined,
): RowTick {
  if (chat.type === 'favorites') return null;
  const last = outbox?.at(-1);
  if (last) return last.state === 'failed' ? 'failed' : 'pending';
  const message = chat.lastMessage;
  if (!message || message.sender !== me || message.event !== null || message.deleted) return null;
  if (chat.type === 'direct') {
    if (message.id <= chat.peerReadId) return 'read';
    return message.id <= chat.peerDeliveredId ? 'delivered' : 'sent';
  }
  const others = Object.values(marks ?? {}).filter((m) => m.uin !== me);
  if (others.some((m) => m.lastReadId >= message.id)) return 'read';
  return others.some((m) => m.lastDeliveredId >= message.id) ? 'delivered' : 'sent';
}
