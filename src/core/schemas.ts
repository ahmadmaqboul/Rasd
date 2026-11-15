import {z} from 'zod';
import {MODULES} from './recipes';

/**
 * Data schemas shared between the collectors, the package builder, the bridge (CLI/MCP) and the UI. Everything the
 * Claude session writes to Rasd passes through here and is rejected with a clear message if it violates the schema.
 */

// ── Evidence IDs ─────────────────────────────────────────────────────────────
// Format: <kind>:<platform>:<id>  e.g. post:ig:C8xYz  or  ad:meta:1234567890
export const EVIDENCE_KINDS = ['post', 'ad', 'listing', 'profile', 'page', 'comments'] as const;
export const EVIDENCE_PLATFORMS = ['ig', 'fb', 'meta', 'tiktok', 'web', 'demo'] as const;

export const EvidenceId = z
  .string()
  .regex(
    new RegExp(`^(${EVIDENCE_KINDS.join('|')}):(${EVIDENCE_PLATFORMS.join('|')}):[A-Za-z0-9_.-]{1,120}$`),
    'صيغة معرّف الدليل: <النوع>:<المنصة>:<المعرّف> مثل post:ig:C8xYz',
  );
export type EvidenceId = z.infer<typeof EvidenceId>;

export function evidenceId(kind: (typeof EVIDENCE_KINDS)[number], platform: (typeof EVIDENCE_PLATFORMS)[number], id: string): EvidenceId {
  return EvidenceId.parse(`${kind}:${platform}:${id.replace(/[^A-Za-z0-9_.-]/g, '_')}`);
}

// ── Collected data (the collectors' shared interface) ─────────────────────────
export const CollectedMedia = z.object({
  type: z.enum(['image', 'video']),
  /** The original URL on the platform (it may expire). */
  url: z.string().optional(),
  /** Local file path after download (absolute). */
  file: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  durationSec: z.number().optional(),
  alt: z.string().optional(),
});
export type CollectedMedia = z.infer<typeof CollectedMedia>;

export const CollectedPost = z.object({
  id: z.string(),
  platform: z.enum(EVIDENCE_PLATFORMS),
  url: z.string(),
  accountHandle: z.string(),
  kind: z.enum(['photo', 'reel', 'carousel', 'video']),
  caption: z.string().default(''),
  publishedAt: z.string().nullable(),
  likes: z.number().nullable(),
  comments: z.number().nullable(),
  views: z.number().nullable(),
  media: z.array(CollectedMedia).default([]),
});
export type CollectedPost = z.infer<typeof CollectedPost>;

export const CollectedProfile = z.object({
  platform: z.enum(EVIDENCE_PLATFORMS),
  handle: z.string(),
  url: z.string(),
  name: z.string().nullable(),
  bio: z.string().nullable(),
  followers: z.number().nullable(),
  following: z.number().nullable(),
  postCount: z.number().nullable(),
  isPrivate: z.boolean().nullable(),
  isVerified: z.boolean().nullable(),
  externalUrl: z.string().nullable(),
  category: z.string().nullable(),
  collectedAt: z.string(),
});
export type CollectedProfile = z.infer<typeof CollectedProfile>;

export const CollectedAd = z.object({
  id: z.string(),
  platform: z.literal('meta'),
  url: z.string(),
  pageId: z.string().nullable(),
  pageName: z.string().nullable(),
  isActive: z.boolean().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  /** Number of days running up to the collection date (or up to the stop date). */
  daysRunning: z.number().nullable(),
  platforms: z.array(z.string()).default([]),
  /** Number of similar versions the library grouped under this ad. */
  variants: z.number().nullable(),
  body: z.string().default(''),
  title: z.string().nullable(),
  cta: z.string().nullable(),
  linkUrl: z.string().nullable(),
  format: z.string().nullable(),
  media: z.array(CollectedMedia).default([]),
});
export type CollectedAd = z.infer<typeof CollectedAd>;

// ── Analysis package ─────────────────────────────────────────────────────────
export const PackageIndexItem = z.object({
  kind: z.enum(EVIDENCE_KINDS),
  platform: z.enum(EVIDENCE_PLATFORMS),
  /** A short title shown with the evidence in the report. */
  label: z.string(),
  url: z.string().nullable(),
  /** The data file (relative, inside the package) that contains this item. */
  dataFile: z.string(),
  /** Optimized images (relative, inside the package) that the session can "see". */
  media: z.array(z.string()).default([]),
});
export type PackageIndexItem = z.infer<typeof PackageIndexItem>;

export const PackageIndex = z.object({
  version: z.literal(1),
  studyId: z.number(),
  builtAt: z.string(),
  isDemo: z.boolean().default(false),
  /** For each analysis module: the data files that belong to it and the path of its playbook. */
  modules: z.record(z.string(), z.object({dataFiles: z.array(z.string()), playbook: z.string().nullable()})),
  items: z.record(EvidenceId, PackageIndexItem),
});
export type PackageIndex = z.infer<typeof PackageIndex>;

// ── Findings (what the Claude session writes) ────────────────────────────────
export const CONFIDENCE = ['low', 'medium', 'high'] as const;

export const FindingInput = z.strictObject({
  module: z.enum(MODULES, {error: `الوحدة يجب أن تكون واحدة من: ${MODULES.join(', ')}`}),
  key: z
    .string()
    .regex(/^[a-z0-9][a-z0-9_.-]{0,79}$/, 'المفتاح: أحرف لاتينية صغيرة وأرقام و _ . - (حتى 80 حرفاً)، ثابت لكل نتيجة حتى يعمل الاستئناف'),
  title: z.string().trim().min(3, 'العنوان قصير جداً').max(160),
  claim: z.string().trim().min(10, 'اكتب الخلاصة بجملة واضحة على الأقل').max(2000),
  why: z.string().trim().max(2000).optional(),
  evidence: z.array(EvidenceId).min(1, 'كل نتيجة تحتاج دليلاً واحداً على الأقل').max(40),
  confidence: z.enum(CONFIDENCE, {error: 'الثقة: low أو medium أو high'}),
  data: z.record(z.string(), z.unknown()).optional(),
});
export type FindingInput = z.infer<typeof FindingInput>;

/** A readable error message from zod, one line per issue with its path. */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map(issue => `- ${issue.path.length ? issue.path.join('.') : '(الجذر)'}: ${issue.message}`)
    .join('\n');
}
