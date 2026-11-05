import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdleMonitor, type IdleLevel } from './IdleMonitor';

const MINUTE = 60_000;

describe('IdleMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(away: number, na: number) {
    const target = new EventTarget();
    const levels: IdleLevel[] = [];
    const monitor = new IdleMonitor({ target, onChange: (l) => levels.push(l), checkIntervalMs: 1_000 });
    monitor.configure(away, na);
    monitor.start();
    return { target, levels, monitor };
  }

  it('reports Away after the away minutes and N/A after that many minutes of Away mode', () => {
    const { levels, monitor } = setup(10, 20);
    vi.advanceTimersByTime(10 * MINUTE - 1_000);
    expect(levels).toEqual([]);
    vi.advanceTimersByTime(1_000);
    expect(levels).toEqual(['away']);
    vi.advanceTimersByTime(20 * MINUTE - 1_000);
    expect(levels).toEqual(['away']);
    vi.advanceTimersByTime(1_000);
    expect(levels).toEqual(['away', 'na']);
    monitor.stop();
  });

  it('activity resets the timer and reports active once after idling', () => {
    const { target, levels, monitor } = setup(5, 20);
    vi.advanceTimersByTime(4 * MINUTE);
    target.dispatchEvent(new Event('keydown'));
    vi.advanceTimersByTime(4 * MINUTE);
    expect(levels).toEqual([]);
    vi.advanceTimersByTime(1 * MINUTE);
    expect(levels).toEqual(['away']);
    target.dispatchEvent(new Event('pointermove'));
    target.dispatchEvent(new Event('pointermove'));
    expect(levels).toEqual(['away', 'active']);
    monitor.stop();
  });

  it('0 minutes disables a level, and N/A needs auto-away', () => {
    const noNa = setup(5, 0);
    vi.advanceTimersByTime(60 * MINUTE);
    expect(noNa.levels).toEqual(['away']);
    noNa.monitor.stop();
    const noAway = setup(0, 10);
    vi.advanceTimersByTime(60 * MINUTE);
    expect(noAway.levels).toEqual([]);
    noAway.monitor.stop();
  });

  it('stops listening after stop()', () => {
    const { target, levels, monitor } = setup(1, 0);
    monitor.stop();
    vi.advanceTimersByTime(10 * MINUTE);
    target.dispatchEvent(new Event('keydown'));
    expect(levels).toEqual([]);
  });
});
