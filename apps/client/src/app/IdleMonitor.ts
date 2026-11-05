export type IdleLevel = 'active' | 'away' | 'na';

type ActivityTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export interface IdleMonitorOptions {
  target: ActivityTarget;
  onChange: (level: IdleLevel) => void;
  now?: () => number;
  /** How often idleness is checked. Activity itself is recorded immediately. */
  checkIntervalMs?: number;
}

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
const MINUTE_MS = 60_000;

/**
 * Watches keyboard and pointer activity and reports when the user has been
 * idle long enough for auto-away, and then long enough in Away for auto-N/A
 * (the original "Set N/A status after X minutes of Away mode"). 0 disables a level;
 * N/A follows Away, so it needs auto-away enabled.
 */
export class IdleMonitor {
  readonly #target: ActivityTarget;
  readonly #onChange: (level: IdleLevel) => void;
  readonly #now: () => number;
  readonly #checkIntervalMs: number;
  #awayMs = 0;
  #naMs = 0;
  #lastActivity = 0;
  #level: IdleLevel = 'active';
  #timer: ReturnType<typeof setInterval> | null = null;
  readonly #onActivity = () => this.#activity();

  constructor(options: IdleMonitorOptions) {
    this.#target = options.target;
    this.#onChange = options.onChange;
    this.#now = options.now ?? Date.now;
    this.#checkIntervalMs = options.checkIntervalMs ?? 5_000;
  }

  get level(): IdleLevel {
    return this.#level;
  }

  /** `naMinutes` counts from the moment Away was set, as in the original preference. */
  configure(awayMinutes: number, naMinutes: number): void {
    this.#awayMs = Math.max(0, awayMinutes) * MINUTE_MS;
    this.#naMs = Math.max(0, naMinutes) * MINUTE_MS;
    if (this.#timer !== null) this.#check();
  }

  start(): void {
    if (this.#timer !== null) return;
    this.#lastActivity = this.#now();
    this.#level = 'active';
    for (const type of ACTIVITY_EVENTS) this.#target.addEventListener(type, this.#onActivity, { passive: true });
    this.#timer = setInterval(() => this.#check(), this.#checkIntervalMs);
  }

  stop(): void {
    if (this.#timer === null) return;
    clearInterval(this.#timer);
    this.#timer = null;
    for (const type of ACTIVITY_EVENTS) this.#target.removeEventListener(type, this.#onActivity);
    this.#level = 'active';
  }

  #activity(): void {
    this.#lastActivity = this.#now();
    if (this.#level !== 'active') this.#setLevel('active');
  }

  #check(): void {
    const idle = this.#now() - this.#lastActivity;
    let level: IdleLevel = 'active';
    if (this.#awayMs > 0 && this.#naMs > 0 && idle >= this.#awayMs + this.#naMs) level = 'na';
    else if (this.#awayMs > 0 && idle >= this.#awayMs) level = 'away';
    if (level !== this.#level) this.#setLevel(level);
  }

  #setLevel(level: IdleLevel): void {
    this.#level = level;
    this.#onChange(level);
  }
}
