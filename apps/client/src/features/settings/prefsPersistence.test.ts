import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFS, parsePrefs } from '../../app/devicePrefs';
import { LocalPrefs } from '../../app/LocalPrefs';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

describe('device settings persistence', () => {
  it('saves and loads the settings of this device', () => {
    const storage = fakeStorage();
    const onError = vi.fn();
    const prefs = new LocalPrefs(() => storage, onError);
    prefs.savePrefs({ ...DEFAULT_PREFS, theme: 'dark-green', sendKey: 'shiftEnter', compact: true });
    expect(new LocalPrefs(() => storage, onError).loadPrefs()).toMatchObject({ theme: 'dark-green', sendKey: 'shiftEnter', compact: true });
    expect(onError).not.toHaveBeenCalled();
  });

  it('starts from the ICQ New defaults when nothing is saved', () => {
    expect(new LocalPrefs(() => fakeStorage(), vi.fn()).loadPrefs()).toEqual(DEFAULT_PREFS);
    expect(DEFAULT_PREFS).toMatchObject({ playSounds: true, outgoingSound: false, showInFocus: false, animateTaskbar: false, sendKey: 'enter' });
  });

  it('keeps the valid fields of a damaged record and defaults the rest', () => {
    expect(parsePrefs({ theme: 'purple', fontSize: 'large', playSounds: 'yes', columnWidth: 9999 })).toEqual({ ...DEFAULT_PREFS, fontSize: 'large' });
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
  });

  it('reports unreadable saved JSON and falls back to the defaults', () => {
    const onError = vi.fn();
    const prefs = new LocalPrefs(() => fakeStorage({ 'openicq.prefs': '{broken' }), onError);
    expect(prefs.loadPrefs()).toEqual(DEFAULT_PREFS);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
