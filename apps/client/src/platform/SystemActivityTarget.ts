/**
 * Feeds IdleMonitor from the computer-wide idle time, as the original ICQ did
 * ("minutes of not using the computer"). In the desktop app keyboard and mouse
 * input lands in many native windows, and away from them, so watching one page
 * would be wrong. It emits an activity event whenever the system saw input
 * since the previous poll.
 */
type Listener = EventListenerOrEventListenerObject;

export class SystemActivityTarget implements Pick<EventTarget, 'addEventListener' | 'removeEventListener'> {
  readonly #idleSeconds: () => Promise<number>;
  readonly #onError: (error: Error) => void;
  readonly #pollMs: number;
  readonly #listeners = new Set<Listener>();
  #timer: ReturnType<typeof setInterval> | null = null;
  #failed = false;

  constructor(idleSeconds: () => Promise<number>, onError: (error: Error) => void, pollMs = 5_000) {
    this.#idleSeconds = idleSeconds;
    this.#onError = onError;
    this.#pollMs = pollMs;
  }

  addEventListener(_type: string, listener: Listener | null): void {
    if (!listener) return;
    this.#listeners.add(listener);
    if (this.#timer === null) this.#timer = setInterval(() => this.#poll(), this.#pollMs);
  }

  removeEventListener(_type: string, listener: Listener | null): void {
    if (listener) this.#listeners.delete(listener);
    if (this.#listeners.size === 0 && this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  #poll(): void {
    this.#idleSeconds().then(
      (seconds) => {
        if (seconds * 1000 < this.#pollMs) this.#emit();
      },
      (error: unknown) => {
        // Reported once: auto-away then simply stops following the computer.
        if (this.#failed) return;
        this.#failed = true;
        this.#onError(new Error('openICQ cannot read how long the computer has been idle.', { cause: error }));
      },
    );
  }

  #emit(): void {
    const event = new Event('pointermove');
    for (const listener of [...this.#listeners]) {
      if (typeof listener === 'function') listener(event);
      else listener.handleEvent(event);
    }
  }
}
