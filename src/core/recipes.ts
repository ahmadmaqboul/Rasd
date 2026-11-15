/**
 * وحدات التحليل (§6.1) وأنواع الدراسات كوصفات تصريحية (§7).
 * إضافة نوع دراسة جديد = إضافة عنصر هنا + نصوصه في locales، بلا مسار كود جديد.
 * النصوص الظاهرة للمستخدم ليست هنا: تُقرأ من locales/<lang>/studies.json بالمفتاح types.<id>.
 */

export const MODULES = [
  'account_metrics',
  'posting_cadence',
  'top_content',
  'content_pillars',
  'hooks_captions',
  'visual_style',
  'ads_inventory',
  'ad_creative_analysis',
  'offers_pricing',
  'product_matching',
  'comment_sentiment',
  'competitor_discovery',
  'strategy_synthesis',
  'recommendations',
] as const;
export type ModuleId = (typeof MODULES)[number];

/** نوع المدخل المطلوب الوحيد لكل دراسة؛ كل ما عداه له قيمة افتراضية. */
export type RequiredInput =
  | 'accounts' // رابط حساب أو أكثر
  | 'account_or_keyword' // حساب، منتج، أو كلمة مفتاحية
  | 'product' // اسم منتج
  | 'category' // فئة + منطقة
  | 'own_and_competitors' // حسابنا + المنافسون
  | 'own_account' // حسابنا
  | 'watchlist' // قائمة مراقبة
  | 'business_profile'; // ملف البزنس

export interface Recipe {
  id: string;
  requiredInput: RequiredInput;
  modules: ModuleId[];
  /** دراسات مركّبة تشغّل وصفات أخرى وتدمج نتائجها. */
  composes?: string[];
  /** تظهر كبطاقة مميّزة في الرئيسية. */
  featured?: boolean;
}

const CONTENT_MODULES: ModuleId[] = ['content_pillars', 'top_content', 'hooks_captions', 'visual_style'];
const ACCOUNT_MODULES: ModuleId[] = [
  'account_metrics',
  'posting_cadence',
  'top_content',
  'hooks_captions',
  'comment_sentiment',
];
const ADS_MODULES: ModuleId[] = ['ads_inventory', 'ad_creative_analysis', 'offers_pricing'];

const uniq = <T,>(xs: T[]): T[] => [...new Set(xs)];

export const RECIPES: Recipe[] = [
  {id: 'full', requiredInput: 'business_profile', modules: [], composes: ['market', 'competitors', 'audit'], featured: true},
  {id: 'account', requiredInput: 'accounts', modules: ACCOUNT_MODULES},
  {id: 'content', requiredInput: 'accounts', modules: CONTENT_MODULES},
  {id: 'ads', requiredInput: 'account_or_keyword', modules: ADS_MODULES},
  {
    id: 'product',
    requiredInput: 'product',
    modules: [
      'competitor_discovery',
      'product_matching',
      'offers_pricing',
      'ads_inventory',
      'comment_sentiment',
      'recommendations',
    ],
  },
  {
    id: 'market',
    requiredInput: 'category',
    modules: [
      'competitor_discovery',
      'product_matching',
      'offers_pricing',
      'ads_inventory',
      'content_pillars',
      'strategy_synthesis',
    ],
  },
  {
    id: 'competitors',
    requiredInput: 'own_and_competitors',
    modules: uniq([...ACCOUNT_MODULES, ...CONTENT_MODULES, ...ADS_MODULES]),
  },
  {
    id: 'strategy',
    requiredInput: 'accounts',
    modules: uniq([...ACCOUNT_MODULES, ...CONTENT_MODULES, ...ADS_MODULES, 'strategy_synthesis']),
  },
  {
    id: 'audit',
    requiredInput: 'own_account',
    modules: uniq([...ACCOUNT_MODULES, ...CONTENT_MODULES, ...ADS_MODULES, 'strategy_synthesis', 'recommendations']),
  },
  {id: 'monitor', requiredInput: 'watchlist', modules: []},
];

export function getRecipe(id: string): Recipe | undefined {
  return RECIPES.find(r => r.id === id);
}

/** الوحدات الفعلية لوصفة، بعد فكّ الدراسات المركّبة. */
export function resolveModules(id: string, seen = new Set<string>()): ModuleId[] {
  const recipe = getRecipe(id);
  if (!recipe || seen.has(id)) return [];
  seen.add(id);
  const composed = (recipe.composes ?? []).flatMap(child => resolveModules(child, seen));
  return uniq([...recipe.modules, ...composed]);
}
