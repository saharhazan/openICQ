import { describe, expect, it } from 'vitest';
import { findDesktopBridge } from './bridge';

describe('findDesktopBridge', () => {
  it('finds the preload bridge by its platform tag and ignores anything else', () => {
    const bridge = { platform: 'win32' };
    expect(findDesktopBridge({ openicqDesktop: bridge })).toBe(bridge);
    expect(findDesktopBridge({})).toBeNull();
    expect(findDesktopBridge({ openicqDesktop: { platform: 'beos' } })).toBeNull();
    expect(findDesktopBridge({ openicqDesktop: 'yes' })).toBeNull();
  });
});
