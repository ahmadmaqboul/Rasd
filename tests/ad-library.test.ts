import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {buildAdLibraryUrl, daysBetween, parseAds, parseEmbeddedJson, parseGraphqlBody} from '../src/collectors/meta-ad-library';

const text = readFileSync(new URL('./fixtures/ad-library-graphql.json', import.meta.url), 'utf8');
const fixture: unknown = JSON.parse(text);
const NOW = new Date('2026-11-15T12:00:00Z');

describe('parseAds', () => {
  const ads = parseAds(fixture, NOW);
  const byId = Object.fromEntries(ads.map(ad => [ad.id, ad]));

  it('finds every ad wherever it sits in the payload', () => {
    expect(ads.map(a => a.id).sort()).toEqual(['1111111111111111', '2222222222222222', '3333333333333333']);
  });

  it('reads an active image ad with its start date, variants and platforms', () => {
    const ad = byId['1111111111111111']!;
    expect(ad).toMatchObject({
      pageName: 'Sample Accessories',
      pageId: '200000000000001',
      isActive: true,
      variants: 4,
      platforms: ['facebook', 'instagram'],
      cta: 'Send message',
      linkUrl: 'https://m.me/sample',
      format: 'image',
      url: 'https://www.facebook.com/ads/library/?id=1111111111111111',
    });
    expect(ad.startDate).toBe(new Date(1790000000 * 1000).toISOString());
    // Active ad: the "end date" in the data is the last day it was shown, so we don't count it as a stop.
    expect(ad.endDate).toBeNull();
    expect(ad.daysRunning).toBe(daysBetween(ad.startDate, null, NOW));
    expect(ad.body).toContain('89 شيكل');
    expect(ad.media).toEqual([{type: 'image', url: 'https://cdn.example.com/ad1.jpg'}]);
  });

  it('reads a stopped video ad and counts days until it stopped', () => {
    const ad = byId['2222222222222222']!;
    expect(ad.isActive).toBe(false);
    expect(ad.endDate).toBe(new Date(1786728000 * 1000).toISOString());
    expect(ad.daysRunning).toBe(21);
    expect(ad.media.map(m => m.type)).toEqual(['video', 'image']);
  });

  it('falls back to carousel cards for copy and media', () => {
    const ad = byId['3333333333333333']!;
    expect(ad.format).toBe('carousel');
    expect(ad.title).toBe('باور بانك 20000');
    expect(ad.media).toHaveLength(2);
    // Catalog template: we leave it as is so the analyzer sees it and knows it is a dynamic ad.
    expect(ad.body).toBe('{{product.brand}}');
  });

  it('never throws on unexpected input and ignores non-numeric ids', () => {
    expect(parseAds(null)).toEqual([]);
    expect(parseAds({ad_archive_id: 'not-a-number', snapshot: {}})).toEqual([]);
  });
});

describe('daysBetween', () => {
  it('counts both the first and the last day', () => {
    expect(daysBetween('2026-11-01T00:00:00Z', '2026-11-01T10:00:00Z')).toBe(1);
    expect(daysBetween('2026-11-01T00:00:00Z', null, new Date('2026-11-15T12:00:00Z'))).toBe(15);
  });
  it('returns null without a start or when the range is inverted', () => {
    expect(daysBetween(null, null)).toBeNull();
    expect(daysBetween('2026-11-10T00:00:00Z', '2026-11-01T00:00:00Z')).toBeNull();
  });
});

describe('response decoding', () => {
  it('parses a single JSON body, with or without the for(;;); prefix', () => {
    expect(parseAds(parseGraphqlBody(text))).toHaveLength(3);
    expect(parseAds(parseGraphqlBody(`for (;;);${text}`))).toHaveLength(3);
  });

  it('parses newline-delimited JSON chunks', () => {
    const compact = JSON.stringify(fixture);
    const chunks = parseGraphqlBody(`${compact}\n{"label":"x","data":{}}\n`);
    expect(chunks).toHaveLength(2);
    expect(parseAds(chunks)).toHaveLength(3);
  });

  it('extracts JSON embedded in the first HTML and skips unrelated or broken scripts', () => {
    const html =
      `<html><script type="application/json" data-sjs>${JSON.stringify(fixture)}</script>` +
      `<script type="application/json">{"unrelated":true}</script>` +
      `<script type="application/json">{"ad_archive_id": broken</script></html>`;
    const embedded = parseEmbeddedJson(html);
    expect(embedded).toHaveLength(1);
    expect(parseAds(embedded)).toHaveLength(3);
  });
});

describe('buildAdLibraryUrl', () => {
  it('builds a keyword search for all countries by default', () => {
    const url = new URL(buildAdLibraryUrl({kind: 'keyword', keyword: 'شاحن 65 واط'}));
    expect(url.origin + url.pathname).toBe('https://www.facebook.com/ads/library/');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      active_status: 'all',
      ad_type: 'all',
      country: 'ALL',
      media_type: 'all',
      q: 'شاحن 65 واط',
      search_type: 'keyword_unordered',
    });
  });

  it('builds a page search and upper-cases the country', () => {
    const url = new URL(buildAdLibraryUrl({kind: 'page', pageId: '123456'}, {country: 'ps', status: 'active'}));
    expect(url.searchParams.get('view_all_page_id')).toBe('123456');
    expect(url.searchParams.get('search_type')).toBe('page');
    expect(url.searchParams.get('country')).toBe('PS');
    expect(url.searchParams.get('active_status')).toBe('active');
  });

  it('rejects a page id that is not numeric', () => {
    expect(() => buildAdLibraryUrl({kind: 'page', pageId: 'saedtel'})).toThrow();
  });
});
