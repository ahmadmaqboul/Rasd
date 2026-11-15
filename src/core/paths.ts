import {mkdirSync} from 'node:fs';
import {dirname, join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

/** جذر المستودع (المجلد الذي يحوي package.json). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * كل بيانات رَصد تعيش محلياً تحت مجلد واحد (القاعدة، الوسائط، الحزم، جلسات المتصفح).
 * يمكن تغييره بالمتغير RASD_DATA_DIR (مفيد في الاختبارات).
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
 * يحلّ مساراً نسبياً داخل مجلد أساس ويرفض أي محاولة للخروج منه (path traversal).
 * يُستعمل قبل قراءة أي ملف يأتي اسمه من خارج التطبيق (واجهة، CLI، MCP).
 */
export function resolveInside(base: string, relative: string): string {
  const root = resolve(base);
  const target = resolve(root, relative);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`المسار خارج المجلد المسموح: ${relative}`);
  }
  return target;
}
