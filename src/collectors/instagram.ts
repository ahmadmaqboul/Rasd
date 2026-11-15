import type {Page, Response} from 'playwright';
import type {CollectedMedia, CollectedPost, CollectedProfile} from '../core/schemas';
import {
  CollectorBlocked,
  DEFAULT_PACING,
  assertNotBlocked,
  describeNavigationError,
  humanPause,
  humanScroll,
  type Pacing,
} from './browser';

/**
 * جامع إنستغرام (سبايك Phase 0): حساب عام واحد + أول 12 منشوراً.
 *
 * الطريقة: نفتح صفحة الحساب في جلسة مسجّلة الدخول كأي مستخدم، ونقرأ ردود JSON التي
 * يطلبها الموقع نفسه لعرض الصفحة (أثبت من محدِّدات DOM التي تتغير كثيراً)، مع DOM كخطة بديلة.
 * لا طلبات إضافية ولا واجهات خاصة — فقط ما تحمّله الصفحة لأي متصفّح.
 *
 * ⚠️ أشكال الردود غير موثّقة رسمياً وتتغير. المحلِّلات هنا متسامحة وتدعم الشكلين المعروفين
 * (القديم edge_* والجديد like_count/…)، وكل رد خام يُحفظ ليصير fixture للاختبارات.
 */

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const str = (value: unknown): string | null => (typeof value === 'string' && value.length ? value : null);
const bool = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);
/** قراءة آمنة لمسار داخل JSON؛ تدعم فهارس المصفوفات ('0'). */
const get = (value: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((acc, key) => (isObject(acc) || Array.isArray(acc) ? (acc as Json)[key] : undefined), value);
const isoFromSeconds = (value: unknown): string | null => {
  const seconds = num(value);
  return seconds ? new Date(seconds * 1000).toISOString() : null;
};

/** يمشي على كل الكائنات داخل JSON مهما كان عمقها. */
function* walk(value: unknown, depth = 0): Generator<Json> {
  if (depth > 12) return;
  if (Array.isArray(value)) {
    for (const item of value) yield* walk(item, depth + 1);
  } else if (isObject(value)) {
    yield value;
    for (const item of Object.values(value)) yield* walk(item, depth + 1);
  }
}

// ── الحساب ───────────────────────────────────────────────────────────────────
/** كائن «مستخدم» بأحد الشكلين المعروفين. */
function looksLikeUser(node: Json): boolean {
  return (
    typeof node.username === 'string' &&
    ('edge_followed_by' in node || 'follower_count' in node || 'biography' in node)
  );
}

export function parseProfile(payload: unknown, handle: string, collectedAt = new Date()): CollectedProfile | null {
  const wanted = handle.toLowerCase();
  for (const node of walk(payload)) {
    if (!looksLikeUser(node) || String(node.username).toLowerCase() !== wanted) continue;
    return {
      platform: 'ig',
      handle: String(node.username),
      url: `https://www.instagram.com/${String(node.username)}/`,
      name: str(node.full_name),
      bio: str(node.biography),
      followers: num(get(node, 'edge_followed_by', 'count')) ?? num(node.follower_count),
      following: num(get(node, 'edge_follow', 'count')) ?? num(node.following_count),
      postCount: num(get(node, 'edge_owner_to_timeline_media', 'count')) ?? num(node.media_count),
      isPrivate: bool(node.is_private),
      isVerified: bool(node.is_verified),
      externalUrl: str(node.external_url),
      category: str(node.category_name) ?? str(node.category),
      collectedAt: collectedAt.toISOString(),
    };
  }
  return null;
}

// ── المنشورات ────────────────────────────────────────────────────────────────
function postKind(node: Json): CollectedPost['kind'] {
  const typename = str(node.__typename);
  const mediaType = num(node.media_type);
  const productType = str(node.product_type);
  if (productType === 'clips') return 'reel';
  if (typename === 'GraphSidecar' || typename === 'XDTGraphSidecar' || mediaType === 8) return 'carousel';
  if (typename === 'GraphVideo' || typename === 'XDTGraphVideo' || mediaType === 2 || node.is_video === true) return 'video';
  return 'photo';
}

function bestImage(node: Json): string | null {
  const direct = str(node.display_url) ?? str(node.thumbnail_src);
  if (direct) return direct;
  const candidates = get(node, 'image_versions2', 'candidates');
  if (Array.isArray(candidates)) {
    const sorted = candidates.filter(isObject).sort((a, b) => (num(b.width) ?? 0) - (num(a.width) ?? 0));
    return str(sorted[0]?.url);
  }
  return null;
}

function mediaOf(node: Json): CollectedMedia[] {
  const children =
    (get(node, 'edge_sidecar_to_children', 'edges') as unknown[] | undefined)?.map(edge => get(edge, 'node')) ??
    (Array.isArray(node.carousel_media) ? node.carousel_media : undefined);
  const items = (children?.filter(isObject) as Json[] | undefined) ?? [node];
  const out: CollectedMedia[] = [];
  for (const item of items) {
    // للفيديو نحفظ صورة الغلاف الآن؛ تنزيل الفيديو واستخراج اللقطات في Phase 2.
    const url = bestImage(item);
    if (!url) continue;
    const dimensions = isObject(item.dimensions) ? item.dimensions : item;
    out.push({
      type: 'image',
      url,
      width: num(dimensions.width) ?? num(dimensions.original_width) ?? undefined,
      height: num(dimensions.height) ?? num(dimensions.original_height) ?? undefined,
      alt: str(item.accessibility_caption) ?? undefined,
    });
  }
  return out;
}

/** كائن «منشور» بأحد الشكلين: القديم (shortcode + edge_*) أو الجديد (code + like_count). */
function looksLikePost(node: Json): boolean {
  const code = str(node.shortcode) ?? str(node.code);
  if (!code) return false;
  return 'taken_at_timestamp' in node || 'taken_at' in node || 'edge_media_to_caption' in node || 'like_count' in node;
}

export function parsePosts(payload: unknown, handle: string): CollectedPost[] {
  const wanted = handle.toLowerCase();
  const seen = new Map<string, CollectedPost>();
  for (const node of walk(payload)) {
    if (!looksLikePost(node)) continue;
    const owner = str(get(node, 'owner', 'username')) ?? str(get(node, 'user', 'username'));
    // شبكة «مقترح لك» تظهر في نفس الردود: نأخذ منشورات صاحب الحساب فقط.
    if (owner && owner.toLowerCase() !== wanted) continue;
    const code = (str(node.shortcode) ?? str(node.code))!;
    if (seen.has(code)) continue;
    const kind = postKind(node);
    const caption =
      str(get(node, 'edge_media_to_caption', 'edges', '0', 'node', 'text')) ??
      str(get(node, 'caption', 'text')) ??
      '';
    seen.set(code, {
      id: code,
      platform: 'ig',
      url: `https://www.instagram.com/${kind === 'reel' ? 'reel' : 'p'}/${code}/`,
      accountHandle: handle,
      kind,
      caption,
      publishedAt: isoFromSeconds(node.taken_at_timestamp) ?? isoFromSeconds(node.taken_at),
      likes:
        num(get(node, 'edge_liked_by', 'count')) ?? num(get(node, 'edge_media_preview_like', 'count')) ?? num(node.like_count),
      comments: num(get(node, 'edge_media_to_comment', 'count')) ?? num(node.comment_count),
      views: num(node.video_view_count) ?? num(node.play_count) ?? num(node.view_count),
      media: mediaOf(node),
    });
  }
  // الأحدث أولاً؛ المثبّتة قد تأتي في البداية بتاريخ أقدم.
  return [...seen.values()].sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
}

// ── خطة بديلة: قراءة DOM ─────────────────────────────────────────────────────
/** «1,234 Followers, 56 Following, 78 Posts - …» أو «12.5K Followers…» من وسم og:description. */
export function parseOgDescription(text: string): {followers: number | null; following: number | null; postCount: number | null} {
  const grab = (label: string): number | null => {
    const match = new RegExp(`([\\d.,]+)\\s*([KMB])?\\s+${label}`, 'i').exec(text);
    if (!match) return null;
    const base = Number(match[1]!.replace(/,/g, ''));
    if (!Number.isFinite(base)) return null;
    const scale = {K: 1e3, M: 1e6, B: 1e9}[(match[2] ?? '').toUpperCase()] ?? 1;
    return Math.round(base * scale);
  };
  return {followers: grab('Followers'), following: grab('Following'), postCount: grab('Posts')};
}

async function readDomFallback(page: Page, handle: string): Promise<{profile: CollectedProfile | null; posts: CollectedPost[]}> {
  const og = await page.locator('meta[property="og:description"]').getAttribute('content').catch(() => null);
  const title = await page.locator('meta[property="og:title"]').getAttribute('content').catch(() => null);
  const counts = og ? parseOgDescription(og) : null;
  const profile: CollectedProfile | null = counts
    ? {
        platform: 'ig',
        handle,
        url: `https://www.instagram.com/${handle}/`,
        name: title?.split('(')[0]?.trim() || null,
        bio: null,
        ...counts,
        isPrivate: null,
        isVerified: null,
        externalUrl: null,
        category: null,
        collectedAt: new Date().toISOString(),
      }
    : null;

  const tiles = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLAnchorElement>('a[href*="/p/"], a[href*="/reel/"]')].map(a => {
      const img = a.querySelector('img');
      return {href: a.getAttribute('href') ?? '', src: img?.getAttribute('src') ?? null, alt: img?.getAttribute('alt') ?? null};
    }),
  );
  const posts: CollectedPost[] = [];
  const seen = new Set<string>();
  for (const tile of tiles) {
    const match = /\/(p|reel)\/([A-Za-z0-9_-]+)/.exec(tile.href);
    if (!match || seen.has(match[2]!)) continue;
    seen.add(match[2]!);
    posts.push({
      id: match[2]!,
      platform: 'ig',
      url: `https://www.instagram.com/${match[1]}/${match[2]}/`,
      accountHandle: handle,
      kind: match[1] === 'reel' ? 'reel' : 'photo',
      caption: '',
      publishedAt: null,
      likes: null,
      comments: null,
      views: null,
      media: tile.src ? [{type: 'image', url: tile.src, alt: tile.alt ?? undefined}] : [],
    });
  }
  return {profile, posts};
}

// ── التشغيل ──────────────────────────────────────────────────────────────────
export interface InstagramProfileResult {
  profile: CollectedProfile | null;
  posts: CollectedPost[];
  /** من أين جاءت البيانات — للشفافية وللتشخيص عند تغيّر الموقع. */
  source: 'network' | 'dom' | 'mixed' | 'none';
  /** الردود الخام التي التُقطت (تُحفظ كـ fixtures). */
  rawPayloads: {url: string; body: unknown}[];
  warnings: string[];
}

const INTERESTING = /\/api\/v1\/users\/web_profile_info|\/graphql\/query|\/api\/graphql|\/api\/v1\/feed\/user\//;

export function normalizeHandle(input: string): string {
  const trimmed = input.trim().replace(/^@/, '');
  const match = /instagram\.com\/([A-Za-z0-9._]+)/i.exec(trimmed);
  return (match ? match[1]! : trimmed).replace(/\/+$/, '');
}

export async function readInstagramProfile(
  page: Page,
  input: string,
  options: {maxPosts?: number; pacing?: Pacing} = {},
): Promise<InstagramProfileResult> {
  const handle = normalizeHandle(input);
  const maxPosts = options.maxPosts ?? 12;
  const pacing = options.pacing ?? DEFAULT_PACING;
  const rawPayloads: InstagramProfileResult['rawPayloads'] = [];
  const warnings: string[] = [];

  const onResponse = async (response: Response) => {
    if (!INTERESTING.test(response.url()) || response.status() !== 200) return;
    try {
      const text = await response.text();
      if (text.length < 20 || text.length > 6_000_000) return;
      rawPayloads.push({url: response.url().split('?')[0]!, body: JSON.parse(text.replace(/^for \(;;\);/, ''))});
    } catch {
      // ليس JSON أو أُغلق الرد: نتجاهله.
    }
  };
  page.on('response', onResponse);

  try {
    try {
      await page.goto(`https://www.instagram.com/${handle}/`, {waitUntil: 'domcontentloaded', timeout: 45_000});
    } catch (error) {
      throw describeNavigationError(error, 'instagram.com');
    }
    await humanPause(page, pacing);
    await assertNotBlocked(page, 'instagram');

    if (await page.getByText(/Sorry, this page isn't available|الصفحة غير متوفرة/i).count()) {
      throw new CollectorBlocked('not_found', `الحساب «${handle}» غير موجود أو غير متاح.`, page.url());
    }

    const collect = () => ({
      profile: rawPayloads.map(p => parseProfile(p.body, handle)).find(Boolean) ?? null,
      posts: dedupe(rawPayloads.flatMap(p => parsePosts(p.body, handle))),
    });

    let state = collect();
    for (let i = 0; i < pacing.maxScrolls && state.posts.length < maxPosts; i += 1) {
      await humanScroll(page, pacing);
      await assertNotBlocked(page, 'instagram');
      state = collect();
    }

    let source: InstagramProfileResult['source'] = state.posts.length || state.profile ? 'network' : 'none';
    if (!state.profile || state.posts.length < Math.min(maxPosts, 12)) {
      const dom = await readDomFallback(page, handle);
      if (!state.profile && dom.profile) {
        state.profile = dom.profile;
        source = source === 'network' ? 'mixed' : 'dom';
        warnings.push('أرقام الحساب قُرئت من وسوم الصفحة (og) لا من بيانات الموقع — السيرة والتصنيف غير متوفرين.');
      }
      if (state.posts.length === 0 && dom.posts.length) {
        state.posts = dom.posts;
        source = source === 'network' ? 'mixed' : 'dom';
        warnings.push('المنشورات قُرئت من شبكة الصور فقط — بلا نصوص ولا أرقام تفاعل ولا تواريخ.');
      }
    }
    if (state.profile?.isPrivate) warnings.push('الحساب خاص: لا يمكن قراءة منشوراته.');
    if (!state.profile && !state.posts.length) {
      warnings.push('لم نتمكن من قراءة أي بيانات. قد يكون شكل الموقع تغيّر — الردود الخام محفوظة للتشخيص.');
    }

    return {profile: state.profile, posts: state.posts.slice(0, maxPosts), source, rawPayloads, warnings};
  } finally {
    page.off('response', onResponse);
  }
}

function dedupe(posts: CollectedPost[]): CollectedPost[] {
  const byId = new Map<string, CollectedPost>();
  for (const post of posts) {
    const existing = byId.get(post.id);
    // نفس المنشور قد يظهر في ردّين؛ نحتفظ بالأغنى بيانات.
    if (!existing || (existing.likes === null && post.likes !== null) || (!existing.caption && post.caption)) byId.set(post.id, post);
  }
  return [...byId.values()].sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
}
