import {and, asc, count, desc, eq, notInArray} from 'drizzle-orm';
import {z} from 'zod';
import {getDb, schema} from './db/client';
import {CURRENCIES, type EntityPlatform, type EntityRole} from './db/schema';
import {emitEvent} from './events';
import {suggestStudy} from './suggest';

/**
 * Business profiles (§4.5, §11): one per business — Saed Tel first. A profile holds the business's own products
 * (with its own price and optional cost) and the accounts it tracks: its own, and its competitors'.
 */

const {businessProfiles, businessProducts, trackedEntities, profileEntities, studies} = schema;

// ── Accounts typed by the user ───────────────────────────────────────────────
export interface ParsedAccount {
  platform: EntityPlatform;
  handle: string;
  url: string;
}

/**
 * Turns what the user pastes (a profile link, a page link, @handle, or a store's website) into a tracked entity.
 * Returns undefined when it cannot tell which account is meant (a post link, an Ad Library search, plain words).
 */
export function parseAccount(raw: string): ParsedAccount | undefined {
  const suggestion = suggestStudy(raw);
  if (!suggestion) return undefined;
  if (suggestion.reason === 'handle' || suggestion.reason === 'account_url') {
    const handle = suggestion.handle?.replace(/^@/, '').toLowerCase();
    if (!handle || !suggestion.platform || suggestion.platform === 'web') return undefined;
    const url =
      suggestion.platform === 'instagram'
        ? `https://www.instagram.com/${handle}/`
        : suggestion.platform === 'facebook'
          ? /^\d+$/.test(handle)
            ? `https://www.facebook.com/profile.php?id=${handle}`
            : `https://www.facebook.com/${handle}`
          : `https://www.tiktok.com/@${handle}`;
    return {platform: suggestion.platform, handle, url};
  }
  if (suggestion.reason === 'store_url') {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
    const url = new URL(withScheme);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = url.pathname.replace(/\/+$/, '');
    return {platform: 'web', handle: `${host}${path}`, url: `https://${url.hostname.toLowerCase()}${path || '/'}`};
  }
  return undefined;
}

// ── Input ────────────────────────────────────────────────────────────────────
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, {error: `النص أطول من ${max} حرف`})
    .optional()
    .nullable()
    .transform(v => (v ? v : null));

const money = z
  .number({error: 'لازم يكون رقم'})
  .min(0, {error: 'ما بصير يكون سالب'})
  .max(1_000_000, {error: 'رقم كبير كثير'})
  .optional()
  .nullable()
  .transform(v => v ?? null);

export const ProductInput = z.strictObject({
  /** Present when editing an existing product, so its id (and links to it) survive the save. */
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(2, {error: 'اكتب اسم المنتج'}).max(120, {error: 'الاسم طويل كثير'}),
  ourPrice: money,
  cost: money,
});

export const ProfileInput = z.strictObject({
  name: z.string().trim().min(2, {error: 'اكتب اسم البزنس'}).max(80, {error: 'الاسم طويل كثير'}),
  category: optionalText(80),
  region: optionalText(80),
  currency: z.enum(CURRENCIES, {error: 'عملة غير معروفة'}).default('ILS'),
  audienceNotes: optionalText(2000),
  products: z.array(ProductInput).max(200, {error: 'أكثر من 200 منتج'}).default([]),
  /** Links or @handles, as typed. */
  accounts: z.array(z.string().trim().min(1).max(300)).max(20, {error: 'أكثر من 20 حساب'}).default([]),
  competitors: z.array(z.string().trim().min(1).max(300)).max(50, {error: 'أكثر من 50 منافس'}).default([]),
});
export type ProfileInput = z.input<typeof ProfileInput>;

export interface Issue {
  path: (string | number)[];
  message: string;
}

export class BusinessError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'invalid',
    readonly issues: Issue[] = [],
  ) {
    super(message);
    this.name = 'BusinessError';
  }
}

interface Normalized {
  values: {name: string; category: string | null; region: string | null; currency: (typeof CURRENCIES)[number]; audienceNotes: string | null};
  products: z.output<typeof ProductInput>[];
  entities: (ParsedAccount & {role: EntityRole})[];
}

function normalize(raw: unknown): Normalized {
  const parsed = ProfileInput.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => ({path: i.path.map(p => (typeof p === 'symbol' ? String(p) : p)), message: i.message}));
    throw new BusinessError('في معلومات ناقصة أو غلط.', 'invalid', issues);
  }
  const input = parsed.data;
  const issues: Issue[] = [];
  const entities: Normalized['entities'] = [];
  const seen = new Set<string>();
  for (const [field, role] of [
    ['accounts', 'own'],
    ['competitors', 'competitor'],
  ] as const) {
    input[field].forEach((text, index) => {
      const account = parseAccount(text);
      if (!account) {
        issues.push({path: [field, index], message: 'ما قدرت أعرف الحساب من هالرابط. الصق رابط الحساب نفسه أو اكتب @الاسم.'});
        return;
      }
      const key = `${account.platform}:${account.handle}`;
      if (seen.has(key)) {
        issues.push({path: [field, index], message: 'هالحساب مكتوب أكثر من مرة.'});
        return;
      }
      seen.add(key);
      entities.push({...account, role});
    });
  }
  const names = new Set<string>();
  input.products.forEach((product, index) => {
    const key = product.name.toLowerCase();
    if (names.has(key)) issues.push({path: ['products', index, 'name'], message: 'هالمنتج مكتوب أكثر من مرة.'});
    names.add(key);
  });
  if (issues.length) throw new BusinessError('في معلومات ناقصة أو غلط.', 'invalid', issues);
  const {products, accounts: _a, competitors: _c, ...values} = input;
  return {values, products, entities};
}

// ── Reading ──────────────────────────────────────────────────────────────────
export interface ProfileAccount {
  entityId: number;
  platform: EntityPlatform;
  handle: string;
  url: string;
  role: EntityRole;
}

export interface ProfileView {
  id: number;
  name: string;
  category: string | null;
  region: string | null;
  currency: (typeof CURRENCIES)[number];
  audienceNotes: string | null;
  products: {id: number; name: string; ourPrice: number | null; cost: number | null}[];
  accounts: ProfileAccount[];
  competitors: ProfileAccount[];
  studyCount: number;
  createdAt: string;
  updatedAt: string;
}

export function getProfile(id: number): ProfileView {
  const db = getDb();
  const profile = db.select().from(businessProfiles).where(eq(businessProfiles.id, id)).get();
  if (!profile) throw new BusinessError('ما لقيت هالبزنس. يمكن انحذف.', 'not_found');
  const products = db
    .select({id: businessProducts.id, name: businessProducts.name, ourPrice: businessProducts.ourPrice, cost: businessProducts.cost})
    .from(businessProducts)
    .where(eq(businessProducts.profileId, id))
    .orderBy(asc(businessProducts.position), asc(businessProducts.id))
    .all();
  const linked = db
    .select({
      entityId: trackedEntities.id,
      platform: trackedEntities.platform,
      handle: trackedEntities.handle,
      url: trackedEntities.url,
      role: profileEntities.role,
    })
    .from(profileEntities)
    .innerJoin(trackedEntities, eq(trackedEntities.id, profileEntities.entityId))
    .where(eq(profileEntities.profileId, id))
    .orderBy(asc(profileEntities.position))
    .all();
  const studyCount = db.select({n: count()}).from(studies).where(eq(studies.profileId, id)).get()?.n ?? 0;
  return {
    id: profile.id,
    name: profile.name,
    category: profile.category,
    region: profile.region,
    currency: profile.currency,
    audienceNotes: profile.audienceNotes,
    products,
    accounts: linked.filter(a => a.role === 'own'),
    competitors: linked.filter(a => a.role !== 'own'),
    studyCount,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export function listProfiles(): ProfileView[] {
  return getDb()
    .select({id: businessProfiles.id})
    .from(businessProfiles)
    .orderBy(desc(businessProfiles.updatedAt))
    .all()
    .map(({id}) => getProfile(id));
}

// ── Writing ──────────────────────────────────────────────────────────────────
type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

function saveChildren(tx: Tx, profileId: number, data: Normalized, now: Date): void {
  // Products: update the ones that kept their id, add the new ones, delete the ones that were removed.
  const keptIds = data.products.map(p => p.id).filter((id): id is number => id !== undefined);
  tx.delete(businessProducts)
    .where(and(eq(businessProducts.profileId, profileId), keptIds.length ? notInArray(businessProducts.id, keptIds) : undefined))
    .run();
  data.products.forEach((product, position) => {
    const values = {name: product.name, ourPrice: product.ourPrice, cost: product.cost, position, updatedAt: now};
    const updated =
      product.id !== undefined
        ? tx
            .update(businessProducts)
            .set(values)
            .where(and(eq(businessProducts.id, product.id), eq(businessProducts.profileId, profileId)))
            .returning({id: businessProducts.id})
            .get()
        : undefined;
    if (!updated) tx.insert(businessProducts).values({...values, profileId, createdAt: now}).run();
  });

  // Accounts: entities are shared between profiles; the links say which profile tracks them and how.
  tx.delete(profileEntities).where(eq(profileEntities.profileId, profileId)).run();
  data.entities.forEach((entity, position) => {
    const row = tx
      .insert(trackedEntities)
      .values({platform: entity.platform, handle: entity.handle, url: entity.url, createdAt: now, updatedAt: now})
      .onConflictDoUpdate({target: [trackedEntities.platform, trackedEntities.handle], set: {url: entity.url, updatedAt: now}})
      .returning({id: trackedEntities.id})
      .get();
    tx.insert(profileEntities).values({profileId, entityId: row.id, role: entity.role, position, createdAt: now}).run();
  });
}

export function createProfile(raw: unknown): ProfileView {
  const data = normalize(raw);
  const now = new Date();
  const id = getDb().transaction(tx => {
    const row = tx
      .insert(businessProfiles)
      .values({...data.values, createdAt: now, updatedAt: now})
      .returning({id: businessProfiles.id})
      .get();
    saveChildren(tx, row.id, data, now);
    return row.id;
  });
  emitEvent(null, 'profile.saved', {profileId: id});
  return getProfile(id);
}

export function updateProfile(id: number, raw: unknown): ProfileView {
  getProfile(id);
  const data = normalize(raw);
  const now = new Date();
  getDb().transaction(tx => {
    tx.update(businessProfiles).set({...data.values, updatedAt: now}).where(eq(businessProfiles.id, id)).run();
    saveChildren(tx, id, data, now);
  });
  emitEvent(null, 'profile.saved', {profileId: id});
  return getProfile(id);
}

/** Deletes the profile, its products and its account links. Studies made for it are kept (unlinked). */
export function deleteProfile(id: number): void {
  getProfile(id);
  getDb().delete(businessProfiles).where(eq(businessProfiles.id, id)).run();
  emitEvent(null, 'profile.deleted', {profileId: id});
}
