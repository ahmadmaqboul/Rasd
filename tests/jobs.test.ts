import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {closeDb, getDb, schema} from '../src/core/db/client';
import {eventsAfter, lastEventId} from '../src/core/events';
import {
  claimNextJob,
  enqueueJob,
  failInterruptedJobs,
  findActiveJob,
  getJob,
  listJobs,
  requestCancel,
} from '../src/core/jobs/queue';
import {JobError, Worker, type JobHandler} from '../src/core/jobs/worker';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rasd-jobs-'));
  process.env.RASD_DATA_DIR = dir;
  getDb();
});

afterAll(() => {
  closeDb();
  rmSync(dir, {recursive: true, force: true});
});

const clearJobs = () => getDb().delete(schema.jobs).run();

/** A handler that waits until the test releases it (or the job is cancelled). */
function gate() {
  let release!: () => void;
  const released = new Promise<void>(resolve => (release = resolve));
  const started: number[] = [];
  const handler: JobHandler = async ctx => {
    started.push(ctx.job.id);
    await Promise.race([
      released,
      new Promise((_, reject) => ctx.signal.addEventListener('abort', () => reject(new Error('aborted')), {once: true})),
    ]);
    return {ok: true};
  };
  return {handler, release, started};
}

const waitFor = async (check: () => boolean, ms = 3000) => {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error('timed out');
    await new Promise(r => setTimeout(r, 20));
  }
};

describe('queue', () => {
  it('enqueues, claims the oldest job of a known type, and skips busy lanes', () => {
    clearJobs();
    const a = enqueueJob({type: 'x', lane: 'instagram'});
    const b = enqueueJob({type: 'x', lane: 'instagram'});
    const c = enqueueJob({type: 'x', lane: 'facebook'});
    enqueueJob({type: 'unknown'});

    expect(claimNextJob(['x'], [])?.id).toBe(a.id);
    // instagram is busy now: the next claim skips b and takes c
    expect(claimNextJob(['x'], ['instagram'])?.id).toBe(c.id);
    expect(claimNextJob(['x'], ['instagram', 'facebook'])).toBeUndefined();
    expect(getJob(a.id)?.status).toBe('running');
    expect(getJob(b.id)?.status).toBe('queued');
    expect(findActiveJob('x', 'instagram')?.id).toBe(a.id);
  });

  it('cancels a queued job at once and only flags a running one', () => {
    clearJobs();
    const queued = enqueueJob({type: 'x'});
    expect(requestCancel(queued.id)?.status).toBe('cancelled');

    const running = enqueueJob({type: 'x'});
    claimNextJob(['x'], []);
    const flagged = requestCancel(running.id);
    expect(flagged?.status).toBe('running');
    expect(flagged?.cancelRequested).toBe(true);
  });

  it('marks jobs left running by a dead worker as interrupted', () => {
    clearJobs();
    const job = enqueueJob({type: 'x'});
    claimNextJob(['x'], []);
    expect(failInterruptedJobs(60_000)).toBe(0); // fresh heartbeat: left alone
    expect(failInterruptedJobs()).toBe(1);
    const after = getJob(job.id);
    expect(after?.status).toBe('failed');
    expect(after?.errorCode).toBe('interrupted');
    expect(after?.error).toMatch(/أعد تشغيلها/);
  });

  it('writes every change to the event log for the UI', () => {
    clearJobs();
    const before = lastEventId();
    const job = enqueueJob({type: 'x', studyId: null});
    claimNextJob(['x'], []);
    const events = eventsAfter(before).filter(e => e.type === 'job.updated');
    expect(events.map(e => (e.payload.job as {status: string}).status)).toEqual(['queued', 'running']);
    expect((events[0]!.payload.job as {id: number}).id).toBe(job.id);
  });
});

describe('worker', () => {
  it('runs a job to success and records its progress and result', async () => {
    clearJobs();
    const seen: unknown[] = [];
    const worker = new Worker(
      {
        count: async ctx => {
          for (let i = 1; i <= 3; i += 1) {
            ctx.progress({step: 'counting', done: i, total: 3});
            seen.push(getJob(ctx.job.id)?.progress);
          }
          return {counted: 3};
        },
      },
      {pollMs: 10, watchMs: 10},
    );
    const job = enqueueJob({type: 'count'});
    worker.start();
    await waitFor(() => getJob(job.id)?.status === 'succeeded');
    await worker.stop();
    const done = getJob(job.id)!;
    expect(done.result).toEqual({counted: 3});
    expect(done.progress).toEqual({step: 'counting', done: 3, total: 3});
    expect(seen).toHaveLength(3);
    expect(done.startedAt).toBeInstanceOf(Date);
    expect(done.finishedAt).toBeInstanceOf(Date);
  });

  it('records a JobError message as-is and hides unexpected errors behind a generic message', async () => {
    clearJobs();
    const logged: unknown[] = [];
    const worker = new Worker(
      {
        known: async () => {
          throw new JobError('رسالة واضحة للمستخدم', 'no_display');
        },
        crash: async () => {
          throw new TypeError('x is undefined');
        },
      },
      {pollMs: 10, watchMs: 10, onUnexpectedError: e => logged.push(e)},
    );
    const known = enqueueJob({type: 'known'});
    const crash = enqueueJob({type: 'crash'});
    worker.start();
    await waitFor(() => getJob(crash.id)?.status === 'failed' && getJob(known.id)?.status === 'failed');
    await worker.stop();
    expect(getJob(known.id)).toMatchObject({error: 'رسالة واضحة للمستخدم', errorCode: 'no_display'});
    expect(getJob(crash.id)).toMatchObject({errorCode: 'unexpected'});
    expect(getJob(crash.id)?.error).not.toMatch(/undefined/);
    expect(logged).toHaveLength(1);
  });

  it('passes through the Arabic message of a CollectorBlocked error', async () => {
    clearJobs();
    const blocked = Object.assign(new Error('إنستغرام طلب تسجيل الدخول.'), {name: 'CollectorBlocked', reason: 'login_required'});
    const worker = new Worker({b: async () => Promise.reject(blocked)}, {pollMs: 10, watchMs: 10});
    const job = enqueueJob({type: 'b'});
    worker.start();
    await waitFor(() => getJob(job.id)?.status === 'failed');
    await worker.stop();
    expect(getJob(job.id)).toMatchObject({error: 'إنستغرام طلب تسجيل الدخول.', errorCode: 'login_required'});
  });

  it('cancels a running job through its signal', async () => {
    clearJobs();
    const g = gate();
    const worker = new Worker({wait: g.handler}, {pollMs: 10, watchMs: 10});
    const job = enqueueJob({type: 'wait'});
    worker.start();
    await waitFor(() => g.started.includes(job.id));
    requestCancel(job.id);
    await waitFor(() => getJob(job.id)?.status === 'cancelled');
    await worker.stop();
    expect(getJob(job.id)?.finishedAt).toBeInstanceOf(Date);
  });

  it('cancels a job that is sleeping through ctx.sleep', async () => {
    clearJobs();
    const worker = new Worker(
      {
        nap: async ctx => {
          await ctx.sleep(60_000);
        },
      },
      {pollMs: 10, watchMs: 10},
    );
    const job = enqueueJob({type: 'nap'});
    worker.start();
    await waitFor(() => getJob(job.id)?.status === 'running');
    requestCancel(job.id);
    await waitFor(() => getJob(job.id)?.status === 'cancelled');
    await worker.stop();
  });

  it('never runs two jobs of the same lane at once, but runs different lanes in parallel', async () => {
    clearJobs();
    const g = gate();
    const worker = new Worker({wait: g.handler}, {pollMs: 10, watchMs: 10, maxConcurrent: 3});
    const ig1 = enqueueJob({type: 'wait', lane: 'instagram'});
    const ig2 = enqueueJob({type: 'wait', lane: 'instagram'});
    const fb = enqueueJob({type: 'wait', lane: 'facebook'});
    worker.start();
    await waitFor(() => g.started.length === 2);
    expect(g.started.sort()).toEqual([ig1.id, fb.id].sort());
    expect(getJob(ig2.id)?.status).toBe('queued');
    g.release();
    await waitFor(() => getJob(ig2.id)?.status === 'succeeded');
    await worker.stop();
    expect(listJobs({status: ['succeeded']}).map(j => j.id).sort()).toEqual([ig1.id, ig2.id, fb.id].sort());
  });

  it('marks running jobs as interrupted when the worker stops', async () => {
    clearJobs();
    const g = gate();
    const worker = new Worker({wait: g.handler}, {pollMs: 10, watchMs: 10});
    const job = enqueueJob({type: 'wait'});
    worker.start();
    await waitFor(() => g.started.includes(job.id));
    await worker.stop();
    expect(getJob(job.id)).toMatchObject({status: 'failed', errorCode: 'interrupted'});
  });
});
