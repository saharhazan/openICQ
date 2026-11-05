import { LIMITS } from '@openicq/protocol';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { contact, message, SELF, snapshot } from '../../../tests/fixtures';
import { makeServices, renderWithServices } from '../../../tests/renderWithServices';
import { renderWindow } from '../WindowHost';
import { isSendShortcut } from './MessageDialog';

const BOB = 200003;

function setup(status: 'online' | 'occupied' | 'dnd' = 'online') {
  const ctx = makeServices();
  const state = ctx.store.getState();
  state.setSession({ uin: SELF, nickname: 'Me' });
  state.applySnapshot(snapshot({ contacts: [contact(BOB, 'Bob', { status })] }));
  state.setConnection('open');
  const id = state.openWindow({ kind: 'message', uin: BOB });
  const win = ctx.store.getState().windows.list.find((w) => w.id === id);
  if (!win) throw new Error('window not opened');
  ctx.commands.sendMessage.mockResolvedValue({ message: message(SELF, BOB, 'hi', { read: true }), autoResponse: null });
  renderWithServices(<>{renderWindow(win)}</>, ctx.services);
  return ctx;
}

describe('isSendShortcut', () => {
  it('sends on Ctrl+Enter or Cmd+Enter only', () => {
    expect(isSendShortcut({ key: 'Enter', ctrlKey: true, metaKey: false })).toBe(true);
    expect(isSendShortcut({ key: 'Enter', ctrlKey: false, metaKey: true })).toBe(true);
    expect(isSendShortcut({ key: 'Enter', ctrlKey: false, metaKey: false })).toBe(false);
  });
});

describe('MessageDialog', () => {
  it('Enter inserts a new line and Ctrl+Enter sends', async () => {
    const { commands } = setup();
    const user = userEvent.setup();
    const box = screen.getByRole('textbox', { name: 'Message' });
    await user.type(box, 'hello{Enter}there');
    expect(box).toHaveValue('hello\nthere');
    expect(commands.sendMessage).not.toHaveBeenCalled();
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(commands.sendMessage).toHaveBeenCalledWith(BOB, 'hello\nthere', false);
    await waitFor(() => expect(box).toHaveValue(''));
  });

  it('shows the Chars counter and refuses text over the server limit', async () => {
    const { commands } = setup();
    const box = screen.getByRole('textbox', { name: 'Message' });
    fireEvent.change(box, { target: { value: 'x'.repeat(LIMITS.messageText + 1) } });
    expect(screen.getByText(`Chars: ${LIMITS.messageText + 1}/${LIMITS.messageText}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    expect(screen.getByRole('alert')).toHaveTextContent(`Message exceeds server limit (${LIMITS.messageText} chars).`);
    expect(commands.sendMessage).not.toHaveBeenCalled();
  });

  it('asks Send Urgent or Send To Contact List when the contact is Occupied', async () => {
    const { commands } = setup('occupied');
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'ping');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(commands.sendMessage).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Send Urgent' }));
    expect(commands.sendMessage).toHaveBeenCalledWith(BOB, 'ping', true);
  });

  it('offers only Send To Contact List when the contact is DND', async () => {
    const { commands } = setup('dnd');
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'ping');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.queryByRole('button', { name: 'Send Urgent' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Send To Contact List' }));
    expect(commands.sendMessage).toHaveBeenCalledWith(BOB, 'ping', false);
  });
});
