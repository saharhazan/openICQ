import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@openicq/protocol';
import { ME, chat, message, user } from '../../../tests/fixtures';
import { makeServices, renderWithServices } from '../../../tests/renderWithServices';
import { addOutgoing, applyHistory } from '../../state/data';
import { DialogHost } from '../DialogHost';
import { ChatPage } from './ChatPage';

const PEER = 2;
const minute = (m: number) => new Date(Date.now() - (30 - m) * 60_000).toISOString();

function setup(messages: Message[], extra: Parameters<typeof chat>[1] = {}) {
  const ctx = makeServices({ users: [user(PEER, 'Anna')], chats: [chat(1, { peer: PEER, lastMessage: messages.at(-1) ?? null, ...extra })] });
  ctx.store.getState().updateData((d) => applyHistory(d, 1, { messages, users: [], readMarks: [], hasMore: false }, 'latest'));
  ctx.store.getState().openChat(1);
  renderWithServices(
    <>
      <ChatPage chatId={1} />
      <DialogHost />
    </>,
    ctx.services,
  );
  return ctx;
}

function rowOf(text: string): HTMLElement {
  const row = screen.getByText(text).closest('.msg-row');
  if (!(row instanceof HTMLElement)) throw new Error(`no row for ${text}`);
  return row;
}

describe('ChatPage history', () => {
  afterEach(() => vi.useRealTimers());

  it('is a log named after the chat, with a Today pill', () => {
    setup([message(1, PEER, 'hello', { id: 1, sentAt: new Date().toISOString() })]);
    const log = screen.getByRole('log', { name: 'Messages with Anna' });
    expect(within(log).getByText('Today')).toBeInTheDocument();
  });

  it('joins consecutive bubbles of one sender (4 px corners on the joined side)', () => {
    setup([
      message(1, PEER, 'one', { id: 1, sentAt: minute(0) }),
      message(1, PEER, 'two', { id: 2, sentAt: minute(1) }),
      message(1, ME, 'three', { id: 3, sentAt: minute(2) }),
    ]);
    expect(rowOf('one')).toHaveClass('msg-in', 'chained-next');
    expect(rowOf('one')).not.toHaveClass('chained-prev');
    expect(rowOf('two')).toHaveClass('chained-prev');
    expect(rowOf('three')).toHaveClass('msg-out');
    expect(rowOf('three')).not.toHaveClass('chained-prev');
  });

  it('draws ticks beside my newest bubbles and heads under the last read one', () => {
    setup(
      [message(1, ME, 'read me', { id: 1, sentAt: minute(0) }), message(1, ME, 'got it', { id: 2, sentAt: minute(1) }), message(1, ME, 'sent', { id: 3, sentAt: minute(2) })],
      { peerReadId: 1, peerDeliveredId: 2 },
    );
    expect(rowOf('read me').querySelector('[data-heads]')?.getAttribute('data-heads')).toBe(String(PEER));
    expect(rowOf('read me').querySelector('[data-tick]')).toBeNull();
    expect(rowOf('got it').querySelector('[data-tick]')?.getAttribute('data-tick')).toBe('delivered');
    expect(rowOf('sent').querySelector('[data-tick]')?.getAttribute('data-tick')).toBe('sent');
  });

  it('shows the sending clock only after 500 ms', () => {
    vi.useFakeTimers();
    const ctx = setup([message(1, PEER, 'hi', { id: 1, sentAt: minute(0) })]);
    act(() =>
      ctx.store
        .getState()
        .updateData((d) => addOutgoing(d, { clientId: 'p1', chatId: 1, text: 'on its way', replyTo: null, attachments: [], createdAt: Date.now(), state: 'pending' })),
    );
    expect(rowOf('on its way').querySelector('[data-tick="pending"]')).toBeNull();
    act(() => vi.advanceTimersByTime(500));
    expect(rowOf('on its way').querySelector('[data-tick="pending"]')).not.toBeNull();
  });

  it('shows "edited", tombstones, forwarded and quote blocks', () => {
    setup([
      message(1, PEER, 'original', { id: 1, sentAt: minute(0) }),
      message(1, PEER, 'changed', { id: 2, sentAt: minute(1), editedAt: minute(2) }),
      message(1, PEER, '', { id: 3, sentAt: minute(3), deleted: true }),
      message(1, PEER, 'passed on', { id: 4, sentAt: minute(4), forwardedFrom: PEER }),
      message(1, ME, 'answer', { id: 5, sentAt: minute(5), replyTo: { messageId: 1, sender: PEER, text: 'original', hasAttachments: false, deleted: false } }),
    ]);
    expect(rowOf('changed')).toHaveTextContent('edited');
    expect(screen.getByText('Message was deleted')).toBeInTheDocument();
    expect(screen.getByText('Forwarded from Anna')).toBeInTheDocument();
    expect(rowOf('answer').querySelector('.quote-block')).toHaveTextContent('Annaoriginal');
  });

  it('shows the typing row', () => {
    const ctx = setup([]);
    act(() => ctx.store.getState().updateData((d) => ({ ...d, typing: { 1: [PEER] } })));
    expect(screen.getByText('Anna is typing')).toBeInTheDocument();
  });
});

describe('ChatPage message actions', () => {
  it('offers the menu in the original order', async () => {
    setup([message(1, ME, 'mine', { id: 1, sentAt: minute(0) })]);
    fireEvent.contextMenu(screen.getByText('mine'));
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem').map((i) => i.textContent);
    expect(items).toEqual(['Reply', 'Copy', 'Forward', 'Select', 'Edit', 'Delete for me', 'Delete for all']);
  });

  it('replies with a quote block above the input', async () => {
    const ctx = setup([message(1, PEER, 'question?', { id: 7, sentAt: minute(0) })]);
    fireEvent.contextMenu(screen.getByText('question?'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Reply' }));
    expect(screen.getByText('Anna', { selector: '.input-panel-title' })).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Message' }), 'answer{Enter}');
    expect(ctx.chats.send).toHaveBeenCalledWith(1, 'answer', [], { messageId: 7, sender: PEER, text: 'question?', hasAttachments: false, deleted: false });
  });

  it('edits my message from the menu; the Send button becomes Edit', async () => {
    const ctx = setup([message(1, ME, 'typo', { id: 9, sentAt: minute(0) })]);
    fireEvent.contextMenu(screen.getByText('typo'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(screen.getByText('Edit message')).toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: 'Message' });
    expect(input).toHaveValue('typo');
    await userEvent.clear(input);
    await userEvent.type(input, 'fixed');
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(ctx.chats.edit).toHaveBeenCalledWith(9, 'fixed');
  });

  it('deletes for all after the confirmation', async () => {
    const ctx = setup([message(1, ME, 'oops', { id: 4, sentAt: minute(0) })]);
    fireEvent.contextMenu(screen.getByText('oops'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete for all' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete message' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(ctx.chats.deleteMessages).toHaveBeenCalledWith(1, [4], true);
  });

  it('selects messages and forwards them', async () => {
    const ctx = setup([message(1, PEER, 'a', { id: 1, sentAt: minute(0) }), message(1, PEER, 'b', { id: 2, sentAt: minute(1) })]);
    fireEvent.contextMenu(screen.getByText('a'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Select' }));
    await userEvent.click(rowOf('b'));
    expect(screen.getByText('2 messages selected')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Forward' }));
    const dialog = screen.getByRole('dialog', { name: 'Forward' });
    await userEvent.click(within(dialog).getByRole('option', { name: 'Anna' }));
    expect(ctx.chats.forward).toHaveBeenCalledWith(1, [1, 2], 1);
  });
});

describe('ChatPage reactions', () => {
  const reacted = () =>
    message(1, PEER, 'nice', {
      id: 5,
      sentAt: minute(0),
      reactions: [
        { reaction: 'like', count: 2, mine: true },
        { reaction: 'funny', count: 1, mine: false },
      ],
    });

  it('shows counts with mine highlighted, and a click on mine removes it', async () => {
    const ctx = setup([reacted()]);
    const like = screen.getByRole('button', { name: 'Like 2' });
    expect(like).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Funny 1' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(like);
    expect(ctx.chats.react).toHaveBeenCalledWith(5, null);
  });

  it('picks one of the six reactions from the hover button', async () => {
    const ctx = setup([reacted()]);
    await userEvent.click(within(rowOf('nice')).getByRole('button', { name: 'Reactions' }));
    const picker = screen.getByRole('menu', { name: 'Reactions' });
    expect(within(picker).getAllByRole('menuitem').map((i) => i.getAttribute('aria-label'))).toEqual(['Like', 'Super', 'Funny', 'Oops', 'Sad', 'Scandalous']);
    await userEvent.click(within(picker).getByRole('menuitem', { name: 'Sad' }));
    expect(ctx.chats.react).toHaveBeenCalledWith(5, 'sad');
  });
});

describe('ChatPage loading and files', () => {
  it('stops after a failed history load and retries on REPEAT', async () => {
    const ctx = makeServices({ users: [user(PEER, 'Anna')], chats: [chat(1, { peer: PEER })] });
    ctx.chats.loadHistory.mockResolvedValue(false);
    ctx.store.getState().openChat(1);
    renderWithServices(<ChatPage chatId={1} />, ctx.services);
    const repeat = await screen.findByRole('button', { name: 'REPEAT' });
    expect(ctx.chats.loadHistory).toHaveBeenCalledTimes(1);
    await userEvent.click(repeat);
    expect(ctx.chats.loadHistory).toHaveBeenCalledTimes(2);
  });

  it('quick-sends dropped files once, without the caption dialog', () => {
    const ctx = setup([]);
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    const dataTransfer = { types: ['Files'], files: [file] };
    fireEvent.dragEnter(screen.getByRole('region', { name: 'Anna' }), { dataTransfer });
    fireEvent.drop(screen.getByText('Quick send'), { dataTransfer });
    expect(ctx.chats.send).toHaveBeenCalledTimes(1);
    expect(ctx.chats.send).toHaveBeenCalledWith(1, '', [file]);
    expect(ctx.store.getState().dialog).toBeNull();
  });

  it('opens Send files for a drop on "Send with caption"', () => {
    const ctx = setup([]);
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    const dataTransfer = { types: ['Files'], files: [file] };
    fireEvent.dragEnter(screen.getByRole('region', { name: 'Anna' }), { dataTransfer });
    fireEvent.drop(screen.getByText('Send with caption'), { dataTransfer });
    expect(ctx.chats.send).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Send files' })).toBeInTheDocument();
  });

  it('moves between bubbles with the arrow keys and opens the menu from the keyboard', () => {
    setup([message(1, PEER, 'first', { id: 1, sentAt: minute(0) }), message(1, PEER, 'second', { id: 2, sentAt: minute(20) })]);
    const log = screen.getByRole('log', { name: 'Messages with Anna' });
    fireEvent.keyDown(log, { key: 'ArrowUp' });
    expect(document.activeElement).toHaveTextContent('second');
    fireEvent.keyDown(log, { key: 'ArrowUp' });
    expect(document.activeElement).toHaveTextContent('first');
    fireEvent.keyDown(document.activeElement as Element, { key: 'F10', shiftKey: true });
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});

describe('Composer', () => {
  it('does not send on the Enter that confirms an input method candidate', () => {
    const ctx = setup([]);
    const input = screen.getByRole('textbox', { name: 'Message' });
    fireEvent.change(input, { target: { value: 'nihao' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(ctx.chats.send).not.toHaveBeenCalled();
  });

  it('sends with Enter and keeps Shift+Enter for a new line', async () => {
    const ctx = setup([]);
    const input = screen.getByRole('textbox', { name: 'Message' });
    await userEvent.type(input, 'line one{Shift>}{Enter}{/Shift}line two{Enter}');
    expect(ctx.chats.send).toHaveBeenCalledWith(1, 'line one\nline two', [], null);
    expect(input).toHaveValue('');
  });

  it('follows "Send message by" Ctrl + Enter', async () => {
    const ctx = setup([]);
    act(() => ctx.store.getState().setPrefs({ sendKey: 'ctrlEnter' }));
    const input = screen.getByRole('textbox', { name: 'Message' });
    await userEvent.type(input, 'hi{Enter}');
    expect(ctx.chats.send).not.toHaveBeenCalled();
    await userEvent.type(input, '{Control>}{Enter}{/Control}');
    expect(ctx.chats.send).toHaveBeenCalledWith(1, 'hi', [], null);
  });

  it('keeps the draft per chat and announces typing', async () => {
    const ctx = setup([]);
    await userEvent.type(screen.getByRole('textbox', { name: 'Message' }), 'half');
    expect(ctx.store.getState().drafts[1]).toBe('half');
    expect(ctx.chats.typing).toHaveBeenCalledWith(1);
  });

  it('names its buttons like the original', () => {
    setup([]);
    expect(screen.getByRole('button', { name: 'Attach' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Emoji and stickers' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('replaces the input for a blocked user', () => {
    const ctx = setup([]);
    act(() => ctx.store.getState().updateData((d) => ({ ...d, users: { ...d.users, [PEER]: user(PEER, 'Anna', { blocked: true }) } })));
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
    expect(screen.getByText('The user is blocked')).toBeInTheDocument();
  });
});
