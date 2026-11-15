import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  BridgeError,
  addFinding,
  createStudy,
  eventsAfter,
  getBrief,
  getModuleData,
  getPackageIndex,
  lastEventId,
  listFindings,
  setStudyStatus,
} from '../src/core/bridge/core';
import {CHUNK_SIZE, buildPackage} from '../src/core/bridge/package';
import {closeDb} from '../src/core/db/client';
import {resolveInside} from '../src/core/paths';
import type {CollectedPost} from '../src/core/schemas';

let dir: string;
let studyId: number;

const post = (n: number, file?: string): CollectedPost => ({
  id: `p${n}`,
  platform: 'ig',
  url: `https://www.instagram.com/p/p${n}/`,
  accountHandle: 'sample_store',
  kind: 'photo',
  caption: `منشور رقم ${n}\nسطر ثانٍ`,
  publishedAt: new Date(Date.UTC(2026, 10, n)).toISOString(),
  likes: n * 10,
  comments: n,
  views: null,
  media: file ? [{type: 'image', file}] : [],
});

const finding = (overrides: Record<string, unknown> = {}) => ({
  module: 'top_content',
  key: 'best-1',
  title: 'عنوان واضح للنتيجة',
  claim: 'خلاصة مكتوبة بجملة واضحة ومفيدة.',
  why: 'الأرقام التي بُني عليها الحكم.',
  evidence: ['post:ig:p1'],
  confidence: 'medium',
  ...overrides,
});

const expectBridgeError = (fn: () => unknown, code: BridgeError['code'], text?: RegExp) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(BridgeError);
    expect((error as BridgeError).code).toBe(code);
    if (text) expect((error as BridgeError).message).toMatch(text);
    return;
  }
  throw new Error('expected a BridgeError');
};

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'rasd-test-'));
  process.env.RASD_DATA_DIR = dir;

  const big = join(dir, 'big.png');
  await sharp({create: {width: 2400, height: 3000, channels: 3, background: '#c1121f'}}).png().toFile(big);
  const broken = join(dir, 'broken.png');
  writeFileSync(broken, 'not an image');

  const study = createStudy({type: 'content', title: 'اختبار', modules: ['top_content', 'visual_style'], status: 'collecting'});
  studyId = study.id;
  const posts = Array.from({length: CHUNK_SIZE + 3}, (_, i) => post(i + 1, i === 0 ? big : i === 1 ? broken : undefined));
  await buildPackage({studyId, posts});
  setStudyStatus(studyId, 'ready');
});

afterAll(() => {
  closeDb();
  rmSync(dir, {recursive: true, force: true});
  delete process.env.RASD_DATA_DIR;
});

describe('analysis package', () => {
  it('chunks posts so no data file exceeds the batch size', () => {
    const index = getPackageIndex(studyId);
    expect(index.modules.top_content!.dataFiles).toEqual(['data/posts-001.json', 'data/posts-002.json']);
    const data = getModuleData(studyId, 'top_content');
    expect((data.files[0]!.content as unknown[]).length).toBe(CHUNK_SIZE);
    expect((data.files[1]!.content as unknown[]).length).toBe(3);
  });

  it('indexes every item under a stable evidence id', () => {
    const index = getPackageIndex(studyId);
    expect(Object.keys(index.items)).toHaveLength(CHUNK_SIZE + 3);
    expect(index.items['post:ig:p1']).toMatchObject({kind: 'post', label: 'منشور رقم 1', dataFile: 'data/posts-001.json'});
  });

  it('downsizes images and survives a corrupt one', async () => {
    const index = getPackageIndex(studyId);
    const [image] = index.items['post:ig:p1']!.media;
    expect(image).toBe('media/post_ig_p1_1.jpg');
    const meta = await sharp(resolveInside(getModuleData(studyId, 'top_content').packageDir, image!)).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(1024);
    expect(index.items['post:ig:p2']!.media).toEqual([]);
  });

  it('strips local file paths and CDN urls from what the session reads', () => {
    const data = getModuleData(studyId, 'top_content');
    const text = JSON.stringify(data.files.map(f => f.content));
    expect(text).not.toContain(dir);
    expect(text).not.toContain('"media"');
  });

  it('writes a brief that names the modules and the commands to run', () => {
    const brief = getBrief(studyId);
    expect(brief).toContain('`top_content`');
    expect(brief).toContain(`node bin/rasd.mjs finding add ${studyId}`);
    expect(brief).toContain('.claude/skills/rasd-top-content/SKILL.md');
  });

  it('rejects module names outside the study and path traversal', () => {
    expectBridgeError(() => getModuleData(studyId, 'ads_inventory'), 'invalid', /ليست ضمن هذه الدراسة/);
    expectBridgeError(() => getModuleData(studyId, 'nope'), 'invalid', /وحدة غير معروفة/);
    expect(() => resolveInside(dir, '../outside.txt')).toThrow();
    expect(() => resolveInside(dir, 'studies/../../x')).toThrow();
  });
});

describe('writing findings', () => {
  it('refuses to write before the session marks the study as analyzing', () => {
    expectBridgeError(() => addFinding(studyId, finding()), 'bad_status', /analyzing/);
    expect(listFindings(studyId)).toHaveLength(0);
  });

  it('refuses to finish a study that has no findings', () => {
    setStudyStatus(studyId, 'analyzing', {fromBridge: true});
    expectBridgeError(() => setStudyStatus(studyId, 'done', {fromBridge: true}), 'bad_status', /بلا أي نتيجة/);
  });

  it('rejects findings that break the schema, with the path of each problem', () => {
    expectBridgeError(() => addFinding(studyId, finding({confidence: 'certain'})), 'invalid', /confidence/);
    expectBridgeError(() => addFinding(studyId, finding({evidence: []})), 'invalid', /evidence/);
    expectBridgeError(() => addFinding(studyId, finding({key: 'Has Spaces'})), 'invalid', /key/);
    expectBridgeError(() => addFinding(studyId, finding({module: 'made_up'})), 'invalid', /module/);
    expectBridgeError(() => addFinding(studyId, finding({extra: 'field'})), 'invalid');
    expectBridgeError(() => addFinding(studyId, 'not an object'), 'invalid');
  });

  it('rejects evidence that is not in the package index', () => {
    expectBridgeError(() => addFinding(studyId, finding({evidence: ['post:ig:p1', 'post:ig:invented']})), 'invalid', /post:ig:invented/);
    expectBridgeError(() => addFinding(studyId, finding({evidence: ['p1']})), 'invalid');
  });

  it('rejects a module that is valid but not part of this study', () => {
    expectBridgeError(() => addFinding(studyId, finding({module: 'ads_inventory'})), 'invalid', /ليست ضمن هذه الدراسة/);
  });

  it('saves a valid finding and emits an event for the UI', () => {
    const before = lastEventId();
    const result = addFinding(studyId, finding());
    expect(result.created).toBe(true);
    expect(result.finding).toMatchObject({studyId, module: 'top_content', key: 'best-1', confidence: 'medium'});
    expect(eventsAfter(before).map(e => e.type)).toEqual(['finding.added']);
  });

  it('updates instead of duplicating when the same key is written again (resume)', () => {
    const result = addFinding(studyId, finding({title: 'عنوان محدَّث بعد الاستئناف'}));
    expect(result.created).toBe(false);
    const all = listFindings(studyId);
    expect(all).toHaveLength(1);
    expect(all[0]!.title).toBe('عنوان محدَّث بعد الاستئناف');
    expect(getModuleData(studyId, 'top_content').existingFindings).toEqual([{key: 'best-1', title: 'عنوان محدَّث بعد الاستئناف'}]);
  });

  it('keeps the same key independent across modules', () => {
    addFinding(studyId, finding({module: 'visual_style'}));
    expect(listFindings(studyId)).toHaveLength(2);
    expect(listFindings(studyId, 'visual_style')).toHaveLength(1);
  });
});

describe('status transitions from the bridge', () => {
  it('allows analyzing → done once findings exist, and blocks everything else', () => {
    expectBridgeError(() => setStudyStatus(studyId, 'collecting', {fromBridge: true}), 'bad_status');
    expectBridgeError(() => setStudyStatus(studyId, 'failed', {fromBridge: true}), 'bad_status');
    expect(setStudyStatus(studyId, 'done', {fromBridge: true}).status).toBe('done');
    // إعادة التحليل بعد الاكتمال مسموحة صراحةً.
    expect(setStudyStatus(studyId, 'analyzing', {fromBridge: true}).status).toBe('analyzing');
  });

  it('will not start analysis on a study that is still collecting', () => {
    const draft = createStudy({type: 'account', title: 'لم تُجمع بعد', status: 'collecting'});
    expectBridgeError(() => setStudyStatus(draft.id, 'analyzing', {fromBridge: true}), 'bad_status', /الجمع لم ينتهِ/);
    expect(existsSync(join(dir, 'studies', String(draft.id), 'package'))).toBe(false);
    expectBridgeError(() => getPackageIndex(draft.id), 'no_package');
  });

  it('reports a missing study clearly', () => {
    expectBridgeError(() => getBrief(99999), 'not_found', /لا توجد دراسة/);
  });
});

describe('demo packages', () => {
  it('marks the brief so the session mentions the data is generated', async () => {
    const demo = createStudy({type: 'content', title: 'تجريبي', modules: ['top_content'], isDemo: true, status: 'collecting'});
    const result = await buildPackage({studyId: demo.id, posts: [{...post(1), platform: 'demo'}], isDemo: true});
    expect(result.index.isDemo).toBe(true);
    expect(readFileSync(join(result.dir, 'brief.md'), 'utf8')).toContain('بيانات تجريبية');
  });
});
