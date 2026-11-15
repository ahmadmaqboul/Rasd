import {sql} from 'drizzle-orm';
import {index, integer, sqliteTable, text, uniqueIndex} from 'drizzle-orm/sqlite-core';

/**
 * مخطط Phase 0: الحد الأدنى لإثبات دورة الجسر (دراسة ← حزمة ← نتائج ← واجهة).
 * المخطط الكامل (§11: BusinessProfile, TrackedEntity, Post, Ad, …) يُبنى في Phase 1.
 */

export const STUDY_STATUSES = [
  'draft', // مسودة
  'collecting', // جاري الجمع
  'ready', // جاهز للتحليل
  'analyzing', // جاري التحليل
  'done', // مكتمل
  'partial', // جزئي
  'failed', // فشل
] as const;
export type StudyStatus = (typeof STUDY_STATUSES)[number];

export const studies = sqliteTable('studies', {
  id: integer('id').primaryKey({autoIncrement: true}),
  /** معرّف الوصفة (recipe) في src/core/recipes.ts */
  type: text('type').notNull(),
  title: text('title').notNull(),
  status: text('status').$type<StudyStatus>().notNull().default('draft'),
  params: text('params', {mode: 'json'}).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
  /** الوحدات التحليلية المطلوبة لهذه الدراسة (من الوصفة، قابلة للتعديل). */
  modules: text('modules', {mode: 'json'}).$type<string[]>().notNull().default(sql`'[]'`),
  /** بيانات تجريبية مولَّدة (ليست من منصة حقيقية) — تُعرض بوضوح في الواجهة والتقرير. */
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
    /** مفتاح ثابت داخل الوحدة: إعادة الكتابة بنفس المفتاح تحدّث النتيجة (استئناف بلا تكرار). */
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
 * سجل أحداث ملحق فقط. أي عملية (الخادم، CLI، MCP، العمّال) تكتب هنا،
 * والخادم يتابع السجل ويبثّه للواجهة عبر SSE — فلا نحتاج قناة بين العمليات.
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
