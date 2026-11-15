import Database from 'better-sqlite3';
import {drizzle, type BetterSQLite3Database} from 'drizzle-orm/better-sqlite3';
import {migrate} from 'drizzle-orm/better-sqlite3/migrator';
import {dirname} from 'node:path';
import {ensureDir, paths} from '../paths';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;

let cached: {path: string; db: Db; raw: Database.Database} | undefined;

/**
 * يفتح قاعدة SQLite المحلية ويطبّق الترحيلات. آمن للاستدعاء من عدة عمليات
 * (الخادم و CLI و MCP) بفضل WAL و busy_timeout.
 */
export function getDb(): Db {
  const file = paths.db();
  if (cached && cached.path === file) return cached.db;
  ensureDir(dirname(file));
  const raw = new Database(file);
  raw.pragma('journal_mode = WAL');
  raw.pragma('busy_timeout = 5000');
  raw.pragma('foreign_keys = ON');
  const db = drizzle(raw, {schema});
  migrate(db, {migrationsFolder: paths.migrations()});
  cached = {path: file, db, raw};
  return db;
}

export function closeDb(): void {
  cached?.raw.close();
  cached = undefined;
}

export {schema};
