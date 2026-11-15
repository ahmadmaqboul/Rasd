import type {BrowserContext} from 'playwright';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {ensureDir} from '../core/paths';
import type {CollectedMedia} from '../core/schemas';
import {randomBetween} from './browser';

/** Size cap for a single file — images only in Phase 0; video (and its frame captures) in Phase 2. */
const MAX_BYTES = 15 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic'};

/**
 * Downloads an item's images through the same browser context (the same session that rendered the page), with short gaps.
 * A failed image does not fail the item: we carry on with what succeeded and return how many failed.
 */
export async function downloadImages(
  context: BrowserContext,
  media: CollectedMedia[],
  dir: string,
  prefix: string,
): Promise<{media: CollectedMedia[]; failed: number}> {
  ensureDir(dir);
  let failed = 0;
  const out: CollectedMedia[] = [];
  let n = 0;
  for (const item of media) {
    if (item.type !== 'image' || !item.url) {
      out.push(item);
      continue;
    }
    n += 1;
    try {
      const response = await context.request.get(item.url, {timeout: 30_000, maxRedirects: 3});
      const type = (response.headers()['content-type'] ?? '').split(';')[0]!.trim();
      const body = await response.body();
      if (!response.ok() || !type.startsWith('image/') || body.length === 0 || body.length > MAX_BYTES) throw new Error('bad image');
      const file = join(dir, `${prefix}_${n}.${EXTENSIONS[type] ?? 'jpg'}`);
      writeFileSync(file, body);
      out.push({...item, file});
    } catch {
      failed += 1;
      out.push(item);
    }
    await new Promise(resolve => setTimeout(resolve, randomBetween(150, 600)));
  }
  return {media: out, failed};
}
