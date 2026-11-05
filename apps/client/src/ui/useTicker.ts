import { useSyncExternalStore } from 'react';

/** One shared interval per period, so every blinking icon on screen blinks in phase. */
class Ticker {
  readonly #periodMs: number;
  readonly #listeners = new Set<() => void>();
  #timer: ReturnType<typeof setInterval> | null = null;
  #count = 0;

  constructor(periodMs: number) {
    this.#periodMs = periodMs;
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    if (this.#timer === null) {
      this.#timer = setInterval(() => {
        this.#count += 1;
        this.#listeners.forEach((l) => l());
      }, this.#periodMs);
    }
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0 && this.#timer !== null) {
        clearInterval(this.#timer);
        this.#timer = null;
      }
    };
  };

  readonly count = (): number => this.#count;
}

const tickers = new Map<number, Ticker>();
function tickerFor(periodMs: number): Ticker {
  let ticker = tickers.get(periodMs);
  if (!ticker) {
    ticker = new Ticker(periodMs);
    tickers.set(periodMs, ticker);
  }
  return ticker;
}

const noopSubscribe = () => () => undefined;
const zero = () => 0;

/** A counter that advances every `periodMs` while `active`; 0 otherwise. */
export function useTick(active: boolean, periodMs: number): number {
  const ticker = tickerFor(periodMs);
  return useSyncExternalStore(active ? ticker.subscribe : noopSubscribe, active ? ticker.count : zero);
}

/** True and false in turns every ~500 ms while active, the ICQ blink rhythm. */
export function useBlink(active: boolean, periodMs = 500): boolean {
  const tick = useTick(active, periodMs);
  return !active || tick % 2 === 0;
}
