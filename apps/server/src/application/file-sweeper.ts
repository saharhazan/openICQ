/**
 * Background sweep of uploads nothing uses: files that were never sent and
 * avatars nobody shows, once they are older than an hour. Runs every ten
 * minutes on an unref'd timer, so it never keeps the process alive.
 */
import type { JobLog } from '../domain/ports.ts';
import type { FileService } from './file-service.ts';

export const FILE_SWEEP_INTERVAL_MS = 10 * 60 * 1000;
export const UNUSED_FILE_AGE_MS = 60 * 60 * 1000;
/** Rows deleted per statement; a sweep keeps going while batches come back full. */
export const SWEEP_BATCH = 500;

export interface FileSweepSchedule {
  readonly intervalMs: number;
  /** How old an unused file must be before it is deleted. */
  readonly maxAgeMs: number;
}

export const DEFAULT_FILE_SWEEP: FileSweepSchedule = { intervalMs: FILE_SWEEP_INTERVAL_MS, maxAgeMs: UNUSED_FILE_AGE_MS };

export class FileSweeper {
  private readonly files: Pick<FileService, 'sweepUnreferenced'>;
  private readonly log: JobLog;
  private readonly schedule: FileSweepSchedule;
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private stopped = false;

  constructor(files: Pick<FileService, 'sweepUnreferenced'>, log: JobLog, schedule: FileSweepSchedule) {
    this.files = files;
    this.log = log;
    this.schedule = schedule;
  }

  start(): void {
    if (this.timer !== null) return;
    this.stopped = false;
    this.timer = setInterval(() => {
      this.run().catch((error: unknown) => this.log.error({ err: error }, 'file sweep failed'));
    }, this.schedule.intervalMs);
    this.timer.unref();
  }

  /** Stops the timer and waits for a sweep in progress, so nothing touches the database after close. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    await this.running;
  }

  /** One sweep; a call while one runs joins it instead of starting a second. */
  run(): Promise<void> {
    this.running ??= this.sweep().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async sweep(): Promise<void> {
    let removed = 0;
    let batch: number;
    try {
      do {
        batch = await this.files.sweepUnreferenced(this.schedule.maxAgeMs, SWEEP_BATCH);
        removed += batch;
      } while (batch === SWEEP_BATCH && !this.stopped);
    } catch (error) {
      this.log.error({ err: error, removed }, 'file sweep failed');
      return;
    }
    if (removed > 0) this.log.info({ removed }, 'deleted unused files');
  }
}
