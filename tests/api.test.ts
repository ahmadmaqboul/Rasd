import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {FastifyInstance} from 'fastify';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {closeDb} from '../src/core/db/client';
import {buildServer} from '../src/server/app';

let dir: string;
let app: FastifyInstance;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'rasd-api-'));
  process.env.RASD_DATA_DIR = dir;
  // The worker is not started: jobs stay queued, which is what these tests look at.
  ({app} = await buildServer({logger: false}));
});

afterAll(async () => {
  await app.close();
  closeDb();
  rmSync(dir, {recursive: true, force: true});
});

const json = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({method, url, payload: payload as never});

describe('business profiles API', () => {
  it('creates, reads, updates and deletes a profile', async () => {
    const created = await json('POST', '/api/profiles', {name: 'سعد للاتصالات', accounts: ['@saedtel'], products: [{name: 'شاحن 65 واط', ourPrice: 89}]});
    expect(created.statusCode).toBe(201);
    const profile = created.json();
    expect(profile.accounts[0]).toMatchObject({platform: 'instagram', handle: 'saedtel'});

    expect((await json('GET', '/api/profiles')).json()).toHaveLength(1);
    expect((await json('GET', `/api/profiles/${profile.id}`)).json().name).toBe('سعد للاتصالات');

    const updated = await json('PUT', `/api/profiles/${profile.id}`, {
      name: profile.name,
      products: profile.products.map((p: {id: number; name: string; ourPrice: number}) => ({id: p.id, name: p.name, ourPrice: p.ourPrice})),
      accounts: [],
      competitors: ['@rival'],
      region: 'نابلس',
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({region: 'نابلس', accounts: [], competitors: [{handle: 'rival'}]});

    expect((await json('DELETE', `/api/profiles/${profile.id}`)).statusCode).toBe(204);
    expect((await json('GET', `/api/profiles/${profile.id}`)).statusCode).toBe(404);
  });

  it('returns field issues on a bad profile', async () => {
    const response = await json('POST', '/api/profiles', {name: '', accounts: ['not a link at all']});
    expect(response.statusCode).toBe(400);
    expect(response.json().issues[0]).toMatchObject({path: ['name'], message: 'اكتب اسم البزنس'});
  });

  it('rejects fields it does not know (the profile view is not an input)', async () => {
    const response = await json('POST', '/api/profiles', {name: 'متجر', studyCount: 3});
    expect(response.statusCode).toBe(400);
  });

  it('rejects a bad id', async () => {
    expect((await json('GET', '/api/profiles/abc')).statusCode).toBe(400);
  });
});

describe('sessions and jobs API', () => {
  it('starts one login per platform and hands back the same job if asked twice', async () => {
    const first = (await json('POST', '/api/sessions/instagram/login')).json();
    expect(first).toMatchObject({reused: false, job: {type: 'session.login', status: 'queued', lane: 'instagram'}});
    const second = (await json('POST', '/api/sessions/instagram/check')).json();
    expect(second).toMatchObject({reused: true, job: {id: first.job.id}});

    const sessions = (await json('GET', '/api/sessions')).json();
    expect(sessions.find((s: {platform: string}) => s.platform === 'instagram').activeJob.id).toBe(first.job.id);

    const cancelled = (await json('POST', `/api/jobs/${first.job.id}/cancel`)).json();
    expect(cancelled.status).toBe('cancelled');
    expect((await json('GET', '/api/jobs?status=cancelled')).json().map((j: {id: number}) => j.id)).toEqual([first.job.id]);
  });

  it('refuses unknown platforms and a disconnect while a job is queued', async () => {
    expect((await json('POST', '/api/sessions/myspace/login')).statusCode).toBe(404);
    await json('POST', '/api/sessions/facebook/check');
    const response = await json('DELETE', '/api/sessions/facebook');
    expect(response.statusCode).toBe(409);
    expect(response.json().message).toMatch(/مهمة شغّالة/);
  });

  it('saves a nickname for the collection account', async () => {
    const response = await json('PATCH', '/api/sessions/instagram', {label: '  حساب الجمع  '});
    expect(response.json().label).toBe('حساب الجمع');
    expect((await json('PATCH', '/api/sessions/instagram', {label: 5})).statusCode).toBe(400);
  });
});

describe('settings API', () => {
  it('saves a valid change and explains an invalid one', async () => {
    const saved = await json('PUT', '/api/settings/collection', {maxItemsPerRun: 40});
    expect(saved.json().collection.maxItemsPerRun).toBe(40);
    const bad = await json('PUT', '/api/settings/collection', {minDelayMs: 10});
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({message: 'أقل قيمة مسموحة 800', issues: [{path: ['minDelayMs']}]});
    expect((await json('PUT', '/api/settings/nope', {})).statusCode).toBe(404);
    const reset = await json('POST', '/api/settings/collection/reset');
    expect(reset.json().collection.maxItemsPerRun).toBe(60);
  });

  it('reports the bridge status', async () => {
    const bridge = (await json('GET', '/api/bridge')).json();
    expect(bridge).toMatchObject({mcp: {available: false}, analyzeCommand: true});
    expect(bridge.playbooks).toBeGreaterThanOrEqual(2);
  });
});
