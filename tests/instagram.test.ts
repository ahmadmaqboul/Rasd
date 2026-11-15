import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {classifyUrl} from '../src/collectors/browser';
import {normalizeHandle, parseOgDescription, parsePosts, parseProfile} from '../src/collectors/instagram';

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const legacy = fixture('instagram-web-profile-info.json');
const modern = fixture('instagram-timeline-graphql.json');

describe('parseProfile', () => {
  it('reads the legacy web_profile_info shape', () => {
    const profile = parseProfile(legacy, 'sample_store', new Date('2026-11-15T00:00:00Z'));
    expect(profile).toMatchObject({
      platform: 'ig',
      handle: 'sample_store',
      name: 'متجر العيّنة',
      followers: 18432,
      following: 211,
      postCount: 412,
      isPrivate: false,
      externalUrl: 'https://example.com/store',
      category: 'Shopping & retail',
      collectedAt: '2026-11-15T00:00:00.000Z',
    });
  });

  it('matches the handle case-insensitively and ignores related profiles', () => {
    expect(parseProfile(legacy, 'Sample_Store')?.handle).toBe('sample_store');
    expect(parseProfile(legacy, 'someone_else')).toBeNull();
  });

  it('returns null when the payload has no user', () => {
    expect(parseProfile({data: {}}, 'sample_store')).toBeNull();
  });
});

describe('parsePosts', () => {
  it('reads photos, reels and carousels from the legacy shape', () => {
    const posts = parsePosts(legacy, 'sample_store');
    expect(posts.map(p => p.id)).toEqual(['CaaaAAA111', 'CbbbBBB222', 'CcccCCC333']);
    expect(posts[0]).toMatchObject({kind: 'photo', likes: 412, comments: 57, views: null, url: 'https://www.instagram.com/p/CaaaAAA111/'});
    expect(posts[0]!.caption).toContain('شاحن 65 واط');
    expect(posts[1]).toMatchObject({kind: 'reel', likes: 530, views: 14200, url: 'https://www.instagram.com/reel/CbbbBBB222/'});
    expect(posts[2]).toMatchObject({kind: 'carousel', caption: ''});
    expect(posts[2]!.media).toHaveLength(2);
  });

  it('reads the newer like_count / taken_at shape and picks the largest image', () => {
    const posts = parsePosts(modern, 'sample_store');
    const photo = posts.find(p => p.id === 'DdddDDD444')!;
    expect(photo).toMatchObject({kind: 'photo', likes: 240, comments: 12, caption: 'وصل حديثاً: سماعات بلوتوث'});
    expect(photo.media[0]!.url).toBe('https://cdn.example.com/d_large.jpg');
    expect(posts.find(p => p.id === 'DeeeEEE555')).toMatchObject({kind: 'reel', views: 32000, caption: ''});
    expect(posts.find(p => p.id === 'DfffFFF666')!.media).toHaveLength(3);
  });

  it('drops posts that belong to another account (suggested content)', () => {
    expect(parsePosts(modern, 'sample_store').map(p => p.id)).not.toContain('ZzzzSuggested');
  });

  it('sorts newest first and converts timestamps to ISO', () => {
    const posts = parsePosts(modern, 'sample_store');
    expect(posts.map(p => p.id)).toEqual(['DeeeEEE555', 'DdddDDD444', 'DfffFFF666']);
    expect(posts[0]!.publishedAt).toBe(new Date(1794200000 * 1000).toISOString());
  });

  it('never throws on unexpected input', () => {
    expect(parsePosts(null, 'x')).toEqual([]);
    expect(parsePosts('<html>', 'x')).toEqual([]);
    expect(parsePosts({shortcode: 'abc'}, 'x')).toEqual([]);
  });
});

describe('DOM fallback helpers', () => {
  it('parses og:description counts, including K/M suffixes', () => {
    expect(parseOgDescription('1,234 Followers, 56 Following, 78 Posts - See Instagram photos')).toEqual({
      followers: 1234,
      following: 56,
      postCount: 78,
    });
    expect(parseOgDescription('12.5K Followers, 1 Following, 2M Posts')).toEqual({followers: 12500, following: 1, postCount: 2000000});
    expect(parseOgDescription('nothing here')).toEqual({followers: null, following: null, postCount: null});
  });

  it('normalizes handles from @names and URLs', () => {
    expect(normalizeHandle('@saedtel')).toBe('saedtel');
    expect(normalizeHandle('https://www.instagram.com/saed.tel/?hl=ar')).toBe('saed.tel');
    expect(normalizeHandle('  saedtel/ ')).toBe('saedtel');
  });
});

describe('classifyUrl', () => {
  it('detects login walls and security challenges without touching them', () => {
    expect(classifyUrl('https://www.instagram.com/accounts/login/?next=%2Fsaedtel%2F')).toBe('login_required');
    expect(classifyUrl('https://www.instagram.com/challenge/?next=/')).toBe('challenge');
    expect(classifyUrl('https://www.facebook.com/checkpoint/1501092823525282/')).toBe('challenge');
    expect(classifyUrl('https://www.facebook.com/login.php?next=x')).toBe('login_required');
    expect(classifyUrl('https://www.instagram.com/saedtel/')).toBeNull();
    expect(classifyUrl('https://www.facebook.com/ads/library/?q=x')).toBeNull();
  });
});
