import {and, asc, desc, eq, inArray, isNull, lt, notInArray, or} from 'drizzle-orm';
import {getDb, schema} from '../db/client';
import type {JobProgress, JobRow, JobStatus} from '../db/schema';
import {emitEvent} from '../events';

/**
 * The job queue: a table in SQLite, worked by the server's worker (worker.ts). Any process may enqueue
 * (the server, later the CLI and the scheduler); every change is written to the event log so the UI follows
 * progress live over SSE.
 */

const {jobs} = schema;

export const ACTIVE_STATUSES: JobStatus[] = ['queued', 'running'];
export const FINAL_STATUSES: JobStatus[] = ['succeeded', 'failed', 'cancelled'];

export interface EnqueueInput {
  type: string;
  payload?: Record<string, unknown>;
  /** Jobs that share a lane never run at the same time. Browser jobs use the platform as their lane. */
  lane?: string;
  studyId?: number | null;
}

/** What the UI receives for a job (in the API and in `job.updated` events). */
export type JobView = Pick<
  JobRow,
  'id' | 'type' | 'status' | 'payload' | 'progress' | 'result' | 'error' | 'errorCode' | 'studyId' | 'lane' | 'cancelRequested'
> & {createdAt: string; startedAt: string | null; finishedAt: string | null};

export function toJobView(job: JobRow): JobView {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    payload: job.payload,
    progress: job.progress,
    result: job.result,
    error: job.error,
    errorCode: job.errorCode,
    studyId: job.studyId,
    lane: job.lane,
    cancelRequested: job.cancelRequested,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}

function publish(job: JobRow): JobRow {
  emitEvent(job.studyId, 'job.updated', {job: toJobView(job)});
  return job;
}

export function enqueueJob(input: EnqueueInput): JobRow {
  const job = getDb()
    .insert(jobs)
    .values({
      type: input.type,
      payload: input.payload ?? {},
      lane: input.lane ?? 'default',
      studyId: input.studyId ?? null,
      createdAt: new Date(),
    })
    .returning()
    .get();
  return publish(job);
}

export function getJob(id: number): JobRow | undefined {
  return getDb().select().from(jobs).where(eq(jobs.id, id)).get();
}

export interface ListJobsOptions {
  status?: JobStatus[];
  type?: string;
  lane?: string;
  limit?: number;
}

export function listJobs(options: ListJobsOptions = {}): JobRow[] {
  const conditions = [
    options.status?.length ? inArray(jobs.status, options.status) : undefined,
    options.type ? eq(jobs.type, options.type) : undefined,
    options.lane ? eq(jobs.lane, options.lane) : undefined,
  ].filter(c => c !== undefined);
  return getDb()
    .select()
    .from(jobs)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(jobs.id))
    .limit(options.limit ?? 50)
    .all();
}

/** The queued or running job of a given type and lane, if any — used to avoid starting the same job twice. */
export function findActiveJob(type: string, lane: string): JobRow | undefined {
  return getDb()
    .select()
    .from(jobs)
    .where(and(eq(jobs.type, type), eq(jobs.lane, lane), inArray(jobs.status, ACTIVE_STATUSES)))
    .orderBy(asc(jobs.id))
    .get();
}

/**
 * Takes the oldest queued job whose type has a handler and whose lane is free, and marks it running.
 * Runs in one transaction so two workers can never take the same job.
 */
export function claimNextJob(types: string[], busyLanes: string[]): JobRow | undefined {
  if (types.length === 0) return undefined;
  const db = getDb();
  const claimed = db.transaction(tx => {
    const next = tx
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.status, 'queued'),
          inArray(jobs.type, types),
          busyLanes.length ? notInArray(jobs.lane, busyLanes) : undefined,
        ),
      )
      .orderBy(asc(jobs.id))
      .get();
    if (!next) return undefined;
    const now = new Date();
    return tx
      .update(jobs)
      .set({status: 'running', startedAt: now, heartbeatAt: now})
      .where(and(eq(jobs.id, next.id), eq(jobs.status, 'queued')))
      .returning()
      .get();
  });
  return claimed ? publish(claimed) : undefined;
}

export function reportProgress(id: number, progress: JobProgress): JobRow | undefined {
  const job = getDb()
    .update(jobs)
    .set({progress, heartbeatAt: new Date()})
    .where(and(eq(jobs.id, id), eq(jobs.status, 'running')))
    .returning()
    .get();
  return job ? publish(job) : undefined;
}

export function heartbeat(id: number): void {
  getDb().update(jobs).set({heartbeatAt: new Date()}).where(and(eq(jobs.id, id), eq(jobs.status, 'running'))).run();
}

function finish(id: number, status: JobStatus, values: Partial<Pick<JobRow, 'result' | 'error' | 'errorCode'>>): JobRow | undefined {
  const job = getDb()
    .update(jobs)
    .set({...values, status, finishedAt: new Date(), heartbeatAt: null})
    .where(and(eq(jobs.id, id), inArray(jobs.status, ACTIVE_STATUSES)))
    .returning()
    .get();
  return job ? publish(job) : undefined;
}

export function completeJob(id: number, result: Record<string, unknown> = {}): JobRow | undefined {
  return finish(id, 'succeeded', {result});
}

/** `message` is Arabic and is shown to the user as-is. */
export function failJob(id: number, message: string, code = 'error'): JobRow | undefined {
  return finish(id, 'failed', {error: message, errorCode: code});
}

export function markCancelled(id: number): JobRow | undefined {
  return finish(id, 'cancelled', {});
}

/**
 * Cancels a job: a queued job is cancelled at once; a running job is asked to stop and ends as cancelled
 * when its handler notices (the worker aborts its signal within a second).
 */
export function requestCancel(id: number): JobRow | undefined {
  const job = getJob(id);
  if (!job) return undefined;
  if (job.status === 'queued') return markCancelled(id);
  if (job.status !== 'running' || job.cancelRequested) return job;
  const updated = getDb().update(jobs).set({cancelRequested: true}).where(eq(jobs.id, id)).returning().get();
  return updated ? publish(updated) : undefined;
}

export function isCancelRequested(id: number): boolean {
  return getDb().select({c: jobs.cancelRequested}).from(jobs).where(eq(jobs.id, id)).get()?.c ?? false;
}

export const INTERRUPTED_MESSAGE = 'توقّفت المهمة لأن رَصد أُغلق أثناء تنفيذها. أعد تشغيلها.';

/**
 * Running jobs left behind by a worker that stopped (the app was closed mid-job) are marked failed, so the UI
 * never shows a job "running" forever. With `olderThanMs` only jobs whose heartbeat is that old are touched.
 */
export function failInterruptedJobs(olderThanMs?: number): number {
  const condition =
    olderThanMs === undefined
      ? eq(jobs.status, 'running')
      : and(
          eq(jobs.status, 'running'),
          or(lt(jobs.heartbeatAt, new Date(Date.now() - olderThanMs)), isNull(jobs.heartbeatAt)),
        );
  const stale = getDb().select({id: jobs.id}).from(jobs).where(condition).all();
  for (const {id} of stale) failJob(id, INTERRUPTED_MESSAGE, 'interrupted');
  return stale.length;
}
