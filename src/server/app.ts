import fastifyStatic from '@fastify/static';
import Fastify, {type FastifyInstance} from 'fastify';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {
  BridgeError,
  getPackageIndex,
  getStudy,
  listFindings,
  listStudies,
} from '../core/bridge/core';
import {getDb} from '../core/db/client';
import {REPO_ROOT, dataDir, paths, resolveInside} from '../core/paths';
import {sessionJobHandlers} from '../collectors/session-jobs';
import {Worker} from '../core/jobs/worker';
import {apiErrorResponse, registerApi} from './api';
import {attachEventStream} from './sse';

/**
 * Builds Rasd's local server (routes, event stream, job worker) without starting it, so tests can drive it
 * with `app.inject`. src/server/index.ts starts it on 127.0.0.1.
 */

export interface ServerOptions {
  /** Serve the built UI from dist/web as well (single-page app fallback). */
  prod?: boolean;
  logger?: boolean;
}

export async function buildServer(options: ServerOptions = {}): Promise<{app: FastifyInstance; worker: Worker}> {
  const isProd = options.prod ?? false;
  const app = Fastify({logger: options.logger === false ? false : {level: isProd ? 'warn' : 'info'}});

  app.setErrorHandler((error, _request, reply) => {
    const mapped = apiErrorResponse(error);
    if (mapped) return reply.status(mapped.status).send(mapped.body);
    if (error instanceof BridgeError) {
      const status = error.code === 'not_found' || error.code === 'no_package' ? 404 : 400;
      return reply.status(status).send({error: error.code, message: error.message});
    }
    app.log.error(error);
    return reply.status(500).send({error: 'internal', message: 'حدث خطأ غير متوقع في الخادم.'});
  });

  const parseId = (raw: string): number => {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) throw new BridgeError(`رقم دراسة غير صالح: ${raw}`, 'invalid');
    return id;
  };

  app.get('/api/health', async () => ({ok: true, name: 'rasd', dataDir: dataDir()}));

  app.get('/api/studies', async () => {
    return listStudies().map(study => ({
      ...study,
      findingCount: listFindings(study.id).length,
    }));
  });

  app.get<{Params: {id: string}}>('/api/studies/:id', async request => {
    const id = parseId(request.params.id);
    const study = getStudy(id);
    const findings = listFindings(id);
    let evidence: Record<string, {kind: string; label: string; url: string | null; media: string[]}> = {};
    let packageStats: {items: number; images: number} | null = null;
    try {
      const index = getPackageIndex(id);
      evidence = Object.fromEntries(
        Object.entries(index.items).map(([key, item]) => [
          key,
          {
            kind: item.kind,
            label: item.label,
            url: item.url,
            media: item.media.map(m => `/media/studies/${id}/${m}`),
          },
        ]),
      );
      packageStats = {
        items: Object.keys(index.items).length,
        images: Object.values(index.items).reduce((n, item) => n + item.media.length, 0),
      };
    } catch (error) {
      if (!(error instanceof BridgeError) || error.code !== 'no_package') throw error;
    }
    return {study, findings, evidence, packageStats};
  });

  // Package images (evidence thumbnails). The path is resolved inside the package folder only.
  app.get<{Params: {id: string; '*': string}}>('/media/studies/:id/*', async (request, reply) => {
    const id = parseId(request.params.id);
    const relative = request.params['*'];
    if (!relative.startsWith('media/')) return reply.status(404).send({error: 'not_found'});
    let absolute: string;
    try {
      absolute = resolveInside(paths.studyPackage(id), relative);
    } catch {
      return reply.status(400).send({error: 'invalid'});
    }
    if (!existsSync(absolute)) return reply.status(404).send({error: 'not_found'});
    return reply.header('Cache-Control', 'private, max-age=3600').sendFile(relative, paths.studyPackage(id));
  });

  attachEventStream(app);
  registerApi(app);

  // Background jobs (logins, session checks; collection from Phase 2) run here, in the server process.
  const worker = new Worker(sessionJobHandlers(), {onUnexpectedError: (error, job) => app.log.error({err: error, jobId: job.id}, 'job failed')});
  app.addHook('onClose', async () => worker.stop());

  await app.register(fastifyStatic, {
    root: isProd && existsSync(join(REPO_ROOT, 'dist', 'web')) ? join(REPO_ROOT, 'dist', 'web') : REPO_ROOT,
    serve: isProd,
  });

  if (isProd) {
    // Single-page app: any path other than /api, /media and /assets returns index.html.
    app.setNotFoundHandler((request, reply) => {
      if (['/api/', '/media/', '/assets/'].some(prefix => request.url.startsWith(prefix))) {
        return reply.status(404).send({error: 'not_found'});
      }
      return reply.sendFile('index.html');
    });
  }

  getDb(); // applies the migrations before accepting requests
  return {app, worker};
}
