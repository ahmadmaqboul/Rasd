import {describe, expect, it} from 'vitest';
import {RECIPES, getRecipe, resolveModules} from '../src/core/recipes';
import {suggestStudy} from '../src/core/suggest';

describe('suggestStudy', () => {
  it('returns nothing for empty input', () => {
    expect(suggestStudy('')).toBeUndefined();
    expect(suggestStudy('   ')).toBeUndefined();
  });

  it('suggests an account study for Instagram profile URLs', () => {
    for (const input of ['https://www.instagram.com/saedtel/', 'instagram.com/saedtel', 'http://instagram.com/saedtel?hl=ar']) {
      expect(suggestStudy(input)).toMatchObject({recipeId: 'account', reason: 'account_url', platform: 'instagram', handle: 'saedtel'});
    }
  });

  it('treats @handles as Instagram accounts', () => {
    expect(suggestStudy('@saed.tel')).toMatchObject({recipeId: 'account', reason: 'handle', handle: 'saed.tel'});
  });

  it('does not invent a handle from a post or reel URL', () => {
    const suggestion = suggestStudy('https://www.instagram.com/reel/Cabc123/');
    expect(suggestion?.recipeId).toBe('account');
    expect(suggestion?.handle).toBeUndefined();
  });

  it('recognizes Facebook pages, profile.php ids and TikTok accounts', () => {
    expect(suggestStudy('https://www.facebook.com/SaedTel')).toMatchObject({platform: 'facebook', handle: 'SaedTel'});
    expect(suggestStudy('https://m.facebook.com/profile.php?id=1000123')).toMatchObject({platform: 'facebook', handle: '1000123'});
    expect(suggestStudy('https://www.tiktok.com/@saedtel')).toMatchObject({platform: 'tiktok', handle: 'saedtel'});
  });

  it('suggests an ads study for Ad Library links', () => {
    expect(suggestStudy('https://www.facebook.com/ads/library/?q=charger&country=ALL')).toMatchObject({
      recipeId: 'ads',
      reason: 'ad_library_url',
    });
  });

  it('suggests a product study for store URLs and for free text', () => {
    expect(suggestStudy('https://shop.example.com/products/charger-65w')).toMatchObject({recipeId: 'product', reason: 'store_url'});
    expect(suggestStudy('شاحن 65 واط سامسونج')).toMatchObject({recipeId: 'product', reason: 'free_text'});
    expect(suggestStudy('Anker 65W')).toMatchObject({recipeId: 'product', reason: 'free_text'});
  });

  it('keeps the original text as the value to prefill', () => {
    expect(suggestStudy('  شاحن 65 واط  ')?.value).toBe('شاحن 65 واط');
  });
});

describe('recipes', () => {
  it('declares the ten study types from the spec with unique ids', () => {
    const ids = RECIPES.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(['account', 'ads', 'audit', 'competitors', 'content', 'full', 'market', 'monitor', 'product', 'strategy']);
  });

  it('resolves composed studies into the union of their modules', () => {
    const full = resolveModules('full');
    for (const child of getRecipe('full')!.composes!) {
      for (const module of resolveModules(child)) expect(full).toContain(module);
    }
    expect(new Set(full).size).toBe(full.length);
  });

  it('only composes recipes that exist', () => {
    for (const recipe of RECIPES) for (const child of recipe.composes ?? []) expect(getRecipe(child)).toBeDefined();
  });
});
