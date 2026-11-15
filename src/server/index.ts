import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
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
import {attachEventStream} from './sse';

/**
 * خادم رَصد المحلي. يستمع على 127.0.0.1 فقط — لا شيء يخرج من الجهاز.
 * في التطوير يخدّم الـ API فقط (والواجهة من Vite)، وفي --prod يخدّم dist/web أيضاً.
 */

const PORT = Number(process.env.RASD_PORT ?? 4310);
const HOST = '127.0.0.1';
const isProd = process.argv.includes('--prod');

const app = Fastify({logger: {level: isProd ? 'warn' : 'info'}});

app.setErrorHandler((error, _request, reply) => {
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

// صور الحزمة (مصغّرات الأدلة). المسار يُحلّ داخل مجلد الحزمة فقط.
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

await app.register(fastifyStatic, {
  root: isProd && existsSync(join(REPO_ROOT, 'dist', 'web')) ? join(REPO_ROOT, 'dist', 'web') : REPO_ROOT,
  serve: isProd,
});

if (isProd) {
  // تطبيق صفحة واحدة: أي مسار غير /api و /media يعيد index.html.
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/') || request.url.startsWith('/media/')) {
      return reply.status(404).send({error: 'not_found'});
    }
    return reply.sendFile('index.html');
  });
}

getDb(); // يطبّق الترحيلات قبل استقبال الطلبات
await app.listen({port: PORT, host: HOST});
if (isProd) console.log(`رَصد يعمل على http://${HOST}:${PORT}`);
