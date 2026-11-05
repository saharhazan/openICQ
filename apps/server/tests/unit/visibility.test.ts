import { describe, expect, it } from 'vitest';
import type { SettableStatus } from '@openicq/protocol';
import { visibleStatus } from '../../src/domain/visibility.ts';

const VISIBLE: SettableStatus[] = ['online', 'ffc', 'away', 'na', 'occupied', 'dnd'];

describe('visibleStatus', () => {
  it('is offline when the target is not connected', () => {
    expect(visibleStatus({ awaitingAuth: false }, { status: null, ignoresViewer: false })).toBe('offline');
  });

  it('is offline when the target is invisible', () => {
    expect(visibleStatus({ awaitingAuth: false }, { status: 'invisible', ignoresViewer: false })).toBe('offline');
  });

  it.each(VISIBLE)('is offline for %s when the target ignores the viewer', (status) => {
    expect(visibleStatus({ awaitingAuth: false }, { status, ignoresViewer: true })).toBe('offline');
  });

  it.each(VISIBLE)('is offline for %s while the viewer awaits authorization', (status) => {
    expect(visibleStatus({ awaitingAuth: true }, { status, ignoresViewer: false })).toBe('offline');
  });

  it.each(VISIBLE)('shows %s when nothing hides it', (status) => {
    expect(visibleStatus({ awaitingAuth: false }, { status, ignoresViewer: false })).toBe(status);
  });

  it('covers the full truth table', () => {
    const statuses: (SettableStatus | null)[] = [null, 'invisible', ...VISIBLE];
    for (const status of statuses) {
      for (const ignoresViewer of [false, true]) {
        for (const awaitingAuth of [false, true]) {
          const hidden = status === null || status === 'invisible' || ignoresViewer || awaitingAuth;
          expect(visibleStatus({ awaitingAuth }, { status, ignoresViewer })).toBe(hidden ? 'offline' : status);
        }
      }
    }
  });
});
