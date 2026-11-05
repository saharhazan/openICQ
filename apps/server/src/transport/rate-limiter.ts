/** Sliding-window rate limiter keyed by a string (an IP address, a connection). */

export interface RateDecision {
  readonly allowed: boolean;
  /** Milliseconds until the next attempt would be allowed; 0 when allowed. */
  readonly retryAfterMs: number;
}

/** Above this many tracked keys, stale ones are swept, at most once per window. */
const SWEEP_THRESHOLD = 10_000;

export class SlidingWindowRateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly attempts = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(limit: number, windowMs: number, now: () => number = Date.now) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  /** Records an attempt and says whether it is within the limit. Rejected attempts are not recorded. */
  attempt(key: string): RateDecision {
    const now = this.now();
    if (this.attempts.size > SWEEP_THRESHOLD && now - this.lastSweep >= this.windowMs) this.sweep(now);
    const recent = (this.attempts.get(key) ?? []).filter((at) => now - at < this.windowMs);
    if (recent.length >= this.limit) {
      this.attempts.set(key, recent);
      const oldest = recent[0] ?? now;
      return { allowed: false, retryAfterMs: Math.max(0, oldest + this.windowMs - now) };
    }
    this.attempts.set(key, [...recent, now]);
    return { allowed: true, retryAfterMs: 0 };
  }

  private sweep(now: number): void {
    this.lastSweep = now;
    for (const [key, times] of this.attempts) {
      if (times.every((at) => now - at >= this.windowMs)) this.attempts.delete(key);
    }
  }
}
