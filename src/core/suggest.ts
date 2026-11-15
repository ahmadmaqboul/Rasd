/**
 * يقترح نوع الدراسة من نص يلصقه المستخدم في الرئيسية:
 * رابط حساب ← دراسة حساب، رابط مكتبة الإعلانات ← دراسة إعلانات،
 * رابط متجر/منتج ← دراسة منتج، نص حر ← دراسة منتج (الأكثر شيوعاً لمتجر).
 * دالة نقية بلا شبكة — تُختبر في tests/suggest.test.ts.
 */

export type Platform = 'instagram' | 'facebook' | 'tiktok' | 'web';

export interface Suggestion {
  recipeId: 'account' | 'ads' | 'product';
  reason: 'account_url' | 'handle' | 'ad_library_url' | 'store_url' | 'free_text';
  platform?: Platform;
  /** اسم الحساب بعد التنظيف (بدون @ وبدون مسارات فرعية). */
  handle?: string;
  /** النص كما سيُملأ في شاشة الإعداد. */
  value: string;
}

const RESERVED: Record<'instagram' | 'facebook' | 'tiktok', Set<string>> = {
  instagram: new Set(['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'direct', 'tv', 'about', 'legal']),
  facebook: new Set([
    'ads', 'watch', 'groups', 'events', 'marketplace', 'gaming', 'login', 'share', 'sharer',
    'photo', 'photos', 'reel', 'reels', 'story.php', 'permalink.php', 'help', 'policies',
  ]),
  tiktok: new Set(['discover', 'tag', 'music', 'foryou', 'following', 'explore', 'live']),
};

function parseUrl(raw: string): URL | undefined {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    return url.hostname.includes('.') ? url : undefined;
  } catch {
    return undefined;
  }
}

function bareHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/^(www|m|web|l|mbasic)\./, '');
}

export function suggestStudy(input: string): Suggestion | undefined {
  const value = input.trim();
  if (!value) return undefined;

  // @handle بلا رابط: نفترض إنستغرام (المنصة الأولى لرَصد).
  const handleMatch = /^@([A-Za-z0-9._]{2,30})$/.exec(value);
  if (handleMatch) {
    return {recipeId: 'account', reason: 'handle', platform: 'instagram', handle: handleMatch[1], value};
  }

  const looksLikeUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(value);
  const url = looksLikeUrl && !/\s/.test(value) ? parseUrl(value) : undefined;
  if (!url) return {recipeId: 'product', reason: 'free_text', value};

  const host = bareHost(url);
  const segments = url.pathname.split('/').filter(Boolean);
  const first = segments[0]?.toLowerCase();

  if (host === 'facebook.com' && first === 'ads' && segments[1]?.toLowerCase() === 'library') {
    return {recipeId: 'ads', reason: 'ad_library_url', platform: 'facebook', value};
  }

  if (host === 'instagram.com' && first && !RESERVED.instagram.has(first)) {
    return {recipeId: 'account', reason: 'account_url', platform: 'instagram', handle: segments[0], value};
  }

  if (host === 'facebook.com' || host === 'fb.com') {
    if (first === 'profile.php') {
      const id = url.searchParams.get('id') ?? undefined;
      return {recipeId: 'account', reason: 'account_url', platform: 'facebook', handle: id, value};
    }
    if (first && !RESERVED.facebook.has(first)) {
      return {recipeId: 'account', reason: 'account_url', platform: 'facebook', handle: segments[0], value};
    }
  }

  if (host === 'tiktok.com' && segments[0]?.startsWith('@')) {
    return {recipeId: 'account', reason: 'account_url', platform: 'tiktok', handle: segments[0].slice(1), value};
  }

  // رابط منشور/ريل على منصة اجتماعية: لا نخمّن الحساب، نتركه نصاً حراً للمراجعة.
  if (host === 'instagram.com' || host === 'facebook.com' || host === 'fb.com' || host === 'tiktok.com') {
    return {recipeId: 'account', reason: 'account_url', platform: host.startsWith('insta') ? 'instagram' : host === 'tiktok.com' ? 'tiktok' : 'facebook', value};
  }

  return {recipeId: 'product', reason: 'store_url', platform: 'web', value};
}
