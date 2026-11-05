import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemActivityTarget } from './SystemActivityTarget';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SystemActivityTarget', () => {
  it('reports activity when the computer saw input since the last poll, and stops with the last listener', async () => {
    let idle = 1;
    const target = new SystemActivityTarget(async () => idle, vi.fn(), 5_000);
    const listener = vi.fn<(event: Event) => void>();
    target.addEventListener('pointermove', listener);
    target.addEventListener('keydown', listener);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(listener).toHaveBeenCalledTimes(1);

    idle = 30;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(listener).toHaveBeenCalledTimes(1);

    target.removeEventListener('pointermove', listener);
    idle = 0;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reports a failing idle query once', async () => {
    const onError = vi.fn<(error: Error) => void>();
    const target = new SystemActivityTarget(() => Promise.reject(new Error('no powerMonitor')), onError, 1_000);
    target.addEventListener('pointermove', vi.fn<(event: Event) => void>());
    await vi.advanceTimersByTimeAsync(3_000);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ message: 'openICQ cannot read how long the computer has been idle.' });
  });
});
