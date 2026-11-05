import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileSweeper, SWEEP_BATCH } from '../../src/application/file-sweeper.ts';

const SCHEDULE = { intervalMs: 1000, maxAgeMs: 3600_000 };
type LogMethod = (details: object, message: string) => void;

describe('FileSweeper', () => {
  let sweep: ReturnType<typeof vi.fn<(maxAgeMs: number, limit: number) => Promise<number>>>;
  let log: { error: ReturnType<typeof vi.fn<LogMethod>>; info: ReturnType<typeof vi.fn<LogMethod>> };
  let sweeper: FileSweeper;

  beforeEach(() => {
    vi.useFakeTimers();
    sweep = vi.fn<(maxAgeMs: number, limit: number) => Promise<number>>();
    log = { error: vi.fn<LogMethod>(), info: vi.fn<LogMethod>() };
    sweeper = new FileSweeper({ sweepUnreferenced: sweep }, log, SCHEDULE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sweeps on every interval, in batches while they come back full, and logs what it deleted', async () => {
    sweep.mockResolvedValueOnce(SWEEP_BATCH).mockResolvedValueOnce(3).mockResolvedValue(0);
    sweeper.start();
    await vi.advanceTimersByTimeAsync(SCHEDULE.intervalMs - 1);
    expect(sweep).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(sweep.mock.calls).toEqual([
      [SCHEDULE.maxAgeMs, SWEEP_BATCH],
      [SCHEDULE.maxAgeMs, SWEEP_BATCH],
    ]);
    expect(log.info).toHaveBeenCalledWith({ removed: SWEEP_BATCH + 3 }, 'deleted unused files');
    await vi.advanceTimersByTimeAsync(SCHEDULE.intervalMs);
    expect(sweep).toHaveBeenCalledTimes(3);
    expect(log.info).toHaveBeenCalledTimes(1);
    await sweeper.stop();
  });

  it('runs on an unref timer and stops on close, waiting for a sweep in progress', async () => {
    let finish: (removed: number) => void = () => undefined;
    sweep.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const intervals = vi.spyOn(globalThis, 'setInterval');
    sweeper.start();
    expect(intervals.mock.results[0]?.value.hasRef()).toBe(false);
    await vi.advanceTimersByTimeAsync(SCHEDULE.intervalMs);

    let stopped = false;
    const stopping = sweeper.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toBe(false);
    finish(0);
    await stopping;
    await vi.advanceTimersByTimeAsync(10 * SCHEDULE.intervalMs);
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('logs a failed sweep and keeps running', async () => {
    sweep.mockRejectedValueOnce(new Error('database is locked')).mockResolvedValue(0);
    sweeper.start();
    await vi.advanceTimersByTimeAsync(SCHEDULE.intervalMs);
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ removed: 0 }), 'file sweep failed');
    await vi.advanceTimersByTimeAsync(SCHEDULE.intervalMs);
    expect(sweep).toHaveBeenCalledTimes(2);
    await sweeper.stop();
  });
});
