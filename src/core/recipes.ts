/**
 * Analysis modules (§6.1) and study types as declarative recipes (§7).
 * Adding a new study type = adding an entry here + its texts in locales, with no new code path.
 * User-visible texts are not here: they are read from locales/<lang>/studies.json under the key types.<id>.
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

/** The one required input type for each study; everything else has a default value. */
export type RequiredInput =
  | 'accounts' // one or more account links
  | 'account_or_keyword' // an account, a product, or a keyword
  | 'product' // a product name
  | 'category' // a category + a region
  | 'own_and_competitors' // our account + the competitors
  | 'own_account' // our account
  | 'watchlist' // a watchlist
  | 'business_profile'; // the business profile

export interface Recipe {
  id: string;
  requiredInput: RequiredInput;
  modules: ModuleId[];
  /** Composite studies run other recipes and merge their findings. */
  composes?: string[];
  /** Shown as a featured card on the home page. */
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

/** The actual modules of a recipe, after expanding composite studies. */
export function resolveModules(id: string, seen = new Set<string>()): ModuleId[] {
  const recipe = getRecipe(id);
  if (!recipe || seen.has(id)) return [];
  seen.add(id);
  const composed = (recipe.composes ?? []).flatMap(child => resolveModules(child, seen));
  return uniq([...recipe.modules, ...composed]);
}
