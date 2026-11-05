import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFS, type DevicePrefs } from './devicePrefs';
import { Notifier, SOUND_INTERVAL_MS, type WebNotifications } from './Notifier';

function setup(prefs: Partial<DevicePrefs> = {}, focused = false) {
  let now = 10_000;
  const sounds = { play: vi.fn(), unlock: vi.fn() };
  const web = {
    permission: (): NotificationPermission => 'granted',
    request: vi.fn<WebNotifications['request']>().mockResolvedValue('granted'),
    show: vi.fn<WebNotifications['show']>(),
  };
  const setTitle = vi.fn();
  const notifier = new Notifier({
    bridge: null,
    web,
    sounds,
    focus: { focused: () => focused },
    prefs: () => ({ ...DEFAULT_PREFS, ...prefs }),
    setTitle,
    onOpenChat: vi.fn(),
    onError: vi.fn(),
    now: () => now,
  });
  return { notifier, sounds, web, setTitle, advance: (ms: number) => (now += ms) };
}

const alert = { chatId: 3, title: 'Anna', sender: null, text: 'hello', chatOpen: false };

describe('Notifier', () => {
  it('plays uh-oh and shows a notification when the window is in the background', () => {
    const { notifier, sounds, web } = setup();
    notifier.incoming(alert);
    expect(sounds.play).toHaveBeenCalledWith('incoming');
    expect(web.show).toHaveBeenCalledWith('Anna', { body: 'hello', tag: 'chat-3', silent: true }, expect.any(Function));
  });

  it('plays at most one sound every 3 seconds', () => {
    const { notifier, sounds, advance } = setup();
    notifier.incoming(alert);
    notifier.incoming(alert);
    advance(SOUND_INTERVAL_MS);
    notifier.incoming(alert);
    expect(sounds.play).toHaveBeenCalledTimes(2);
  });

  it('stays quiet for the chat open in a focused window', () => {
    const { notifier, sounds, web } = setup({}, true);
    notifier.incoming({ ...alert, chatOpen: true });
    expect(sounds.play).not.toHaveBeenCalled();
    expect(web.show).not.toHaveBeenCalled();
  });

  it('shows no notification in focus unless asked to', () => {
    const quiet = setup({}, true);
    quiet.notifier.incoming(alert);
    expect(quiet.web.show).not.toHaveBeenCalled();
    const loud = setup({ showInFocus: true }, true);
    loud.notifier.incoming(alert);
    expect(loud.web.show).toHaveBeenCalled();
  });

  it('hides the text and the sender when the settings say so', () => {
    const { notifier, web } = setup({ hideText: true, hideSender: true });
    notifier.incoming({ ...alert, sender: 'Ben' });
    expect(web.show).toHaveBeenCalledWith('openICQ', expect.objectContaining({ body: 'New message' }), expect.any(Function));
  });

  it('follows Play sounds and Show notifications', () => {
    const { notifier, sounds, web } = setup({ playSounds: false, showNotifications: false });
    notifier.incoming(alert);
    expect(sounds.play).not.toHaveBeenCalled();
    expect(web.show).not.toHaveBeenCalled();
  });

  it('puts the unread count in the title', () => {
    const { notifier, setTitle } = setup();
    notifier.setUnread(3);
    notifier.setUnread(3);
    notifier.setUnread(0);
    expect(setTitle.mock.calls).toEqual([['(3) openICQ'], ['openICQ']]);
  });

  it('plays the outgoing sound only when it is on', () => {
    const off = setup();
    off.notifier.outgoing();
    expect(off.sounds.play).not.toHaveBeenCalled();
    const on = setup({ outgoingSound: true });
    on.notifier.outgoing();
    expect(on.sounds.play).toHaveBeenCalledWith('outgoing');
  });
});
