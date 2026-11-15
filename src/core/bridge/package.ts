import {existsSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import sharp from 'sharp';
import {getStudy} from './core';
import {REPO_ROOT, ensureDir, paths} from '../paths';
import {MODULES, type ModuleId} from '../recipes';
import {
  evidenceId,
  type CollectedAd,
  type CollectedPost,
  type CollectedProfile,
  type PackageIndex,
  type PackageIndexItem,
} from '../schemas';

/**
 * باني الحزمة التحليلية (§6.0.1): يحوّل البيانات المجموعة إلى مجلد واحد
 * تقرؤه جلسة Claude: brief.md + data/*.json (مقطّعة) + media/ (صور مصغّرة) + index.json.
 */

export interface PackageInput {
  studyId: number;
  profiles?: CollectedProfile[];
  posts?: CollectedPost[];
  ads?: CollectedAd[];
  isDemo?: boolean;
}

export interface PackageResult {
  dir: string;
  index: PackageIndex;
  stats: {posts: number; ads: number; profiles: number; images: number; bytes: number};
}

/** حجم الدفعة: لا ملف بيانات يتجاوز هذا العدد، حتى تعالجه الجلسة على مراحل. */
export const CHUNK_SIZE = 20;
/** أطول ضلع للصورة داخل الحزمة — كافٍ للتحليل البصري وخفيف على الجلسة. */
const MAX_IMAGE_EDGE = 1024;

/** أي بيانات تخصّ كل وحدة تحليل. */
const MODULE_SOURCES: Record<ModuleId, ('profiles' | 'posts' | 'ads')[]> = {
  account_metrics: ['profiles', 'posts'],
  posting_cadence: ['posts'],
  top_content: ['posts'],
  content_pillars: ['posts'],
  hooks_captions: ['posts'],
  visual_style: ['posts'],
  ads_inventory: ['ads'],
  ad_creative_analysis: ['ads'],
  offers_pricing: ['posts', 'ads'],
  product_matching: ['posts', 'ads'],
  comment_sentiment: ['posts'],
  competitor_discovery: ['profiles'],
  strategy_synthesis: ['profiles', 'posts', 'ads'],
  recommendations: ['profiles', 'posts', 'ads'],
};

const playbookPath = (module: ModuleId) => `.claude/skills/rasd-${module.replaceAll('_', '-')}/SKILL.md`;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const pad = (n: number) => String(n).padStart(3, '0');
const safe = (s: string) => s.replace(/[^A-Za-z0-9_.-]/g, '_');

async function optimizeImage(source: string, target: string): Promise<number> {
  const info = await sharp(source)
    .rotate()
    .resize({width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE, fit: 'inside', withoutEnlargement: true})
    .jpeg({quality: 80, mozjpeg: true})
    .toFile(target);
  return info.size;
}

export async function buildPackage(input: PackageInput): Promise<PackageResult> {
  const study = getStudy(input.studyId);
  const dir = paths.studyPackage(study.id);
  if (existsSync(dir)) rmSync(dir, {recursive: true, force: true});
  ensureDir(join(dir, 'data'));
  ensureDir(join(dir, 'media'));

  const profiles = input.profiles ?? [];
  const posts = input.posts ?? [];
  const ads = input.ads ?? [];
  const items: Record<string, PackageIndexItem> = {};
  const filesBySource: Record<'profiles' | 'posts' | 'ads', string[]> = {profiles: [], posts: [], ads: []};
  let images = 0;
  let bytes = 0;

  const write = (relative: string, value: unknown) => {
    const text = JSON.stringify(value, null, 2);
    writeFileSync(join(dir, relative), text);
    bytes += Buffer.byteLength(text);
  };

  /** ينسخ صور عنصر إلى media/ بأسماء ثابتة ويعيد مساراتها النسبية. */
  const copyMedia = async (prefix: string, media: {type: string; file?: string}[]): Promise<string[]> => {
    const out: string[] = [];
    let n = 0;
    for (const m of media) {
      if (m.type !== 'image' || !m.file || !existsSync(m.file)) continue;
      n += 1;
      const relative = `media/${prefix}_${n}.jpg`;
      try {
        bytes += await optimizeImage(m.file, join(dir, relative));
        images += 1;
        out.push(relative);
      } catch {
        // صورة تالفة: نتجاوزها ولا نُفشل الحزمة — البيانات الجزئية تبقى صالحة.
      }
    }
    return out;
  };

  if (profiles.length) {
    const relative = 'data/profiles.json';
    write(relative, profiles.map(p => ({evidence: evidenceId('profile', p.platform, p.handle), ...p})));
    filesBySource.profiles.push(relative);
    for (const p of profiles) {
      items[evidenceId('profile', p.platform, p.handle)] = {
        kind: 'profile',
        platform: p.platform,
        label: `@${p.handle}`,
        url: p.url,
        dataFile: relative,
        media: [],
      };
    }
  }

  for (const [i, group] of chunk(posts, CHUNK_SIZE).entries()) {
    const relative = `data/posts-${pad(i + 1)}.json`;
    const rows = [];
    for (const post of group) {
      const id = evidenceId('post', post.platform, post.id);
      const media = await copyMedia(`post_${post.platform}_${safe(post.id)}`, post.media);
      // الجلسة لا تحتاج مسارات الملفات الأصلية ولا روابط CDN المؤقتة.
      const {media: rawMedia, ...rest} = post;
      rows.push({evidence: id, ...rest, mediaCount: rawMedia.length, images: media});
      items[id] = {
        kind: 'post',
        platform: post.platform,
        label: (post.caption.split('\n')[0] ?? '').slice(0, 80) || `@${post.accountHandle}`,
        url: post.url,
        dataFile: relative,
        media,
      };
    }
    write(relative, rows);
    filesBySource.posts.push(relative);
  }

  for (const [i, group] of chunk(ads, CHUNK_SIZE).entries()) {
    const relative = `data/ads-${pad(i + 1)}.json`;
    const rows = [];
    for (const ad of group) {
      const id = evidenceId('ad', 'meta', ad.id);
      const media = await copyMedia(`ad_meta_${safe(ad.id)}`, ad.media);
      const {media: rawMedia, ...rest} = ad;
      rows.push({evidence: id, ...rest, mediaCount: rawMedia.length, images: media});
      items[id] = {
        kind: 'ad',
        platform: 'meta',
        label: (ad.title ?? ad.body.split('\n')[0] ?? '').slice(0, 80) || (ad.pageName ?? ad.id),
        url: ad.url,
        dataFile: relative,
        media,
      };
    }
    write(relative, rows);
    filesBySource.ads.push(relative);
  }

  const requested = (study.modules.length ? study.modules : []).filter((m): m is ModuleId =>
    MODULES.includes(m as ModuleId),
  );
  const modules: PackageIndex['modules'] = {};
  for (const module of requested) {
    const dataFiles = MODULE_SOURCES[module].flatMap(source => filesBySource[source]);
    modules[module] = {
      dataFiles,
      playbook: existsSync(join(REPO_ROOT, playbookPath(module))) ? playbookPath(module) : null,
    };
  }

  const index: PackageIndex = {
    version: 1,
    studyId: study.id,
    builtAt: new Date().toISOString(),
    isDemo: input.isDemo ?? study.isDemo,
    modules,
    items,
  };
  write('index.json', index);

  const stats = {posts: posts.length, ads: ads.length, profiles: profiles.length, images, bytes};
  writeFileSync(join(dir, 'brief.md'), renderBrief({study, index, stats}));
  return {dir, index, stats};
}

function renderBrief(args: {
  study: ReturnType<typeof getStudy>;
  index: PackageIndex;
  stats: PackageResult['stats'];
}): string {
  const {study, index, stats} = args;
  const id = study.id;
  const moduleLines = Object.entries(index.modules)
    .map(
      ([module, entry]) =>
        `| \`${module}\` | ${entry.dataFiles.length ? entry.dataFiles.map(f => `\`${f}\``).join('، ') : '— (لا بيانات)'} | ${entry.playbook ? `\`${entry.playbook}\`` : '— (لا يوجد كتيّب بعد)'} |`,
    )
    .join('\n');

  return `# ملف الدراسة رقم ${id} — ${study.title}

${index.isDemo ? '> ⚠️ **بيانات تجريبية مولَّدة** لاختبار الجسر — ليست من حساب حقيقي. اذكر ذلك في كل خلاصة.\n' : ''}
- **نوع الدراسة:** \`${study.type}\`
- **المعطيات:** \`${JSON.stringify(study.params)}\`
- **محتوى الحزمة:** ${stats.profiles} حساب، ${stats.posts} منشور، ${stats.ads} إعلان، ${stats.images} صورة.

## دورك

أنت «العقل» في رَصد: تقرأ البيانات المجموعة هنا، **تنظر إلى الصور فعلاً**، وتكتب نتائج موثّقة بالأدلة.
رَصد نفسه لا يستدعي أي نموذج — كل استنتاج يأتي منك ويُحفظ عبر الأمر \`rasd\`.

## الوحدات المطلوبة

| الوحدة | ملفات البيانات | الكتيّب (playbook) |
|---|---|---|
${moduleLines || '| — | — | — |'}

نفّذ الوحدات بالترتيب أعلاه. لكل وحدة: اقرأ كتيّبها إن وُجد، ثم بياناتها.

## القراءة

\`\`\`bash
node bin/rasd.mjs study show ${id}                       # ملخص الدراسة والنتائج المكتوبة
node bin/rasd.mjs study data ${id} --module <module>     # بيانات وحدة واحدة + ما كُتب لها سابقاً
node bin/rasd.mjs study show ${id} --evidence            # كل معرّفات الأدلة المتاحة
\`\`\`

- ملفات البيانات تحت \`data/\` مقطّعة (${CHUNK_SIZE} عنصراً كحد أقصى للملف). **عالجها ملفاً ملفاً** واكتب نتائج كل دفعة قبل الانتقال.
- كل عنصر فيه \`evidence\` (معرّفه) و \`images\` (مسارات صور نسبية داخل هذه الحزمة). افتح الصور بأداة القراءة قبل أي حكم بصري.
- مجلد الحزمة: \`${paths.studyPackage(id)}\`

## الكتابة

\`\`\`bash
node bin/rasd.mjs study status ${id} analyzing           # قبل أول نتيجة
node bin/rasd.mjs finding add ${id} --file <finding.json> # نتيجة واحدة لكل ملف (أو مصفوفة نتائج)
node bin/rasd.mjs study status ${id} done                # بعد آخر نتيجة
\`\`\`

### مخطط النتيجة (Finding)

\`\`\`json
{
  "module": "top_content",
  "key": "best-post-offer-hook",
  "title": "عنوان قصير بالعربية",
  "claim": "الخلاصة بجملة أو جملتين واضحتين، بالعربية الفصحى المبسّطة.",
  "why": "الإشارات التي بُني عليها الحكم (أرقام، مقارنات، ملاحظات بصرية).",
  "evidence": ["post:ig:XXXX"],
  "confidence": "low | medium | high",
  "data": {"اختياري": "حقول منظّمة خاصة بالوحدة"}
}
\`\`\`

## قواعد لا تُكسر

1. **لا ادّعاء بلا دليل:** كل نتيجة تستشهد بمعرّف واحد على الأقل من \`index.json\`. المعرّفات غير الموجودة تُرفض.
2. **\`key\` ثابت:** إعادة الكتابة بالمفتاح نفسه تحدّث النتيجة ولا تكرّرها. قبل البدء راجع \`existingFindings\` في مخرجات \`study data\` وتجاوز ما كُتب (استئناف).
3. **الثقة صادقة:** عيّنة صغيرة أو إشارة واحدة = \`low\`. لا ترفع الثقة لتجميل التقرير.
4. **لا تخمين خارج البيانات:** ما لا تجده في الحزمة قل إنه غير متوفر.
5. **الخصوصية:** لا تذكر أسماء المعلّقين ولا أي بيانات أفراد.
6. **اللغة:** العربية الفصحى المبسّطة، جمل قصيرة، أرقام غربية (0-9).
`;
}
