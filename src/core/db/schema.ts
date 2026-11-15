import {sql} from 'drizzle-orm';
import {index, integer, sqliteTable, text, uniqueIndex} from 'drizzle-orm/sqlite-core';

/**
 * Phase 0 schema: the minimum needed to prove the bridge loop (study → package → findings → UI).
 * The full schema (§11: BusinessProfile, TrackedEntity, Post, Ad, …) is built in Phase 1.
 */

export const STUDY_STATUSES = [
  'draft', // draft
  'collecting', // collection in progress
  'ready', // ready for analysis
  'analyzing', // analysis in progress
  'done', // completed
  'partial', // partial
  'failed', // failed
] as const;
export type StudyStatus = (typeof STUDY_STATUSES)[number];

export const studies = sqliteTable('studies', {
  id: integer('id').primaryKey({autoIncrement: true}),
  /** The recipe ID in src/core/recipes.ts */
  type: text('type').notNull(),
  title: text('title').notNull(),
  status: text('status').$type<StudyStatus>().notNull().default('draft'),
  params: text('params', {mode: 'json'}).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
  /** The analysis modules requested for this study (from the recipe, editable). */
  modules: text('modules', {mode: 'json'}).$type<string[]>().notNull().default(sql`'[]'`),
  /** Generated demo data (not from a real platform) — shown clearly in the UI and the report. */
  isDemo: integer('is_demo', {mode: 'boolean'}).notNull().default(false),
  createdAt: integer('created_at', {mode: 'timestamp_ms'}).notNull(),
  updatedAt: integer('updated_at', {mode: 'timestamp_ms'}).notNull(),
});

export const findings = sqliteTable(
  'findings',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    studyId: integer('study_id')
      .notNull()
      .references(() => studies.id, {onDelete: 'cascade'}),
    module: text('module').notNull(),
    /** A stable key within the module: writing again with the same key updates the finding (resuming without duplication). */
    key: text('key').notNull(),
    title: text('title').notNull(),
    claim: text('claim').notNull(),
    why: text('why'),
    evidence: text('evidence', {mode: 'json'}).$type<string[]>().notNull(),
    confidence: text('confidence').$type<'low' | 'medium' | 'high'>().notNull(),
    data: text('data', {mode: 'json'}).$type<Record<string, unknown> | null>(),
    createdAt: integer('created_at', {mode: 'timestamp_ms'}).notNull(),
    updatedAt: integer('updated_at', {mode: 'timestamp_ms'}).notNull(),
  },
  t => [uniqueIndex('findings_study_module_key').on(t.studyId, t.module, t.key)],
);

/**
 * Append-only event log. Any process (the server, the CLI, MCP, the workers) writes here,
 * and the server follows the log and streams it to the UI over SSE — so we need no channel between processes.
 */
export const events = sqliteTable(
  'events',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    studyId: integer('study_id'),
    type: text('type').notNull(),
    payload: text('payload', {mode: 'json'}).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
    createdAt: integer('created_at', {mode: 'timestamp_ms'}).notNull(),
  },
  t => [index('events_study').on(t.studyId)],
);

export type StudyRow = typeof studies.$inferSelect;
export type FindingRow = typeof findings.$inferSelect;
export type EventRow = typeof events.$inferSelect;
