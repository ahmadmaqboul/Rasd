import type {FastifyInstance, FastifyReply} from 'fastify';
import {BusinessError, createProfile, deleteProfile, getProfile, listProfiles, updateProfile} from '../core/business';
import {JOB_STATUSES, type JobStatus} from '../core/db/schema';
import {enqueueJob, findActiveJob, getJob, listJobs, requestCancel, toJobView} from '../core/jobs/queue';
import {SessionError, disconnectSession, getSession, isSessionPlatform, listSessions, updateSession} from '../core/sessions';
import {SECTIONS, SettingsError, getBridgeStatus, getSettings, resetSettings, updateSettings, type SettingsSection} from '../core/settings';

/**
 * Phase 1 API: jobs, platform sessions, settings, bridge status and business profiles.
 * Every error message is Arabic and is shown to the user as-is.
 */

const parseId = (raw: string, reply: FastifyReply): number | undefined => {
  const id = Number(raw);
  if (Number.isInteger(id) && id > 0) return id;
  void reply.status(400).send({error: 'invalid', message: 'رقم غير صالح.'});
  return undefined;
};

/** Maps the Phase 1 errors to HTTP responses; undefined for anything else. */
export function apiErrorResponse(error: unknown): {status: number; body: Record<string, unknown>} | undefined {
  if (error instanceof BusinessError) {
    return {status: error.code === 'not_found' ? 404 : 400, body: {error: error.code, message: error.message, issues: error.issues}};
  }
  if (error instanceof SessionError) return {status: error.code === 'busy' ? 409 : 400, body: {error: error.code, message: error.message}};
  if (error instanceof SettingsError) return {status: 400, body: {error: 'invalid', message: error.message, issues: error.issues}};
  return undefined;
}

export function registerApi(app: FastifyInstance): void {
  // ── Jobs ───────────────────────────────────────────────────────────────────
  app.get<{Querystring: {status?: string; lane?: string; limit?: string}}>('/api/jobs', async request => {
    const status = request.query.status
      ?.split(',')
      .filter((s): s is JobStatus => (JOB_STATUSES as readonly string[]).includes(s));
    const limit = Math.min(Number(request.query.limit) || 30, 200);
    return listJobs({status, lane: request.query.lane, limit}).map(toJobView);
  });

  app.get<{Params: {id: string}}>('/api/jobs/:id', async (request, reply) => {
    const id = parseId(request.params.id, reply);
    if (id === undefined) return reply;
    const job = getJob(id);
    return job ? toJobView(job) : reply.status(404).send({error: 'not_found', message: 'ما لقيت هالمهمة.'});
  });

  app.post<{Params: {id: string}}>('/api/jobs/:id/cancel', async (request, reply) => {
    const id = parseId(request.params.id, reply);
    if (id === undefined) return reply;
    const job = requestCancel(id);
    return job ? toJobView(job) : reply.status(404).send({error: 'not_found', message: 'ما لقيت هالمهمة.'});
  });

  // ── Platform sessions ──────────────────────────────────────────────────────
  app.get('/api/sessions', async () => listSessions());

  const startSessionJob = (type: 'session.login' | 'session.check', platform: string, payload: Record<string, unknown>, reply: FastifyReply) => {
    if (!isSessionPlatform(platform)) return reply.status(404).send({error: 'not_found', message: 'منصة غير معروفة.'});
    // Never two session jobs on one platform: if one is waiting or running, hand it back instead.
    const existing = findActiveJob('session.login', platform) ?? findActiveJob('session.check', platform);
    if (existing) return {job: toJobView(existing), reused: true};
    const job = enqueueJob({type, lane: platform, payload: {platform, ...payload}});
    return {job: toJobView(job), reused: false};
  };

  app.post<{Params: {platform: string}}>('/api/sessions/:platform/login', async (request, reply) =>
    startSessionJob('session.login', request.params.platform, {}, reply),
  );

  app.post<{Params: {platform: string}; Body: {online?: boolean} | undefined}>('/api/sessions/:platform/check', async (request, reply) =>
    startSessionJob('session.check', request.params.platform, {online: request.body?.online !== false}, reply),
  );

  app.patch<{Params: {platform: string}; Body: {label?: unknown}}>('/api/sessions/:platform', async (request, reply) => {
    const {platform} = request.params;
    if (!isSessionPlatform(platform)) return reply.status(404).send({error: 'not_found', message: 'منصة غير معروفة.'});
    const label = request.body?.label;
    if (label !== null && (typeof label !== 'string' || label.trim().length > 60)) {
      return reply.status(400).send({error: 'invalid', message: 'الاسم لازم يكون نص قصير (60 حرف أو أقل).'});
    }
    return updateSession(platform, {label: label ? label.trim() : null});
  });

  app.delete<{Params: {platform: string}}>('/api/sessions/:platform', async (request, reply) => {
    const {platform} = request.params;
    if (!isSessionPlatform(platform)) return reply.status(404).send({error: 'not_found', message: 'منصة غير معروفة.'});
    return disconnectSession(platform);
  });

  app.get<{Params: {platform: string}}>('/api/sessions/:platform', async (request, reply) => {
    const {platform} = request.params;
    if (!isSessionPlatform(platform)) return reply.status(404).send({error: 'not_found', message: 'منصة غير معروفة.'});
    return getSession(platform);
  });

  // ── Settings and bridge ────────────────────────────────────────────────────
  app.get('/api/settings', async () => getSettings());

  const isSection = (value: string): value is SettingsSection => value in SECTIONS;

  app.put<{Params: {section: string}; Body: Record<string, unknown>}>('/api/settings/:section', async (request, reply) => {
    const {section} = request.params;
    if (!isSection(section)) return reply.status(404).send({error: 'not_found', message: 'قسم إعدادات غير معروف.'});
    return updateSettings(section, request.body ?? {});
  });

  app.post<{Params: {section: string}}>('/api/settings/:section/reset', async (request, reply) => {
    const {section} = request.params;
    if (!isSection(section)) return reply.status(404).send({error: 'not_found', message: 'قسم إعدادات غير معروف.'});
    return resetSettings(section);
  });

  app.get('/api/bridge', async () => getBridgeStatus());

  // ── Business profiles ──────────────────────────────────────────────────────
  app.get('/api/profiles', async () => listProfiles());

  app.post<{Body: unknown}>('/api/profiles', async (request, reply) => reply.status(201).send(createProfile(request.body)));

  app.get<{Params: {id: string}}>('/api/profiles/:id', async (request, reply) => {
    const id = parseId(request.params.id, reply);
    return id === undefined ? reply : getProfile(id);
  });

  app.put<{Params: {id: string}; Body: unknown}>('/api/profiles/:id', async (request, reply) => {
    const id = parseId(request.params.id, reply);
    return id === undefined ? reply : updateProfile(id, request.body);
  });

  app.delete<{Params: {id: string}}>('/api/profiles/:id', async (request, reply) => {
    const id = parseId(request.params.id, reply);
    if (id === undefined) return reply;
    deleteProfile(id);
    return reply.status(204).send();
  });
}

