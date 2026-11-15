import type {Page, Response} from 'playwright';
import type {CollectedAd, CollectedMedia} from '../core/schemas';
import {
  DEFAULT_PACING,
  assertNotBlocked,
  describeNavigationError,
  humanPause,
  humanScroll,
  type Pacing,
} from './browser';

/**
 * Meta Ad Library collector (Phase 0 spike): ads for a page or a keyword, with their start dates.
 *
 * Why browse the web UI rather than the official API? The Ad Library API (ads_archive) returns
 * social-issue/political ads from any country, but commercial ads only if they were shown in the European Union
 * or the UK. Commercial ads targeting Palestine do not show up in it — whereas the Ad Library on the web
 * is public and shows them to any visitor without logging in. Details and sources are in docs/decisions.md.
 *
 * Approach: we open the public search page and read the JSON responses the site requests to render the results
 * (+ the data embedded in the initial HTML), and scroll the page at a human pace to load more.
 *
 * ⚠️ The response shape is undocumented and it changes. The parser looks for any object that has an ad_archive_id,
 * wherever it is, and the raw responses are saved to become fixtures.
 */

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const str = (value: unknown): string | null => (typeof value === 'string' && value.trim().length ? value : null);
const bool = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);

function* walk(value: unknown, depth = 0): Generator<Json> {
  if (depth > 14) return;
  if (Array.isArray(value)) {
    for (const item of value) yield* walk(item, depth + 1);
  } else if (isObject(value)) {
    yield value;
    for (const item of Object.values(value)) yield* walk(item, depth + 1);
  }
}

const isoFromSeconds = (value: unknown): string | null => {
  const seconds = num(value) ?? (typeof value === 'string' && /^\d{9,11}$/.test(value) ? Number(value) : null);
  return seconds ? new Date(seconds * 1000).toISOString() : null;
};

/** The ad text may be a string, {text} or {markup:{__html}}. Catalog templates ({{product.name}}) are left as they are. */
function textOf(value: unknown): string | null {
  if (typeof value === 'string') return str(value);
  if (isObject(value)) return str(value.text) ?? str((value.markup as Json | undefined)?.__html)?.replace(/<[^>]+>/g, ' ').trim() ?? null;
  return null;
}

function mediaFrom(node: Json): CollectedMedia[] {
  const out: CollectedMedia[] = [];
  const images = Array.isArray(node.images) ? node.images.filter(isObject) : [];
  for (const image of images) {
    const url = str(image.original_image_url) ?? str(image.resized_image_url);
    if (url) out.push({type: 'image', url});
  }
  const videos = Array.isArray(node.videos) ? node.videos.filter(isObject) : [];
  for (const video of videos) {
    const poster = str(video.video_preview_image_url);
    const url = str(video.video_hd_url) ?? str(video.video_sd_url);
    if (url) out.push({type: 'video', url});
    if (poster) out.push({type: 'image', url: poster});
  }
  // Carousel cards carry their images directly on the card.
  const direct = str(node.original_image_url) ?? str(node.resized_image_url);
  if (direct) out.push({type: 'image', url: direct});
  const directVideo = str(node.video_hd_url) ?? str(node.video_sd_url);
  if (directVideo) out.push({type: 'video', url: directVideo});
  const directPoster = str(node.video_preview_image_url);
  if (directPoster) out.push({type: 'image', url: directPoster});
  return out;
}

export function daysBetween(startIso: string | null, endIso: string | null, now = new Date()): number | null {
  if (!startIso) return null;
  const end = endIso ? new Date(endIso) : now;
  const days = Math.floor((end.getTime() - new Date(startIso).getTime()) / 86_400_000);
  return days >= 0 ? days + 1 : null;
}

/** Extracts every ad from any JSON (a GraphQL response or data embedded in the page). */
export function parseAds(payload: unknown, now = new Date()): CollectedAd[] {
  const byId = new Map<string, CollectedAd>();
  for (const node of walk(payload)) {
    const rawId = node.ad_archive_id ?? node.adArchiveID;
    const id = typeof rawId === 'number' ? String(rawId) : str(rawId);
    if (!id || !/^\d{6,}$/.test(id)) continue;
    const snapshot = isObject(node.snapshot) ? node.snapshot : {};
    const cards = Array.isArray(snapshot.cards) ? snapshot.cards.filter(isObject) : [];
    const firstCard = cards[0] ?? {};

    const startDate = isoFromSeconds(node.start_date) ?? isoFromSeconds(node.startDate);
    const endDate = isoFromSeconds(node.end_date) ?? isoFromSeconds(node.endDate);
    const isActive = bool(node.is_active) ?? bool(node.isActive);
    const platforms = (Array.isArray(node.publisher_platform) ? node.publisher_platform : Array.isArray(node.publisherPlatform) ? node.publisherPlatform : [])
      .filter((p): p is string => typeof p === 'string')
      .map(p => p.toLowerCase());

    const media = [...mediaFrom(snapshot), ...cards.flatMap(mediaFrom)];
    const uniqueMedia = [...new Map(media.map(m => [m.url, m])).values()];

    const ad: CollectedAd = {
      id,
      platform: 'meta',
      url: `https://www.facebook.com/ads/library/?id=${id}`,
      pageId: str(node.page_id) ?? str(snapshot.page_id) ?? (num(node.page_id) !== null ? String(node.page_id) : null),
      pageName: str(node.page_name) ?? str(snapshot.page_name),
      isActive,
      startDate,
      endDate: isActive ? null : endDate,
      daysRunning: daysBetween(startDate, isActive ? null : endDate, now),
      platforms,
      variants: num(node.collation_count) ?? num(node.collationCount),
      body: textOf(snapshot.body) ?? textOf(firstCard.body) ?? '',
      title: str(snapshot.title) ?? str(firstCard.title),
      cta: str(snapshot.cta_text) ?? str(firstCard.cta_text),
      linkUrl: str(snapshot.link_url) ?? str(firstCard.link_url),
      format: str(snapshot.display_format)?.toLowerCase() ?? null,
      media: uniqueMedia,
    };

    const existing = byId.get(id);
    // The copy that carries a snapshot is richer than a bare reference by ID.
    if (!existing || (!existing.startDate && ad.startDate) || (existing.media.length === 0 && ad.media.length > 0)) byId.set(id, ad);
  }
  return [...byId.values()];
}

/** Cheap pre-filter before parsing: does this text mention an ad id in either known spelling? */
const mentionsAds = (text: string): boolean => text.includes('ad_archive_id') || text.includes('adArchiveID');

/** JSON embedded in the initial HTML: <script type="application/json"> tags that mention an ad id. */
export function parseEmbeddedJson(html: string): unknown[] {
  const out: unknown[] = [];
  const pattern = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
  for (const match of html.matchAll(pattern)) {
    const text = match[1]!;
    if (!mentionsAds(text)) continue;
    try {
      out.push(JSON.parse(text));
    } catch {
      // Broken tag: skip it.
    }
  }
  return out;
}

/** GraphQL responses may be several JSON objects on consecutive lines, and may start with "for (;;);". */
export function parseGraphqlBody(text: string): unknown[] {
  const cleaned = text.replace(/^for \(;;\);/, '').trim();
  try {
    return [JSON.parse(cleaned)];
  } catch {
    const out: unknown[] = [];
    for (const line of cleaned.split('\n')) {
      try {
        if (line.trim()) out.push(JSON.parse(line));
      } catch {
        // Incomplete line.
      }
    }
    return out;
  }
}

// ── Building the search URL ──────────────────────────────────────────────────
export type AdLibraryQuery = {kind: 'keyword'; keyword: string} | {kind: 'page'; pageId: string};

export interface AdLibraryOptions {
  /** Two-letter country code (PS, JO, IL…) or ALL for all countries. */
  country?: string;
  /** all = active and stopped ones. */
  status?: 'all' | 'active' | 'inactive';
  maxAds?: number;
  pacing?: Pacing;
}

export function buildAdLibraryUrl(query: AdLibraryQuery, options: AdLibraryOptions = {}): string {
  const params = new URLSearchParams({
    active_status: options.status ?? 'all',
    ad_type: 'all',
    country: (options.country ?? 'ALL').toUpperCase(),
    media_type: 'all',
  });
  if (query.kind === 'keyword') {
    params.set('q', query.keyword);
    params.set('search_type', 'keyword_unordered');
  } else {
    if (!/^\d+$/.test(query.pageId)) throw new Error('معرّف الصفحة يجب أن يكون رقماً (Page ID).');
    params.set('view_all_page_id', query.pageId);
    params.set('search_type', 'page');
  }
  return `https://www.facebook.com/ads/library/?${params.toString()}`;
}

// ── Run ──────────────────────────────────────────────────────────────────────
export interface AdLibraryResult {
  ads: CollectedAd[];
  url: string;
  source: 'network' | 'embedded' | 'mixed' | 'none';
  rawPayloads: {url: string; body: unknown}[];
  warnings: string[];
  /** What the page actually did — kept so a silent "0 ads" can be diagnosed when the site changes. */
  diagnostics: {
    finalUrl: string;
    title: string;
    graphqlResponses: number;
    graphqlWithAds: number;
    htmlBytes: number;
    embeddedBlocks: number;
  };
}

export async function readAdLibrary(page: Page, query: AdLibraryQuery, options: AdLibraryOptions = {}): Promise<AdLibraryResult> {
  const pacing = options.pacing ?? DEFAULT_PACING;
  const maxAds = options.maxAds ?? 30;
  const url = buildAdLibraryUrl(query, options);
  const rawPayloads: AdLibraryResult['rawPayloads'] = [];
  const warnings: string[] = [];
  const fromNetwork = new Map<string, CollectedAd>();
  const fromEmbedded = new Map<string, CollectedAd>();
  const seen = {graphqlResponses: 0, graphqlWithAds: 0, htmlBytes: 0, embeddedBlocks: 0};

  const onResponse = async (response: Response) => {
    if (!/\/api\/graphql/.test(response.url())) return;
    seen.graphqlResponses += 1;
    if (response.status() !== 200) return;
    try {
      const text = await response.text();
      if (!mentionsAds(text)) return;
      seen.graphqlWithAds += 1;
      for (const body of parseGraphqlBody(text)) {
        rawPayloads.push({url: '/api/graphql/', body});
        for (const ad of parseAds(body)) fromNetwork.set(ad.id, ad);
      }
    } catch {
      // A response that was closed before it was read.
    }
  };
  page.on('response', onResponse);

  try {
    let html = '';
    try {
      const response = await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 45_000});
      html = (await response?.text().catch(() => '')) ?? '';
    } catch (error) {
      throw describeNavigationError(error, 'facebook.com');
    }
    await assertNotBlocked(page, 'facebook');

    // The first results are embedded in the document. Read the response body, and fall back to the live DOM:
    // the response text can be unavailable (redirects, streaming), while the script tags stay in the page.
    const readEmbedded = (source: string) => {
      seen.htmlBytes = Math.max(seen.htmlBytes, source.length);
      for (const body of parseEmbeddedJson(source)) {
        seen.embeddedBlocks += 1;
        rawPayloads.push({url: 'embedded', body});
        for (const ad of parseAds(body)) fromEmbedded.set(ad.id, ad);
      }
    };
    readEmbedded(html);
    if (!fromEmbedded.size) readEmbedded(await page.content().catch(() => ''));

    // Cookie consent dialog (shown from some countries): we choose the essential ones only.
    const consent = page.getByRole('button', {name: /Decline optional cookies|Only allow essential cookies|رفض ملفات تعريف الارتباط الاختيارية/i});
    if (await consent.count()) {
      await consent.first().click().catch(() => {});
      await humanPause(page, pacing);
    }

    await humanPause(page, pacing);
    const total = () => new Set([...fromNetwork.keys(), ...fromEmbedded.keys()]).size;
    let stalled = 0;
    for (let i = 0; i < pacing.maxScrolls && total() < maxAds && stalled < 2; i += 1) {
      const before = total();
      await humanScroll(page, pacing);
      await assertNotBlocked(page, 'facebook');
      stalled = total() === before ? stalled + 1 : 0;
    }

    // Later responses are newer than the embedded data; on a conflict we take the richer one (network).
    const merged = new Map([...fromEmbedded, ...fromNetwork]);
    const ads = [...merged.values()]
      .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))
      .slice(0, maxAds);

    const source: AdLibraryResult['source'] =
      fromNetwork.size && fromEmbedded.size ? 'mixed' : fromNetwork.size ? 'network' : fromEmbedded.size ? 'embedded' : 'none';

    if (!ads.length) {
      const empty = await page.getByText(/No ads match|0 results|لا توجد إعلانات/i).count();
      warnings.push(
        empty
          ? 'مكتبة الإعلانات لا تعرض أي إعلان لهذا البحث.'
          : 'لم نتمكن من قراءة أي إعلان. قد يكون شكل الموقع تغيّر — الردود الخام محفوظة للتشخيص.',
      );
    }
    if (ads.some(ad => !ad.startDate)) warnings.push('بعض الإعلانات بلا تاريخ بدء في بيانات الموقع.');

    const diagnostics = {finalUrl: page.url(), title: await page.title().catch(() => ''), ...seen};
    return {ads, url, source, rawPayloads, warnings, diagnostics};
  } finally {
    page.off('response', onResponse);
  }
}
