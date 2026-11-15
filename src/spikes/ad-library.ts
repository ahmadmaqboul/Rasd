import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {ensureDir, paths} from '../core/paths';
import {CollectorBlocked, proxyFromEnv} from '../collectors/browser';
import {readAdLibrary, type AdLibraryQuery} from '../collectors/meta-ad-library';
import {parseArgs, print} from './args';

/**
 * Meta Ad Library spike (Phase 0): ads for a keyword or a page, with their start dates.
 * The library is public — it needs no login, so we use no saved session here.
 *
 *   npm run spike:adlibrary -- --keyword "charger" [--country PS] [--max 30] [--headed]
 *   npm run spike:adlibrary -- --page 123456789012345
 */

const {flags} = parseArgs();
const keyword = typeof flags.keyword === 'string' ? flags.keyword : undefined;
const pageId = typeof flags.page === 'string' ? flags.page : undefined;

if (!keyword && !pageId) {
  process.stderr.write('الاستعمال: npm run spike:adlibrary -- --keyword "<كلمة>" | --page <Page ID> [--country PS] [--max 30] [--headed]\n');
  process.exit(2);
}

const query: AdLibraryQuery = pageId ? {kind: 'page', pageId} : {kind: 'keyword', keyword: keyword!};
const slug = (pageId ? `page-${pageId}` : `kw-${keyword!}`).replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60);
const outDir = ensureDir(join(paths.spikes(), 'ad-library', slug));
const browser = await chromium.launch({headless: !flags.headed, proxy: proxyFromEnv()});
const started = Date.now();

try {
  // Fixed English UI: the texts we check for (empty-results messages, consent prompt) don't change with the machine's language.
  const context = await browser.newContext({locale: 'en-US', viewport: {width: 1280, height: 900}});
  const page = await context.newPage();
  const result = await readAdLibrary(page, query, {
    country: typeof flags.country === 'string' ? flags.country : 'ALL',
    maxAds: Number(flags.max ?? 30),
  });

  // When nothing was read, keep what the page looked like: the first thing needed to fix a parser.
  if (!result.ads.length) {
    await page.screenshot({path: join(outDir, 'page.png')}).catch(() => {});
    writeFileSync(join(outDir, 'page.html'), await page.content().catch(() => ''));
  }

  result.rawPayloads.slice(0, 20).forEach((payload, i) => writeFileSync(join(outDir, `raw-${i + 1}.json`), JSON.stringify(payload, null, 2)));
  writeFileSync(join(outDir, 'result.json'), JSON.stringify(result.ads, null, 2));

  print({
    ok: result.ads.length > 0,
    query,
    url: result.url,
    source: result.source,
    ads: result.ads.map(ad => ({
      id: ad.id,
      page: ad.pageName,
      active: ad.isActive,
      startDate: ad.startDate?.slice(0, 10) ?? null,
      daysRunning: ad.daysRunning,
      variants: ad.variants,
      platforms: ad.platforms,
      format: ad.format,
      cta: ad.cta,
      body: ad.body.slice(0, 80),
      media: ad.media.length,
    })),
    counts: {ads: result.ads.length, withStartDate: result.ads.filter(a => a.startDate).length, rawPayloads: result.rawPayloads.length},
    warnings: result.warnings,
    diagnostics: result.diagnostics,
    seconds: Math.round((Date.now() - started) / 1000),
    savedTo: outDir,
  });
} catch (error) {
  if (error instanceof CollectorBlocked) {
    print({ok: false, blocked: error.reason, message: error.message, url: error.url});
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  await browser.close();
}
