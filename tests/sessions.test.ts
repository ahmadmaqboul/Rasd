import {spawn, type ChildProcess} from 'node:child_process';
import {existsSync, mkdtempSync, rmSync} from 'node:fs';
import {createServer, type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {describeLaunchError, sessionJobHandlers} from '../src/collectors/session-jobs';
import {closeDb, getDb, schema} from '../src/core/db/client';
import {enqueueJob, getJob} from '../src/core/jobs/queue';
import {Worker} from '../src/core/jobs/worker';
import {paths} from '../src/core/paths';
import {SessionError, assessCookies, disconnectSession, getSession, listSessions, updateSession} from '../src/core/sessions';

const NOW = new Date('2026-11-18T10:00:00Z');
const sec = (d: Date) => d.getTime() / 1000;
const ig = {loginCookies: ['sessionid']};
const fb = {loginCookies: ['c_user', 'xs']};

describe('assessCookies', () => {
  it('needs every login cookie, non-empty and not expired', () => {
    const future = sec(NOW) + 86_400;
    expect(assessCookies(ig, [], NOW).loggedIn).toBe(false);
    expect(assessCookies(ig, [{name: 'sessionid', value: '', expires: future}], NOW).loggedIn).toBe(false);
    expect(assessCookies(ig, [{name: 'sessionid', value: 'x', expires: sec(NOW) - 1}], NOW).loggedIn).toBe(false);
    expect(assessCookies(ig, [{name: 'csrftoken', value: 'x', expires: future}], NOW).loggedIn).toBe(false);
    expect(assessCookies(fb, [{name: 'c_user', value: '1', expires: future}], NOW).loggedIn).toBe(false);
  });

  it('reports the earliest expiry of the login cookies', () => {
    const a = sec(NOW) + 3600;
    const b = sec(NOW) + 7200;
    const result = assessCookies(fb, [
      {name: 'c_user', value: '1', expires: b},
      {name: 'xs', value: '2', expires: a},
      {name: 'other', value: '3', expires: sec(NOW) + 10},
    ], NOW);
    expect(result).toEqual({loggedIn: true, expiresAt: new Date(a * 1000)});
  });

  it('accepts browser-session cookies without an expiry', () => {
    expect(assessCookies(ig, [{name: 'sessionid', value: 'x', expires: -1}], NOW)).toEqual({loggedIn: true, expiresAt: null});
  });
});

describe('describeLaunchError', () => {
  it('explains the common launch failures in Arabic', () => {
    expect(describeLaunchError(new Error("Looks like you launched a headed browser without having a XServer running."))).toMatchObject({code: 'no_display'});
    expect(describeLaunchError(new Error('Failed to create a ProcessSingleton for your profile directory.'))).toMatchObject({code: 'profile_busy'});
    expect(describeLaunchError(new Error("Executable doesn't exist at /x/chrome"))).toMatchObject({code: 'browser_missing'});
    const other = describeLaunchError(new Error('boom\nstack'));
    expect(other.code).toBe('browser_failed');
    expect(other.message).not.toMatch(/stack/);
  });
});

// ── With a real browser, against a local fake platform (never the real sites) ───────────
const hasChromium = existsSync(chromium.executablePath());
const hasDisplay = Boolean(process.env.DISPLAY) || existsSync('/usr/bin/Xvfb');

let dir: string;
let server: Server | undefined;
let xvfb: ChildProcess | undefined;
let base = '';

/** A fake platform. /login "logs the user in" by itself after a moment, like a person typing would. */
function fakePlatform(): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const html = (body: string, headers: Record<string, string> = {}) => {
      res.writeHead(200, {'content-type': 'text/html; charset=utf-8', ...headers});
      res.end(`<!doctype html><html><body>${body}</body></html>`);
    };
    if (url.pathname === '/login') {
      return html(
        `<form><input name="u"><input type="password" name="p"></form>
         <script>setTimeout(() => { document.cookie = 'sessionid=abc; Max-Age=86400; Path=/'; location.href = '/'; }, 600);</script>`,
      );
    }
    if (url.pathname === '/login-with-check') {
      res.writeHead(302, {location: '/challenge/'});
      return res.end();
    }
    if (url.pathname === '/challenge/') {
      return html(`<p>security check</p><script>setTimeout(() => { document.cookie = 'sessionid=abc; Max-Age=86400; Path=/'; location.href = '/'; }, 800);</script>`);
    }
    if (url.pathname === '/logged-out-home') return html('<form><input type="password"></form>');
    if (url.pathname === '/checkpoint-home') {
      res.writeHead(302, {location: '/checkpoint/123'});
      return res.end();
    }
    if (url.pathname.startsWith('/checkpoint/')) return html('<p>confirm it is you</p>');
    return html('<p>feed</p>');
  });
}

const target = (login: string, home: string) => ({
  loginUrl: `${base}${login}`,
  homeUrl: `${base}${home}`,
  cookieUrl: base,
  loginCookies: ['sessionid'],
});

const waitForJob = async (id: number, ms = 30_000) => {
  const until = Date.now() + ms;
  for (;;) {
    const job = getJob(id);
    if (job && ['succeeded', 'failed', 'cancelled'].includes(job.status)) return job;
    if (Date.now() > until) throw new Error(`job ${id} still ${job?.status}`);
    await new Promise(r => setTimeout(r, 50));
  }
};

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'rasd-sessions-'));
  process.env.RASD_DATA_DIR = dir;
  getDb();
  if (hasChromium && hasDisplay) {
    if (!process.env.DISPLAY) {
      xvfb = spawn('Xvfb', [':97', '-screen', '0', '1280x900x24'], {stdio: 'ignore'});
      process.env.DISPLAY = ':97';
      await new Promise(r => setTimeout(r, 500));
    }
    server = fakePlatform();
    await new Promise<void>(r => server!.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
});

afterAll(async () => {
  closeDb();
  server?.close();
  xvfb?.kill();
  rmSync(dir, {recursive: true, force: true});
});

describe('stored session status', () => {
  it('lists every platform, missing by default', () => {
    expect(listSessions().map(s => [s.platform, s.status])).toEqual([
      ['instagram', 'missing'],
      ['facebook', 'missing'],
    ]);
  });

  it('refuses to disconnect while a job uses the platform', () => {
    const job = enqueueJob({type: 'session.check', lane: 'facebook', payload: {platform: 'facebook'}});
    expect(getSession('facebook').activeJob?.id).toBe(job.id);
    expect(() => disconnectSession('facebook')).toThrow(SessionError);
    getDb().delete(schema.jobs).run();
    updateSession('facebook', {status: 'valid', lastLoginAt: new Date()});
    expect(disconnectSession('facebook')).toMatchObject({status: 'missing', lastLoginAt: null});
  });
});

describe.skipIf(!hasChromium || !hasDisplay)('session jobs with a browser', () => {
  it('logs in through a visible window and marks the session valid', async () => {
    const worker = new Worker(sessionJobHandlers({targets: {instagram: target('/login', '/')}, pollMs: 100, settleMs: 200}), {pollMs: 20, watchMs: 50});
    worker.start();
    const job = enqueueJob({type: 'session.login', lane: 'instagram', payload: {platform: 'instagram'}});
    const done = await waitForJob(job.id);
    await worker.stop();
    expect(done.status).toBe('succeeded');
    const session = getSession('instagram');
    expect(session).toMatchObject({status: 'valid', hasProfile: true, activeJob: null});
    expect(session.lastLoginAt).not.toBeNull();
    expect(Date.parse(session.expiresAt!) - Date.now()).toBeGreaterThan(80_000_000);
    expect(existsSync(paths.sessions('instagram'))).toBe(true);
  }, 60_000);

  it('waits while the platform shows a security check, and says so', async () => {
    rmSync(paths.sessions('instagram'), {recursive: true, force: true});
    const steps: string[] = [];
    const worker = new Worker(sessionJobHandlers({targets: {instagram: target('/login-with-check', '/')}, pollMs: 100, settleMs: 100}), {pollMs: 20, watchMs: 50});
    worker.start();
    const job = enqueueJob({type: 'session.login', lane: 'instagram', payload: {platform: 'instagram'}});
    const poll = setInterval(() => {
      const step = getJob(job.id)?.progress.step;
      if (step && steps.at(-1) !== step) steps.push(step);
    }, 30);
    const done = await waitForJob(job.id);
    clearInterval(poll);
    await worker.stop();
    expect(done.status).toBe('succeeded');
    expect(steps).toContain('waiting_for_check');
  }, 60_000);

  it('checks a saved session against the platform: valid, expired or challenged', async () => {
    const run = async (home: string) => {
      const worker = new Worker(sessionJobHandlers({targets: {instagram: target('/login', home)}}), {pollMs: 20, watchMs: 50});
      worker.start();
      const job = enqueueJob({type: 'session.check', lane: 'instagram', payload: {platform: 'instagram'}});
      const done = await waitForJob(job.id);
      await worker.stop();
      return done.result?.status;
    };
    expect(await run('/')).toBe('valid');
    expect(await run('/checkpoint-home')).toBe('challenged');
    expect(getSession('instagram').status).toBe('challenged');
    expect(await run('/logged-out-home')).toBe('expired');
  }, 90_000);

  it('can check offline: the cookie is there but the platform was not asked', async () => {
    const worker = new Worker(sessionJobHandlers({targets: {instagram: target('/login', '/')}}), {pollMs: 20, watchMs: 50});
    worker.start();
    const job = enqueueJob({type: 'session.check', lane: 'instagram', payload: {platform: 'instagram', online: false}});
    const done = await waitForJob(job.id);
    await worker.stop();
    expect(done.result).toEqual({status: 'unknown'});
  }, 60_000);

  it('cancelling a login closes the window', async () => {
    rmSync(paths.sessions('facebook'), {recursive: true, force: true});
    const worker = new Worker(
      sessionJobHandlers({targets: {facebook: {...target('/logged-out-home', '/'), loginCookies: ['never']}}, pollMs: 100}),
      {pollMs: 20, watchMs: 50},
    );
    worker.start();
    const job = enqueueJob({type: 'session.login', lane: 'facebook', payload: {platform: 'facebook'}});
    const until = Date.now() + 30_000;
    while (getJob(job.id)?.progress.step !== 'waiting_for_login') {
      if (Date.now() > until) throw new Error('never reached waiting_for_login');
      await new Promise(r => setTimeout(r, 50));
    }
    const {requestCancel} = await import('../src/core/jobs/queue');
    requestCancel(job.id);
    const done = await waitForJob(job.id);
    await worker.stop();
    expect(done.status).toBe('cancelled');
    // The profile is free again: a second launch on it does not fail with "profile busy".
    const context = await chromium.launchPersistentContext(paths.sessions('facebook'), {headless: true});
    await context.close();
  }, 60_000);

  it('a missing profile folder is reported as missing without opening a browser', async () => {
    rmSync(paths.sessions('facebook'), {recursive: true, force: true});
    const worker = new Worker(sessionJobHandlers(), {pollMs: 20, watchMs: 50});
    worker.start();
    const job = enqueueJob({type: 'session.check', lane: 'facebook', payload: {platform: 'facebook'}});
    const done = await waitForJob(job.id);
    await worker.stop();
    expect(done.result).toEqual({status: 'missing'});
  });
});
