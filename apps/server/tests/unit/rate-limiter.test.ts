import { describe, expect, it } from 'vitest';
import { SlidingWindowRateLimiter } from '../../src/transport/rate-limiter.ts';

describe('SlidingWindowRateLimiter', () => {
  it('allows up to the limit per window and per key, then reports when to retry', () => {
    let now = 0;
    const limiter = new SlidingWindowRateLimiter(3, 1000, () => now);
    expect([1, 2, 3].map(() => limiter.attempt('a').allowed)).toEqual([true, true, true]);
    expect(limiter.attempt('a')).toEqual({ allowed: false, retryAfterMs: 1000 });
    expect(limiter.attempt('b').allowed).toBe(true);

    now = 999;
    expect(limiter.attempt('a').allowed).toBe(false);
    now = 1000;
    expect(limiter.attempt('a').allowed).toBe(true);
  });
});
