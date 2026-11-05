import { describe, expect, it } from 'vitest';
import {
  encodeWindowFeatures,
  frameNameFor,
  parseWindowFeatures,
  trayStateSchema,
  windowIdFromFrameName,
  type NativeWindowFeatures,
} from '../src/index.ts';

const FEATURES: NativeWindowFeatures = {
  left: -20,
  top: 40,
  width: 190,
  height: 450,
  resizable: true,
  minWidth: 150,
  minHeight: 240,
};

describe('window features', () => {
  it('round-trips through the window.open feature string', () => {
    expect(parseWindowFeatures(encodeWindowFeatures(FEATURES))).toEqual(FEATURES);
    expect(parseWindowFeatures(encodeWindowFeatures({ ...FEATURES, resizable: false }))?.resizable).toBe(false);
  });

  it('rejects missing, non-numeric and out-of-range values', () => {
    expect(parseWindowFeatures('')).toBeNull();
    expect(parseWindowFeatures(encodeWindowFeatures(FEATURES).replace('width=190', 'width=abc'))).toBeNull();
    expect(parseWindowFeatures(encodeWindowFeatures(FEATURES).replace('width=190', 'width=1.5'))).toBeNull();
    expect(parseWindowFeatures(encodeWindowFeatures({ ...FEATURES, width: 99_999 }))).toBeNull();
  });
});

describe('frame names', () => {
  it('carries the window id and refuses foreign names', () => {
    expect(windowIdFromFrameName(frameNameFor('message:100001'))).toBe('message:100001');
    expect(windowIdFromFrameName(frameNameFor('contactList'))).toBe('contactList');
    expect(windowIdFromFrameName('message:100001')).toBeNull();
    expect(windowIdFromFrameName(frameNameFor('../evil'))).toBeNull();
    expect(windowIdFromFrameName('_blank')).toBeNull();
  });
});

describe('tray state', () => {
  const icon = 'data:image/png;base64,iVBORw0KGgo=';

  it('accepts a menu of items and separators', () => {
    const state = {
      icon: { x1: icon, x2: icon },
      tooltip: 'openICQ',
      badge: 2,
      menu: [{ type: 'item', id: 'status:away', label: 'Away', enabled: true, checked: false }, { type: 'separator' }],
    };
    expect(trayStateSchema.parse(state)).toEqual(state);
  });

  it('refuses icons that are not PNG data URLs', () => {
    const result = trayStateSchema.safeParse({ icon: { x1: 'file:///etc/passwd', x2: icon }, tooltip: '', badge: 0, menu: [] });
    expect(result.success).toBe(false);
  });
});
