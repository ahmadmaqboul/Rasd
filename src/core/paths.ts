import {mkdirSync} from 'node:fs';
import {dirname, join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

/** Repository root (the folder that contains package.json). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * All of Rasd's data lives locally under a single folder (the database, media, packages, browser sessions).
 * It can be changed with the RASD_DATA_DIR variable (useful in tests).
 */
export function dataDir(): string {
  return resolve(process.env.RASD_DATA_DIR ?? join(REPO_ROOT, 'data'));
}

export const paths = {
  db: () => join(dataDir(), 'rasd.db'),
  media: () => join(dataDir(), 'media'),
  sessions: (platform: string) => join(dataDir(), 'sessions', platform),
  spikes: () => join(dataDir(), 'spikes'),
  study: (id: number) => join(dataDir(), 'studies', String(id)),
  studyPackage: (id: number) => join(dataDir(), 'studies', String(id), 'package'),
  migrations: () => join(REPO_ROOT, 'drizzle'),
};

export function ensureDir(dir: string): string {
  mkdirSync(dir, {recursive: true});
  return dir;
}

/**
 * Resolves a relative path inside a base folder and rejects any attempt to escape it (path traversal).
 * Used before reading any file whose name comes from outside the app (UI, CLI, MCP).
 */
export function resolveInside(base: string, relative: string): string {
  const root = resolve(base);
  const target = resolve(root, relative);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`المسار خارج المجلد المسموح: ${relative}`);
  }
  return target;
}
