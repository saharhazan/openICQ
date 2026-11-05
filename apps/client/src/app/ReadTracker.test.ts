import { describe, expect, it, vi } from 'vitest';
import { chat, message, snapshot } from '../../tests/fixtures';
import { applyEvent, applyHistory, applySnapshot } from '../state/data';
import { createAppStore } from '../state/store';
import { ReadTracker } from './ReadTracker';

function setup(focused: boolean) {
  const store = createAppStore({ phase: 'main' });
  const first = message(1, 2, 'a', { id: 10 });
  store.getState().updateData((d) => applySnapshot(d, snapshot({ chats: [chat(1, { peer: 2, unread: 1, lastMessage: first })] })));
  const markRead = vi.fn().mockResolvedValue(undefined);
  const focus = { value: focused };
  const target = new EventTarget();
  const tracker = new ReadTracker({ store, focus: { focused: () => focus.value }, markRead, targets: [target] });
  tracker.start();
  const loadHistory = () => store.getState().updateData((d) => applyHistory(d, 1, { messages: [first], users: [], readMarks: [], hasMore: false }, 'latest'));
  return { store, markRead, focus, target, tracker, loadHistory };
}

describe('ReadTracker', () => {
  it('marks the open chat read once its history is on screen', () => {
    const { store, markRead, loadHistory } = setup(true);
    store.getState().openChat(1);
    expect(markRead).not.toHaveBeenCalled();
    loadHistory();
    expect(markRead).toHaveBeenCalledWith(1);
  });

  it('waits for the focus before marking read', () => {
    const { store, markRead, focus, target, loadHistory } = setup(false);
    store.getState().openChat(1);
    loadHistory();
    expect(markRead).not.toHaveBeenCalled();
    focus.value = true;
    target.dispatchEvent(new Event('focus'));
    expect(markRead).toHaveBeenCalledWith(1);
  });

  it('marks read again when a newer message arrives', () => {
    const { store, markRead, loadHistory } = setup(true);
    store.getState().openChat(1);
    loadHistory();
    const next = message(1, 2, 'b', { id: 11 });
    store.getState().updateData((d) => applyEvent(d, { type: 'message', message: next, chat: chat(1, { peer: 2, lastMessage: next }), users: [] }));
    expect(markRead).toHaveBeenCalledTimes(2);
  });

  it('does not mark read while a settings page covers the chat', () => {
    const { store, markRead, loadHistory } = setup(true);
    store.getState().openChat(1);
    store.getState().patch({ tab: 'settings', settingsPage: 'general' });
    loadHistory();
    expect(markRead).not.toHaveBeenCalled();
  });

  it('leaves a chat marked unread until something new happens', () => {
    const { store, markRead, loadHistory } = setup(true);
    store.getState().openChat(1);
    loadHistory();
    store.getState().updateData((d) => ({ ...d, chats: { ...d.chats, 1: { ...chat(1, { peer: 2 }), markedUnread: true, lastMessage: d.chats[1]?.lastMessage ?? null } } }));
    expect(markRead).toHaveBeenCalledTimes(1);
  });
});
