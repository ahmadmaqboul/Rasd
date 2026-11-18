import {sql} from 'drizzle-orm';
import {index, integer, primaryKey, real, sqliteTable, text, uniqueIndex, type AnySQLiteColumn} from 'drizzle-orm/sqlite-core';

/**
 * Rasd's data model (build prompt §11). Everything is local SQLite.
 *
 * Sections:
 *   business   — business profiles, their own products, and the accounts they track (own / competitor / seller)
 *   collected  — what collectors store: snapshots, posts, media, comment samples, ads, market products and prices
 *   studies    — studies, their runs, findings, reports, templates
 *   monitoring — monitors and alerts (Phase 6)
 *   platform   — browser sessions, request usage (for limits), settings, jobs, the event log
 *
 * Conventions: timestamps are `timestamp_ms` integers; JSON columns hold small structured values only;
 * prices are REAL in the currency stated next to them. Privacy (§5.4): no table stores a commenter's name,
 * handle, id or profile — comment samples keep the text only.
 */

const createdAt = () => integer('created_at', {mode: 'timestamp_ms'}).notNull();
const updatedAt = () => integer('updated_at', {mode: 'timestamp_ms'}).notNull();

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

// ── Business ─────────────────────────────────────────────────────────────────
export const CURRENCIES = ['ILS', 'JOD', 'USD', 'EUR'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const businessProfiles = sqliteTable('business_profiles', {
  id: integer('id').primaryKey({autoIncrement: true}),
  name: text('name').notNull(),
  category: text('category'),
  region: text('region'),
  currency: text('currency').$type<Currency>().notNull().default('ILS'),
  audienceNotes: text('audience_notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** The business's own products, with its own price and (optionally) cost — used by "best product to promote". */
export const businessProducts = sqliteTable(
  'business_products',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    profileId: integer('profile_id')
      .notNull()
      .references(() => businessProfiles.id, {onDelete: 'cascade'}),
    name: text('name').notNull(),
    ourPrice: real('our_price'),
    cost: real('cost'),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [index('business_products_profile').on(t.profileId)],
);

export const ENTITY_PLATFORMS = ['instagram', 'facebook', 'tiktok', 'web'] as const;
export type EntityPlatform = (typeof ENTITY_PLATFORMS)[number];

/** Something Rasd can collect from: an account, a page or a store. Shared by every profile that tracks it. */
export const trackedEntities = sqliteTable(
  'tracked_entities',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    platform: text('platform').$type<EntityPlatform>().notNull(),
    /** Normalized handle (lowercase, no @) for social platforms; the host + path for web stores. */
    handle: text('handle').notNull(),
    url: text('url').notNull(),
    displayName: text('display_name'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [uniqueIndex('tracked_entities_platform_handle').on(t.platform, t.handle)],
);

export const ENTITY_ROLES = ['own', 'competitor', 'seller'] as const;
export type EntityRole = (typeof ENTITY_ROLES)[number];

/** Which entities a profile tracks, and in what role. "Our accounts" are the rows with role = own. */
export const profileEntities = sqliteTable(
  'profile_entities',
  {
    profileId: integer('profile_id')
      .notNull()
      .references(() => businessProfiles.id, {onDelete: 'cascade'}),
    entityId: integer('entity_id')
      .notNull()
      .references(() => trackedEntities.id, {onDelete: 'cascade'}),
    role: text('role').$type<EntityRole>().notNull(),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  t => [primaryKey({columns: [t.profileId, t.entityId]}), index('profile_entities_entity').on(t.entityId)],
);

// ── Collected data ───────────────────────────────────────────────────────────
/** An entity's public numbers at one moment; growth is computed from consecutive snapshots. */
export const snapshots = sqliteTable(
  'snapshots',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    entityId: integer('entity_id')
      .notNull()
      .references(() => trackedEntities.id, {onDelete: 'cascade'}),
    runId: integer('run_id').references((): AnySQLiteColumn => studyRuns.id, {onDelete: 'set null'}),
    takenAt: integer('taken_at', {mode: 'timestamp_ms'}).notNull(),
    followers: integer('followers'),
    following: integer('following'),
    postCount: integer('post_count'),
    /** Other profile fields at that moment (bio, category, verified, external link…). */
    data: text('data', {mode: 'json'}).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
  },
  t => [index('snapshots_entity_taken').on(t.entityId, t.takenAt)],
);

export const POST_KINDS = ['photo', 'video', 'reel', 'carousel', 'story', 'text'] as const;
export type PostKind = (typeof POST_KINDS)[number];

export const posts = sqliteTable(
  'posts',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    entityId: integer('entity_id')
      .notNull()
      .references(() => trackedEntities.id, {onDelete: 'cascade'}),
    platform: text('platform').$type<EntityPlatform>().notNull(),
    /** The platform's own id (shortcode on Instagram). Unique per platform. */
    externalId: text('external_id').notNull(),
    url: text('url').notNull(),
    kind: text('kind').$type<PostKind>().notNull(),
    caption: text('caption'),
    publishedAt: integer('published_at', {mode: 'timestamp_ms'}),
    likes: integer('likes'),
    comments: integer('comments'),
    views: integer('views'),
    shares: integer('shares'),
    data: text('data', {mode: 'json'}).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
    firstSeenAt: integer('first_seen_at', {mode: 'timestamp_ms'}).notNull(),
    lastSeenAt: integer('last_seen_at', {mode: 'timestamp_ms'}).notNull(),
  },
  t => [
    uniqueIndex('posts_platform_external').on(t.platform, t.externalId),
    index('posts_entity_published').on(t.entityId, t.publishedAt),
  ],
);

/** Comment text only (§5.4): no author name, handle, id or avatar — not even hashed. */
export const commentSamples = sqliteTable(
  'comment_samples',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    postId: integer('post_id')
      .notNull()
      .references(() => posts.id, {onDelete: 'cascade'}),
    text: text('text').notNull(),
    /** sha256 of the normalized text, to avoid storing the same comment twice. */
    textHash: text('text_hash').notNull(),
    publishedAt: integer('published_at', {mode: 'timestamp_ms'}),
    likes: integer('likes'),
    isReply: integer('is_reply', {mode: 'boolean'}).notNull().default(false),
    collectedAt: integer('collected_at', {mode: 'timestamp_ms'}).notNull(),
  },
  t => [uniqueIndex('comment_samples_post_hash').on(t.postId, t.textHash)],
);

export const ads = sqliteTable(
  'ads',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    /** The advertiser's page, when it is a tracked entity. */
    entityId: integer('entity_id').references(() => trackedEntities.id, {onDelete: 'set null'}),
    platform: text('platform').$type<'meta'>().notNull().default('meta'),
    /** The Ad Library id (ad_archive_id). */
    libraryId: text('library_id').notNull(),
    pageName: text('page_name'),
    pageExternalId: text('page_external_id'),
    isActive: integer('is_active', {mode: 'boolean'}),
    startedAt: integer('started_at', {mode: 'timestamp_ms'}),
    endedAt: integer('ended_at', {mode: 'timestamp_ms'}),
    /** Where it runs: facebook, instagram, messenger, audience_network… */
    publisherPlatforms: text('publisher_platforms', {mode: 'json'}).$type<string[]>().notNull().default(sql`'[]'`),
    variantCount: integer('variant_count').notNull().default(1),
    url: text('url'),
    data: text('data', {mode: 'json'}).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
    firstSeenAt: integer('first_seen_at', {mode: 'timestamp_ms'}).notNull(),
    lastSeenAt: integer('last_seen_at', {mode: 'timestamp_ms'}).notNull(),
  },
  t => [uniqueIndex('ads_platform_library').on(t.platform, t.libraryId), index('ads_entity').on(t.entityId)],
);

export const adVariants = sqliteTable(
  'ad_variants',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    adId: integer('ad_id')
      .notNull()
      .references(() => ads.id, {onDelete: 'cascade'}),
    position: integer('position').notNull().default(0),
    body: text('body'),
    title: text('title'),
    cta: text('cta'),
    linkUrl: text('link_url'),
    data: text('data', {mode: 'json'}).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
  },
  t => [uniqueIndex('ad_variants_ad_position').on(t.adId, t.position)],
);

/** A normalized market product ("شاحن سامسونج 65 واط"), matched across sellers by product_matching. */
export const products = sqliteTable(
  'products',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    brand: text('brand'),
    category: text('category'),
    /** Set when this market product is one of the business's own products. */
    businessProductId: integer('business_product_id').references(() => businessProducts.id, {onDelete: 'set null'}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  t => [uniqueIndex('products_normalized').on(t.normalizedName)],
);

export const LISTING_SOURCES = ['post', 'ad', 'store'] as const;

/** One place a product is offered: a post, an ad or a store page. */
export const productListings = sqliteTable(
  'product_listings',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    productId: integer('product_id').references(() => products.id, {onDelete: 'set null'}),
    entityId: integer('entity_id').references(() => trackedEntities.id, {onDelete: 'set null'}),
    sourceType: text('source_type').$type<(typeof LISTING_SOURCES)[number]>().notNull(),
    /** Evidence id of the source (post:ig:…, ad:meta:…, listing:web:…). */
    sourceRef: text('source_ref').notNull(),
    title: text('title').notNull(),
    url: text('url'),
    createdAt: createdAt(),
  },
  t => [uniqueIndex('product_listings_source').on(t.sourceRef, t.title), index('product_listings_product').on(t.productId)],
);

export const pricePoints = sqliteTable(
  'price_points',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    listingId: integer('listing_id')
      .notNull()
      .references(() => productListings.id, {onDelete: 'cascade'}),
    price: real('price').notNull(),
    originalPrice: real('original_price'),
    currency: text('currency').notNull(),
    availability: text('availability').$type<'in_stock' | 'out_of_stock' | 'unknown'>().notNull().default('unknown'),
    observedAt: integer('observed_at', {mode: 'timestamp_ms'}).notNull(),
  },
  t => [index('price_points_listing_observed').on(t.listingId, t.observedAt)],
);

/** Images, videos and screenshots stored under data/media. Exactly one owner column is set. */
export const media = sqliteTable(
  'media',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    postId: integer('post_id').references(() => posts.id, {onDelete: 'cascade'}),
    adVariantId: integer('ad_variant_id').references(() => adVariants.id, {onDelete: 'cascade'}),
    listingId: integer('listing_id').references(() => productListings.id, {onDelete: 'cascade'}),
    type: text('type').$type<'image' | 'video' | 'screenshot'>().notNull(),
    position: integer('position').notNull().default(0),
    /** Path relative to data/media. */
    file: text('file').notNull(),
    width: integer('width'),
    height: integer('height'),
    durationMs: integer('duration_ms'),
    sha256: text('sha256'),
    createdAt: createdAt(),
  },
  t => [index('media_post').on(t.postId), index('media_ad_variant').on(t.adVariantId), index('media_listing').on(t.listingId)],
);

// ── Studies ──────────────────────────────────────────────────────────────────
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
  profileId: integer('profile_id').references((): AnySQLiteColumn => businessProfiles.id, {onDelete: 'set null'}),
  templateId: integer('template_id').references((): AnySQLiteColumn => templates.id, {onDelete: 'set null'}),
  createdAt: integer('created_at', {mode: 'timestamp_ms'}).notNull(),
  updatedAt: integer('updated_at', {mode: 'timestamp_ms'}).notNull(),
});

/**
 * One attempt at collecting and packaging a study. A study keeps the latest status; its runs keep the history
 * (a failed collection, then a retry). Re-running a template later creates a new study, so "compare with last
 * time" compares two studies made from the same template.
 */
export const studyRuns = sqliteTable(
  'study_runs',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    studyId: integer('study_id')
      .notNull()
      .references((): AnySQLiteColumn => studies.id, {onDelete: 'cascade'}),
    status: text('status').$type<StudyStatus>().notNull().default('collecting'),
    /** Collection progress per source: {steps: [{key, status, done, total, message}]}. */
    progress: text('progress', {mode: 'json'}).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
    /** Relative to the data folder (studies/<id>/package). */
    packagePath: text('package_path'),
    error: text('error'),
    startedAt: integer('started_at', {mode: 'timestamp_ms'}).notNull(),
    finishedAt: integer('finished_at', {mode: 'timestamp_ms'}),
  },
  t => [index('study_runs_study').on(t.studyId)],
);

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

/** The report as structured JSON (sections → finding keys, recommendations, 30-day plan). The app renders it. */
export const reports = sqliteTable('reports', {
  id: integer('id').primaryKey({autoIncrement: true}),
  studyId: integer('study_id')
    .notNull()
    .unique()
    .references(() => studies.id, {onDelete: 'cascade'}),
  data: text('data', {mode: 'json'}).$type<Record<string, unknown>>().notNull(),
  /** Answers from "احكي مع التقرير" that the user chose to keep. */
  notes: text('notes', {mode: 'json'}).$type<Array<Record<string, unknown>>>().notNull().default(sql`'[]'`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A saved study configuration, rerunnable in one click. */
export const templates = sqliteTable('templates', {
  id: integer('id').primaryKey({autoIncrement: true}),
  name: text('name').notNull(),
  recipeId: text('recipe_id').notNull(),
  profileId: integer('profile_id').references(() => businessProfiles.id, {onDelete: 'set null'}),
  params: text('params', {mode: 'json'}).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
  modules: text('modules', {mode: 'json'}).$type<string[]>().notNull().default(sql`'[]'`),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ── Monitoring (Phase 6) ─────────────────────────────────────────────────────
export const monitors = sqliteTable('monitors', {
  id: integer('id').primaryKey({autoIncrement: true}),
  name: text('name').notNull(),
  profileId: integer('profile_id').references(() => businessProfiles.id, {onDelete: 'cascade'}),
  templateId: integer('template_id').references(() => templates.id, {onDelete: 'set null'}),
  /** e.g. {every: 'day', at: '09:00'} — interpreted by the scheduler. */
  schedule: text('schedule', {mode: 'json'}).$type<Record<string, unknown>>().notNull(),
  /** Which changes raise an alert: new ads, price changes, viral posts, new competitors. */
  triggers: text('triggers', {mode: 'json'}).$type<string[]>().notNull().default(sql`'[]'`),
  enabled: integer('enabled', {mode: 'boolean'}).notNull().default(true),
  lastRunAt: integer('last_run_at', {mode: 'timestamp_ms'}),
  nextRunAt: integer('next_run_at', {mode: 'timestamp_ms'}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const alerts = sqliteTable(
  'alerts',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    monitorId: integer('monitor_id')
      .notNull()
      .references(() => monitors.id, {onDelete: 'cascade'}),
    type: text('type').notNull(),
    title: text('title').notNull(),
    payload: text('payload', {mode: 'json'}).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
    evidence: text('evidence', {mode: 'json'}).$type<string[]>().notNull().default(sql`'[]'`),
    readAt: integer('read_at', {mode: 'timestamp_ms'}),
    createdAt: createdAt(),
  },
  t => [index('alerts_monitor').on(t.monitorId)],
);

// ── Platform ─────────────────────────────────────────────────────────────────
export const SESSION_PLATFORMS = ['instagram', 'facebook'] as const;
export type SessionPlatformId = (typeof SESSION_PLATFORMS)[number];

export const SESSION_STATUSES = [
  'missing', // no login yet
  'valid', // logged in, last check passed
  'expired', // the platform asks to log in again
  'challenged', // the platform shows a security check; the user must resolve it in the visible window
  'unknown', // logged in once, never checked (or the check could not reach the platform)
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** One logged-in browser profile per platform (data/sessions/<platform>). The cookies stay in that folder. */
export const platformSessions = sqliteTable('platform_sessions', {
  platform: text('platform').$type<SessionPlatformId>().primaryKey(),
  status: text('status').$type<SessionStatus>().notNull().default('missing'),
  /** A nickname the user gives the account ("حساب الجمع"). Not read from the platform. */
  label: text('label'),
  lastLoginAt: integer('last_login_at', {mode: 'timestamp_ms'}),
  lastCheckedAt: integer('last_checked_at', {mode: 'timestamp_ms'}),
  /** When the platform's login cookie expires, if it says. */
  expiresAt: integer('expires_at', {mode: 'timestamp_ms'}),
  /** The last problem, in Arabic, as shown to the user. */
  message: text('message'),
  updatedAt: updatedAt(),
});

/** Requests and items per platform per hour — what the collection limits are checked against. */
export const sessionUsage = sqliteTable(
  'session_usage',
  {
    platform: text('platform').notNull(),
    /** Start of the hour (ms). */
    hour: integer('hour').notNull(),
    requests: integer('requests').notNull().default(0),
    items: integer('items').notNull().default(0),
  },
  t => [primaryKey({columns: [t.platform, t.hour]})],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', {mode: 'json'}).$type<unknown>().notNull(),
  updatedAt: updatedAt(),
});

export const JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface JobProgress {
  /** i18n key of the current step (jobs:steps.*). */
  step?: string;
  done?: number;
  total?: number;
  /** Arabic detail shown under the step, e.g. a count or the account being read. */
  detail?: string;
}

/** Background work run by the server's worker: logins, session checks, collection, packaging. */
export const jobs = sqliteTable(
  'jobs',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    type: text('type').notNull(),
    status: text('status').$type<JobStatus>().notNull().default('queued'),
    payload: text('payload', {mode: 'json'}).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
    progress: text('progress', {mode: 'json'}).$type<JobProgress>().notNull().default(sql`'{}'`),
    result: text('result', {mode: 'json'}).$type<Record<string, unknown> | null>(),
    /** Arabic, shown as-is. */
    error: text('error'),
    errorCode: text('error_code'),
    studyId: integer('study_id').references(() => studies.id, {onDelete: 'set null'}),
    /** Jobs with the same lane never run at the same time (one browser profile per platform). */
    lane: text('lane').notNull().default('default'),
    cancelRequested: integer('cancel_requested', {mode: 'boolean'}).notNull().default(false),
    createdAt: createdAt(),
    startedAt: integer('started_at', {mode: 'timestamp_ms'}),
    finishedAt: integer('finished_at', {mode: 'timestamp_ms'}),
    /** Updated while running; a running job with an old heartbeat belongs to a worker that died. */
    heartbeatAt: integer('heartbeat_at', {mode: 'timestamp_ms'}),
  },
  t => [index('jobs_status').on(t.status, t.id)],
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
export type StudyRunRow = typeof studyRuns.$inferSelect;
export type FindingRow = typeof findings.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type BusinessProfileRow = typeof businessProfiles.$inferSelect;
export type BusinessProductRow = typeof businessProducts.$inferSelect;
export type TrackedEntityRow = typeof trackedEntities.$inferSelect;
export type PlatformSessionRow = typeof platformSessions.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;
export type TemplateRow = typeof templates.$inferSelect;
