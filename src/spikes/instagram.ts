import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createStudy, setStudyStatus} from '../core/bridge/core';
import {buildPackage} from '../core/bridge/package';
import {closeDb} from '../core/db/client';
import {ensureDir, paths} from '../core/paths';
import {CollectorBlocked, openSession} from '../collectors/browser';
import {normalizeHandle, readInstagramProfile} from '../collectors/instagram';
import {downloadImages} from '../collectors/media';
import {parseArgs, print} from './args';

/**
 * سبايك إنستغرام (Phase 0): جلسة Playwright دائمة ← حساب عام واحد + 12 منشوراً.
 *
 *   npm run spike:instagram -- --login              # مرة واحدة: نافذة ظاهرة لتسجيل الدخول يدوياً
 *   npm run spike:instagram -- <حساب أو رابط>        # قراءة الحساب (خفية)
 *   npm run spike:instagram -- <حساب> --headed       # نفس الشيء بنافذة ظاهرة
 *   npm run spike:instagram -- <حساب> --study        # + إنشاء دراسة وحزمة جاهزة لـ /rasd-analyze
 *
 * استعمل حساباً مخصصاً للجمع، لا حساب البزنس الرئيسي.
 */

const {flags, positional} = parseArgs();

if (flags.login) {
  const context = await openSession('instagram', {headed: true});
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto('https://www.instagram.com/accounts/login/');
  process.stderr.write(
    '\nسجّل الدخول يدوياً في النافذة المفتوحة (بالحساب المخصص للجمع، لا حساب البزنس).\n' +
      'بعد ظهور الصفحة الرئيسية أغلق النافذة — الجلسة تُحفظ محلياً في data/sessions/instagram.\n\n',
  );
  await new Promise<void>(resolve => context.on('close', () => resolve()));
  print({ok: true, session: paths.sessions('instagram')});
  process.exit(0);
}

const input = positional[0];
if (!input) {
  process.stderr.write('الاستعمال: npm run spike:instagram -- <حساب أو رابط> [--headed] [--max 12] [--study]\n');
  process.exit(2);
}

const handle = normalizeHandle(input);
const outDir = ensureDir(join(paths.spikes(), 'instagram', handle));
const context = await openSession('instagram', {headed: Boolean(flags.headed)});
const started = Date.now();

try {
  const page = context.pages()[0] ?? (await context.newPage());
  const result = await readInstagramProfile(page, handle, {maxPosts: Number(flags.max ?? 12)});

  // الردود الخام تُحفظ لتصير fixtures لاختبارات المحلِّل عند أي تغيّر في الموقع.
  result.rawPayloads.forEach((payload, i) => writeFileSync(join(outDir, `raw-${i + 1}.json`), JSON.stringify(payload, null, 2)));

  let failedImages = 0;
  for (const post of result.posts) {
    const downloaded = await downloadImages(context, post.media, join(outDir, 'media'), `post_${post.id}`);
    post.media = downloaded.media;
    failedImages += downloaded.failed;
  }

  writeFileSync(join(outDir, 'result.json'), JSON.stringify({profile: result.profile, posts: result.posts}, null, 2));

  let study: {id: number; next: string} | undefined;
  if (flags.study && result.posts.length) {
    const created = createStudy({
      type: 'content',
      title: `محتوى @${handle}`,
      params: {account: `@${handle}`, source: 'spike'},
      modules: ['top_content', 'visual_style'],
      status: 'collecting',
    });
    await buildPackage({studyId: created.id, profiles: result.profile ? [result.profile] : [], posts: result.posts});
    setStudyStatus(created.id, 'ready');
    study = {id: created.id, next: `/rasd-analyze ${created.id}`};
  }

  print({
    ok: Boolean(result.profile || result.posts.length),
    handle,
    source: result.source,
    profile: result.profile,
    posts: result.posts.map(p => ({
      id: p.id,
      kind: p.kind,
      publishedAt: p.publishedAt,
      likes: p.likes,
      comments: p.comments,
      views: p.views,
      caption: p.caption.slice(0, 80),
      images: p.media.filter(m => m.file).length,
    })),
    counts: {posts: result.posts.length, rawPayloads: result.rawPayloads.length, failedImages},
    warnings: result.warnings,
    seconds: Math.round((Date.now() - started) / 1000),
    savedTo: outDir,
    study,
  });
} catch (error) {
  if (error instanceof CollectorBlocked) {
    print({ok: false, blocked: error.reason, message: error.message, url: error.url});
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  await context.close();
  closeDb();
}
