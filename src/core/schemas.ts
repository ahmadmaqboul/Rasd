import {z} from 'zod';
import {MODULES} from './recipes';

/**
 * مخططات البيانات المشتركة بين الجامعات (collectors)، باني الحزمة، الجسر (CLI/MCP) والواجهة.
 * كل ما يكتبه جلسة Claude إلى رَصد يمرّ من هنا ويُرفض برسالة واضحة إن خالف المخطط.
 */

// ── معرّفات الأدلة ────────────────────────────────────────────────────────────
// الصيغة: <النوع>:<المنصة>:<المعرّف>  مثل post:ig:C8xYz  أو  ad:meta:1234567890
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

// ── البيانات المجموعة (الواجهة المشتركة للجامعات) ─────────────────────────────
export const CollectedMedia = z.object({
  type: z.enum(['image', 'video']),
  /** الرابط الأصلي على المنصة (قد تنتهي صلاحيته). */
  url: z.string().optional(),
  /** مسار الملف المحلي بعد التنزيل (مطلق). */
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
  /** عدد أيام التشغيل حتى تاريخ الجمع (أو حتى تاريخ الإيقاف). */
  daysRunning: z.number().nullable(),
  platforms: z.array(z.string()).default([]),
  /** عدد النسخ المتشابهة التي جمّعتها المكتبة تحت هذا الإعلان. */
  variants: z.number().nullable(),
  body: z.string().default(''),
  title: z.string().nullable(),
  cta: z.string().nullable(),
  linkUrl: z.string().nullable(),
  format: z.string().nullable(),
  media: z.array(CollectedMedia).default([]),
});
export type CollectedAd = z.infer<typeof CollectedAd>;

// ── الحزمة التحليلية ─────────────────────────────────────────────────────────
export const PackageIndexItem = z.object({
  kind: z.enum(EVIDENCE_KINDS),
  platform: z.enum(EVIDENCE_PLATFORMS),
  /** عنوان قصير يظهر مع الدليل في التقرير. */
  label: z.string(),
  url: z.string().nullable(),
  /** ملف البيانات (نسبي داخل الحزمة) الذي يحوي هذا العنصر. */
  dataFile: z.string(),
  /** صور محسّنة (نسبية داخل الحزمة) يمكن للجلسة أن «تراها». */
  media: z.array(z.string()).default([]),
});
export type PackageIndexItem = z.infer<typeof PackageIndexItem>;

export const PackageIndex = z.object({
  version: z.literal(1),
  studyId: z.number(),
  builtAt: z.string(),
  isDemo: z.boolean().default(false),
  /** لكل وحدة تحليل: ملفات البيانات التي تخصّها ومسار كتيّبها (playbook). */
  modules: z.record(z.string(), z.object({dataFiles: z.array(z.string()), playbook: z.string().nullable()})),
  items: z.record(EvidenceId, PackageIndexItem),
});
export type PackageIndex = z.infer<typeof PackageIndex>;

// ── النتائج (ما تكتبه جلسة Claude) ───────────────────────────────────────────
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

/** رسالة خطأ مقروءة من zod، سطر لكل مشكلة مع مسارها. */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map(issue => `- ${issue.path.length ? issue.path.join('.') : '(الجذر)'}: ${issue.message}`)
    .join('\n');
}
