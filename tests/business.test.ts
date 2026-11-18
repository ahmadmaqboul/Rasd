import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {createStudy, getStudy} from '../src/core/bridge/core';
import {BusinessError, createProfile, deleteProfile, getProfile, listProfiles, parseAccount, updateProfile} from '../src/core/business';
import {closeDb, getDb, schema} from '../src/core/db/client';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rasd-business-'));
  process.env.RASD_DATA_DIR = dir;
  getDb();
});

afterAll(() => {
  closeDb();
  rmSync(dir, {recursive: true, force: true});
});

const issuesOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(BusinessError);
    return (error as BusinessError).issues;
  }
  throw new Error('expected a BusinessError');
};

describe('parseAccount', () => {
  it('understands profile links, @handles and store websites', () => {
    expect(parseAccount('https://www.instagram.com/SaedTel/?hl=ar')).toEqual({
      platform: 'instagram',
      handle: 'saedtel',
      url: 'https://www.instagram.com/saedtel/',
    });
    expect(parseAccount('@saedtel')).toMatchObject({platform: 'instagram', handle: 'saedtel'});
    expect(parseAccount('facebook.com/SaedTel')).toMatchObject({platform: 'facebook', handle: 'saedtel', url: 'https://www.facebook.com/saedtel'});
    expect(parseAccount('https://www.facebook.com/profile.php?id=1000123')).toMatchObject({
      platform: 'facebook',
      handle: '1000123',
      url: 'https://www.facebook.com/profile.php?id=1000123',
    });
    expect(parseAccount('https://www.tiktok.com/@shop.ps')).toMatchObject({platform: 'tiktok', handle: 'shop.ps'});
    expect(parseAccount('https://www.example-store.ps/ar/')).toEqual({
      platform: 'web',
      handle: 'example-store.ps/ar',
      url: 'https://www.example-store.ps/ar',
    });
  });

  it('refuses links that do not point at one account', () => {
    expect(parseAccount('https://www.instagram.com/p/C123abc/')).toBeUndefined();
    expect(parseAccount('https://www.facebook.com/ads/library/?q=charger')).toBeUndefined();
    expect(parseAccount('شاحن سامسونج')).toBeUndefined();
    expect(parseAccount('')).toBeUndefined();
  });
});

describe('business profiles', () => {
  it('creates the Saed Tel profile with products, its own accounts and competitors', () => {
    const profile = createProfile({
      name: 'سعد للاتصالات',
      category: 'إكسسوارات جوال',
      region: 'الضفة الغربية',
      products: [
        {name: 'شاحن 65 واط', ourPrice: 89, cost: 55},
        {name: 'كفر آيفون 15', ourPrice: 35},
      ],
      accounts: ['https://www.instagram.com/saedtel/', 'facebook.com/saedtel'],
      competitors: ['@competitor_one', 'https://www.example-store.ps/'],
    });
    expect(profile).toMatchObject({name: 'سعد للاتصالات', currency: 'ILS', audienceNotes: null, studyCount: 0});
    expect(profile.products.map(p => [p.name, p.ourPrice, p.cost])).toEqual([
      ['شاحن 65 واط', 89, 55],
      ['كفر آيفون 15', 35, null],
    ]);
    expect(profile.accounts.map(a => `${a.platform}:${a.handle}`)).toEqual(['instagram:saedtel', 'facebook:saedtel']);
    expect(profile.competitors.map(a => `${a.platform}:${a.handle}:${a.role}`)).toEqual([
      'instagram:competitor_one:competitor',
      'web:example-store.ps:competitor',
    ]);
    expect(listProfiles().map(p => p.id)).toEqual([profile.id]);
  });

  it('needs only a name; empty optional fields become null', () => {
    const profile = createProfile({name: 'متجر ثاني', category: '   ', region: ''});
    expect(profile).toMatchObject({category: null, region: null, products: [], accounts: [], competitors: []});
    deleteProfile(profile.id);
  });

  it('reports every problem with its field, in Arabic', () => {
    const issues = issuesOf(() =>
      createProfile({
        name: 'س',
        products: [{name: 'شاحن', ourPrice: -5}, {name: 'شاحن'}],
        accounts: ['https://www.instagram.com/p/C123/'],
        currency: 'XYZ',
      }),
    );
    expect(issues.map(i => i.path.join('.'))).toEqual(expect.arrayContaining(['name', 'products.0.ourPrice', 'currency']));
    expect(issues.find(i => i.path.join('.') === 'name')?.message).toBe('اكتب اسم البزنس');

    const second = issuesOf(() =>
      createProfile({name: 'متجر', products: [{name: 'شاحن'}, {name: 'شاحن'}], accounts: ['@a_shop', 'instagram.com/a_shop', 'https://www.instagram.com/p/X/']}),
    );
    expect(second.map(i => i.path.join('.'))).toEqual(['accounts.1', 'accounts.2', 'products.1.name']);
    expect(getDb().select().from(schema.businessProfiles).all()).toHaveLength(1); // nothing half-saved
  });

  it('keeps product ids when editing, adds new ones and removes deleted ones', () => {
    const [profile] = listProfiles();
    const charger = profile!.products[0]!;
    const updated = updateProfile(profile!.id, {
      name: 'سعد للاتصالات',
      products: [{id: charger.id, name: 'شاحن 65 واط أصلي', ourPrice: 85}, {name: 'باور بانك 20000'}],
      accounts: ['@saedtel'],
      competitors: [],
    });
    expect(updated.products.map(p => p.name)).toEqual(['شاحن 65 واط أصلي', 'باور بانك 20000']);
    expect(updated.products[0]!.id).toBe(charger.id);
    expect(updated.products[0]!.cost).toBeNull();
    expect(updated.accounts.map(a => a.handle)).toEqual(['saedtel']);
    expect(updated.competitors).toEqual([]);
    // the competitor entity itself is kept: data collected from it may still be used elsewhere
    expect(getDb().select().from(schema.trackedEntities).all().length).toBeGreaterThanOrEqual(3);
  });

  it('shares an entity between two profiles that track it', () => {
    const a = createProfile({name: 'متجر أ', competitors: ['@shared_rival']});
    const b = createProfile({name: 'متجر ب', competitors: ['instagram.com/Shared_Rival']});
    expect(a.competitors[0]!.entityId).toBe(b.competitors[0]!.entityId);
    deleteProfile(a.id);
    deleteProfile(b.id);
  });

  it('deleting a profile keeps its studies, unlinked', () => {
    const profile = createProfile({name: 'متجر للحذف'});
    const study = createStudy({type: 'account', title: 'دراسة'});
    getDb().update(schema.studies).set({profileId: profile.id}).run();
    expect(getProfile(profile.id).studyCount).toBe(1);
    deleteProfile(profile.id);
    expect(getStudy(study.id).profileId).toBeNull();
    expect(() => getProfile(profile.id)).toThrow(BusinessError);
  });
});
