import type {JobProgress, JobRow} from '../db/schema';
import {
  claimNextJob,
  completeJob,
  failInterruptedJobs,
  failJob,
  heartbeat,
  isCancelRequested,
  markCancelled,
  reportProgress,
} from './queue';

/**
 * Runs queued jobs inside the server process. One job per lane at a time (a browser profile can only be open
 * once), a few lanes in parallel. Cancelling works through an AbortSignal the handler must respect.
 */

/** A failure the user can act on. `message` is Arabic and is shown as-is. */
export class JobError extends Error {
  constructor(
    message: string,
    readonly code: string = 'error',
  ) {
    super(message);
    this.name = 'JobError';
  }
}

/** Thrown by `throwIfCancelled()`; the worker records the job as cancelled, not failed. */
export class JobCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'JobCancelled';
  }
}

export interface JobContext {
  job: JobRow;
  signal: AbortSignal;
  progress(progress: JobProgress): void;
  throwIfCancelled(): void;
  /** Waits, but wakes up early (with JobCancelled) if the job is cancelled. */
  sleep(ms: number): Promise<void>;
}

export type JobHandler = (ctx: JobContext) => Promise<Record<string, unknown> | void>;

export interface WorkerOptions {
  pollMs?: number;
  /** How often a running job checks whether the user asked to cancel it, and refreshes its heartbeat. */
  watchMs?: number;
  maxConcurrent?: number;
  /** For errors that are not JobError: where to log them (the user sees a generic message). */
  onUnexpectedError?: (error: unknown, job: JobRow) => void;
}

export const UNEXPECTED_MESSAGE = 'حدث خطأ غير متوقع أثناء تنفيذ المهمة. جرّب مرة ثانية، وإذا تكرر راجع سجل الخادم.';

/** Errors from elsewhere that already carry a user-facing Arabic message and a reason (e.g. CollectorBlocked). */
interface UserFacingError extends Error {
  reason: string;
}

function isUserFacing(error: unknown): error is UserFacingError {
  return error instanceof Error && error.name === 'CollectorBlocked' && typeof (error as UserFacingError).reason === 'string';
}

export class Worker {
  private readonly running = new Map<number, {lane: string; promise: Promise<void>; controller: AbortController}>();
  private timer: NodeJS.Timeout | undefined;
  private stopping = false;
  private readonly pollMs: number;
  private readonly watchMs: number;
  private readonly maxConcurrent: number;

  constructor(
    private readonly handlers: Record<string, JobHandler>,
    private readonly options: WorkerOptions = {},
  ) {
    this.pollMs = options.pollMs ?? 500;
    this.watchMs = options.watchMs ?? 1000;
    this.maxConcurrent = options.maxConcurrent ?? 2;
  }

  /** Marks jobs left running by a previous process as interrupted, then starts polling. */
  start(): void {
    if (this.timer) return;
    this.stopping = false;
    failInterruptedJobs();
    this.timer = setInterval(() => this.tick(), this.pollMs);
    this.tick();
  }

  /** Stops taking jobs and aborts the running ones; they end as interrupted. */
  async stop(): Promise<void> {
    this.stopping = true;
    clearInterval(this.timer);
    this.timer = undefined;
    for (const entry of this.running.values()) entry.controller.abort();
    await Promise.allSettled([...this.running.values()].map(entry => entry.promise));
  }

  /** Resolves when no job is running and none is waiting that this worker could take (for tests). */
  async idle(): Promise<void> {
    for (;;) {
      this.tick();
      if (this.running.size === 0) return;
      await Promise.allSettled([...this.running.values()].map(entry => entry.promise));
    }
  }

  get activeCount(): number {
    return this.running.size;
  }

  private tick(): void {
    if (this.stopping) return;
    while (this.running.size < this.maxConcurrent) {
      const busy = [...new Set([...this.running.values()].map(entry => entry.lane))];
      let job: JobRow | undefined;
      try {
        job = claimNextJob(Object.keys(this.handlers), busy);
      } catch {
        return; // the database is busy for a moment: try again on the next tick
      }
      if (!job) return;
      const controller = new AbortController();
      const promise = this.run(job, controller).finally(() => this.running.delete(job.id));
      this.running.set(job.id, {lane: job.lane, promise, controller});
    }
  }

  private async run(job: JobRow, controller: AbortController): Promise<void> {
    const handler = this.handlers[job.type];
    const {signal} = controller;
    let cancelled = false;
    const watch = setInterval(() => {
      try {
        heartbeat(job.id);
        if (!cancelled && isCancelRequested(job.id)) {
          cancelled = true;
          controller.abort();
        }
      } catch {
        // a busy database must not kill the job; the next check retries
      }
    }, this.watchMs);

    const throwIfCancelled = () => {
      if (signal.aborted) throw new JobCancelled();
    };
    const ctx: JobContext = {
      job,
      signal,
      progress: progress => {
        throwIfCancelled();
        reportProgress(job.id, progress);
      },
      throwIfCancelled,
      sleep: ms =>
        new Promise<void>((resolve, reject) => {
          if (signal.aborted) return reject(new JobCancelled());
          const t = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
          }, ms);
          const onAbort = () => {
            clearTimeout(t);
            reject(new JobCancelled());
          };
          signal.addEventListener('abort', onAbort, {once: true});
        }),
    };

    try {
      if (!handler) throw new JobError(`لا يوجد منفّذ لهذا النوع من المهام (${job.type}).`, 'no_handler');
      const result = await handler(ctx);
      if (signal.aborted && !cancelled) failJob(job.id, 'توقّفت المهمة لأن رَصد يُغلق الآن. أعد تشغيلها.', 'interrupted');
      else if (cancelled) markCancelled(job.id);
      else completeJob(job.id, result ?? {});
    } catch (error) {
      if (cancelled || (error instanceof JobCancelled && isCancelRequested(job.id))) markCancelled(job.id);
      else if (signal.aborted) failJob(job.id, 'توقّفت المهمة لأن رَصد يُغلق الآن. أعد تشغيلها.', 'interrupted');
      else if (error instanceof JobError) failJob(job.id, error.message, error.code);
      else if (isUserFacing(error)) failJob(job.id, error.message, error.reason);
      else {
        this.options.onUnexpectedError?.(error, job);
        failJob(job.id, UNEXPECTED_MESSAGE, 'unexpected');
      }
    } finally {
      clearInterval(watch);
    }
  }
}
