import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {chromium} from 'playwright';
import {ensureDir} from '../core/paths';
import type {CollectedPost, CollectedProfile} from '../core/schemas';

/**
 * بيانات تجريبية مولَّدة لسبايك الجسر: حساب وهمي لمتجر إكسسوارات + 5 منشورات بصور.
 * الصور تُرسم محلياً (HTML ← لقطة) وعليها علامة «تجريبي» — لا شيء هنا من منصة حقيقية.
 * الغرض الوحيد: إثبات دورة (حزمة ← تحليل في جلسة Claude ← نتائج ← واجهة) بلا شبكة.
 */

const require = createRequire(import.meta.url);
const FONT_DIR = join(dirname(require.resolve('@fontsource/ibm-plex-sans-arabic/package.json')), 'files');

const fontFace = (subset: string, weight: number) => {
  const data = readFileSync(join(FONT_DIR, `ibm-plex-sans-arabic-${subset}-${weight}-normal.woff2`)).toString('base64');
  return `@font-face{font-family:"IBM Plex Sans Arabic";font-weight:${weight};src:url(data:font/woff2;base64,${data}) format("woff2");}`;
};

const BASE_CSS = `
${['arabic', 'latin'].flatMap(s => [400, 700].map(w => fontFace(s, w))).join('\n')}
*{box-sizing:border-box;margin:0}
html,body{width:1080px;height:1350px}
body{font-family:"IBM Plex Sans Arabic",sans-serif;direction:rtl;position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:48px;padding:80px}
.demo{position:absolute;top:28px;left:28px;font-size:26px;padding:6px 16px;border-radius:999px;background:rgba(0,0,0,.55);color:#fff;letter-spacing:.5px}
.handle{position:absolute;bottom:36px;right:40px;font-size:28px;opacity:.7;direction:ltr}
h1{font-size:104px;font-weight:700;line-height:1.15;text-align:center}
h2{font-size:56px;font-weight:400;text-align:center}
.price{font-size:150px;font-weight:700;direction:rtl}
.old{font-size:64px;text-decoration:line-through;opacity:.6}
.pill{font-size:44px;font-weight:700;padding:14px 40px;border-radius:999px}
`;

interface DemoPost {
  id: string;
  kind: CollectedPost['kind'];
  caption: string;
  daysAgo: number;
  likes: number;
  comments: number;
  views: number | null;
  /** HTML داخل <body> + CSS خاص بالمنشور. */
  css: string;
  body: string;
}

const HANDLE = 'demo_accessories';

const POSTS: DemoPost[] = [
  {
    id: 'demo1',
    kind: 'photo',
    daysAgo: 3,
    likes: 412,
    comments: 57,
    views: null,
    caption:
      'لسّا بتشحن جوالك بساعتين؟ ⚡\nشاحن 65 واط أصلي — من 0 لـ 50% بـ 20 دقيقة.\nالسعر هالأسبوع بس: 89 شيكل بدل 120.\nالتوصيل لكل المحافظات 🚚 اطلب عالخاص.',
    css: `body{background:#0b0b0b;color:#fff}
      .charger{width:300px;height:340px;border-radius:44px;background:linear-gradient(145deg,#fafafa,#bdbdbd);position:relative}
      .charger:before{content:"65W";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:84px;font-weight:700;color:#111;direction:ltr}
      .pill{background:#ffd400;color:#111}.price{color:#ffd400}`,
    body: `<h1>من 0 لـ 50%<br>بـ 20 دقيقة</h1><div class="charger"></div>
      <div style="display:flex;align-items:baseline;gap:36px"><span class="price">89 ₪</span><span class="old">120 ₪</span></div>
      <span class="pill">العرض لنهاية الأسبوع</span>`,
  },
  {
    id: 'demo2',
    kind: 'carousel',
    daysAgo: 6,
    likes: 138,
    comments: 9,
    views: null,
    caption: 'كفرات آيفون 15 وصلت 🎨\n6 ألوان، حماية كاملة للكاميرا.\nالسعر 35 شيكل.',
    css: `body{background:#f3e9dc;color:#3a2f25}
      .cases{display:flex;gap:26px}
      .case{width:150px;height:300px;border-radius:34px;position:relative}
      .case:after{content:"";position:absolute;top:18px;right:18px;width:54px;height:54px;border-radius:16px;background:rgba(0,0,0,.28)}`,
    body: `<h2>كفرات آيفون 15</h2><div class="cases">
      ${['#e07a5f', '#81b29a', '#f2cc8f', '#3d405b', '#b8a1d9'].map(c => `<div class="case" style="background:${c}"></div>`).join('')}
      </div><h2>6 ألوان — 35 ₪</h2>`,
  },
  {
    id: 'demo3',
    kind: 'photo',
    daysAgo: 9,
    likes: 96,
    comments: 4,
    views: null,
    caption: 'سماعات بلوتوث وصلت حديثاً.\nمتوفر أسود وأبيض.',
    css: `body{background:#ffffff;color:#111}
      .buds{display:flex;gap:70px}
      .bud{width:150px;height:150px;border-radius:50%;background:#141414;position:relative}
      .bud:after{content:"";position:absolute;top:130px;left:55px;width:40px;height:170px;border-radius:20px;background:#141414}`,
    body: `<div class="buds"><div class="bud"></div><div class="bud"></div></div>`,
  },
  {
    id: 'demo4',
    kind: 'reel',
    daysAgo: 12,
    likes: 530,
    comments: 88,
    views: 14200,
    caption:
      '🔥 عرض الجمعة 🔥\nاشترِ 2 واحصل على الثالث مجاناً على كل الإكسسوارات.\nالكمية محدودة — العرض لـ 48 ساعة فقط.\nاكتب «بدي» بالتعليقات وبنبعتلك التفاصيل.',
    css: `body{background:#c1121f;color:#fff}
      .big{font-size:300px;font-weight:700;line-height:1;direction:ltr}
      .pill{background:#fff;color:#c1121f}`,
    body: `<h2>عرض الجمعة</h2><div class="big">2+1</div><h1>الثالث مجاناً</h1><span class="pill">48 ساعة فقط</span>`,
  },
  {
    id: 'demo5',
    kind: 'photo',
    daysAgo: 16,
    likes: 74,
    comments: 3,
    views: null,
    caption: 'باور بانك 20000 mAh',
    css: `body{background:#e9ecef;color:#222}
      .bank{width:330px;height:560px;border-radius:40px;background:linear-gradient(160deg,#2b2d42,#11121c);position:relative}
      .bank:after{content:"20000 mAh";position:absolute;bottom:44px;left:0;right:0;text-align:center;color:#8d99ae;font-size:38px;direction:ltr}`,
    body: `<div class="bank"></div>`,
  },
];

export interface DemoDataset {
  profile: CollectedProfile;
  posts: CollectedPost[];
}

export async function generateDemoDataset(outDir: string, now = new Date()): Promise<DemoDataset> {
  ensureDir(outDir);
  const browser = await chromium.launch();
  const posts: CollectedPost[] = [];
  try {
    const page = await browser.newPage({viewport: {width: 1080, height: 1350}});
    for (const post of POSTS) {
      await page.setContent(
        `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${BASE_CSS}${post.css}</style></head>` +
          `<body><span class="demo">تجريبي · DEMO</span>${post.body}<span class="handle">@${HANDLE}</span></body></html>`,
        {waitUntil: 'load'},
      );
      await page.evaluate(() => document.fonts.ready);
      const file = join(outDir, `${post.id}.png`);
      await page.screenshot({path: file});
      posts.push({
        id: post.id,
        platform: 'demo',
        url: `https://example.invalid/demo/${post.id}`,
        accountHandle: HANDLE,
        kind: post.kind,
        caption: post.caption,
        publishedAt: new Date(now.getTime() - post.daysAgo * 86_400_000).toISOString(),
        likes: post.likes,
        comments: post.comments,
        views: post.views,
        media: [{type: 'image', file, width: 1080, height: 1350}],
      });
    }
  } finally {
    await browser.close();
  }

  const profile: CollectedProfile = {
    platform: 'demo',
    handle: HANDLE,
    url: `https://example.invalid/demo/${HANDLE}`,
    name: 'متجر إكسسوارات (تجريبي)',
    bio: 'إكسسوارات جوال أصلية 📱 توصيل لكل المحافظات 🚚 الطلب عالخاص',
    followers: 8400,
    following: 210,
    postCount: 318,
    isPrivate: false,
    isVerified: false,
    externalUrl: null,
    category: 'متجر إلكترونيات',
    collectedAt: now.toISOString(),
  };
  return {profile, posts};
}
