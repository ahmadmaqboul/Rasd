import {existsSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {eq} from 'drizzle-orm';
import {z} from 'zod';
import {getDb, schema} from './db/client';
import {CURRENCIES} from './db/schema';
import {emitEvent} from './events';
import {REPO_ROOT} from './paths';
import {formatZodError} from './schemas';

/**
 * App settings (§4.6, §5.2, §8): collection limits and pacing, and how numbers and money are shown.
 * Stored per section in the `settings` table. A missing or invalid stored section falls back to the defaults,
 * so a bad value can never stop the app from starting.
 */

/** A whole number within a range, with an Arabic error message. */
const intRange = (min: number, max: number) =>
  z
    .number({error: 'لازم يكون رقم'})
    .int({error: 'لازم يكون رقم صحيح'})
    .min(min, {error: `أقل قيمة مسموحة ${min}`})
    .max(max, {error: `أعلى قيمة مسموحة ${max}`});

export const CollectionSettings = z
  .strictObject({
    /** Random wait between two steps on a page (ms). */
    minDelayMs: intRange(800, 30_000),
    maxDelayMs: intRange(1_000, 60_000),
    /** Scrolls per page before stopping. */
    maxScrolls: intRange(1, 40),
    /** Items (posts, ads, listings) per source in one run. */
    maxItemsPerRun: intRange(5, 500),
    /** Page loads and data requests per platform per hour. */
    maxRequestsPerHour: intRange(10, 2_000),
    /** Items per platform per day, across all runs. */
    maxItemsPerDay: intRange(20, 10_000),
    /** What was collected less than this many hours ago is reused instead of fetched again. */
    reuseWithinHours: intRange(0, 24 * 30),
  })
  .refine(v => v.minDelayMs <= v.maxDelayMs, {message: 'أقل انتظار لازم يكون أصغر من أكثر انتظار', path: ['minDelayMs']});
export type CollectionSettings = z.infer<typeof CollectionSettings>;

export const LocaleSettings = z.strictObject({
  /** English comes in Phase 8. */
  language: z.enum(['ar']),
  /** latn = 0–9 (default), arab = ٠–٩ */
  digits: z.enum(['latn', 'arab']),
  currency: z.enum(CURRENCIES),
});
export type LocaleSettings = z.infer<typeof LocaleSettings>;

export const SECTIONS = {collection: CollectionSettings, locale: LocaleSettings} as const;
export type SettingsSection = keyof typeof SECTIONS;

export interface Settings {
  collection: CollectionSettings;
  locale: LocaleSettings;
}

/** Conservative defaults: slow, small runs that look like a person browsing. */
export const DEFAULT_SETTINGS: Settings = {
  collection: {
    minDelayMs: 1_800,
    maxDelayMs: 4_200,
    maxScrolls: 6,
    maxItemsPerRun: 60,
    maxRequestsPerHour: 150,
    maxItemsPerDay: 600,
    reuseWithinHours: 12,
  },
  locale: {language: 'ar', digits: 'latn', currency: 'ILS'},
};

export class SettingsError extends Error {
  constructor(
    message: string,
    readonly issues: {path: (string | number)[]; message: string}[] = [],
  ) {
    super(message);
    this.name = 'SettingsError';
  }
}

const {settings} = schema;

function readSection<K extends SettingsSection>(key: K): Settings[K] {
  const row = getDb().select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return DEFAULT_SETTINGS[key];
  const merged = {...DEFAULT_SETTINGS[key], ...(row.value as object)};
  const parsed = SECTIONS[key].safeParse(merged);
  return parsed.success ? (parsed.data as Settings[K]) : DEFAULT_SETTINGS[key];
}

export function getSettings(): Settings {
  return {collection: readSection('collection'), locale: readSection('locale')};
}

/** Validates and saves part of one section. Throws SettingsError with an Arabic message on a bad value. */
export function updateSettings<K extends SettingsSection>(key: K, patch: Partial<Settings[K]>): Settings {
  if (!(key in SECTIONS)) throw new SettingsError(`قسم إعدادات غير معروف: ${String(key)}`);
  const merged = {...readSection(key), ...patch};
  const parsed = SECTIONS[key].safeParse(merged);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => ({path: i.path.map(p => (typeof p === 'symbol' ? String(p) : p)), message: i.message}));
    throw new SettingsError(issues.length === 1 ? issues[0]!.message : formatZodError(parsed.error), issues);
  }
  const now = new Date();
  getDb()
    .insert(settings)
    .values({key, value: parsed.data, updatedAt: now})
    .onConflictDoUpdate({target: settings.key, set: {value: parsed.data, updatedAt: now}})
    .run();
  emitEvent(null, 'settings.updated', {section: key});
  return getSettings();
}

export function resetSettings(key: SettingsSection): Settings {
  getDb().delete(settings).where(eq(settings.key, key)).run();
  emitEvent(null, 'settings.updated', {section: key});
  return getSettings();
}

// ── Bridge status ────────────────────────────────────────────────────────────
const BRIDGE_KEY = 'bridge.cli';

/** Called by the `rasd` CLI on every command, so Settings can show when a Claude session last used the bridge. */
export function recordBridgeActivity(command: string): void {
  const now = new Date();
  const value = {at: now.toISOString(), command};
  getDb()
    .insert(settings)
    .values({key: BRIDGE_KEY, value, updatedAt: now})
    .onConflictDoUpdate({target: settings.key, set: {value, updatedAt: now}})
    .run();
}

export interface BridgeStatus {
  cli: {lastSeenAt: string; command: string} | null;
  /** The local MCP server for the Claude desktop app arrives in Phase 3. */
  mcp: {available: boolean};
  /** Whether this repo has the /rasd-analyze command and how many module playbooks are installed. */
  analyzeCommand: boolean;
  playbooks: number;
}

export function getBridgeStatus(root = REPO_ROOT): BridgeStatus {
  const row = getDb().select().from(settings).where(eq(settings.key, BRIDGE_KEY)).get();
  const value = row?.value as {at?: unknown; command?: unknown} | undefined;
  const cli =
    value && typeof value.at === 'string' && typeof value.command === 'string'
      ? {lastSeenAt: value.at, command: value.command}
      : null;
  const skillsDir = join(root, '.claude', 'skills');
  const playbooks = existsSync(skillsDir)
    ? readdirSync(skillsDir).filter(name => name.startsWith('rasd-') && existsSync(join(skillsDir, name, 'SKILL.md'))).length
    : 0;
  return {
    cli,
    mcp: {available: false},
    analyzeCommand: existsSync(join(root, '.claude', 'commands', 'rasd-analyze.md')),
    playbooks,
  };
}
