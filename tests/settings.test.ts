import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {closeDb, getDb, schema} from '../src/core/db/client';
import {
  DEFAULT_SETTINGS,
  SettingsError,
  getBridgeStatus,
  getSettings,
  recordBridgeActivity,
  resetSettings,
  updateSettings,
} from '../src/core/settings';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rasd-settings-'));
  process.env.RASD_DATA_DIR = dir;
  getDb();
});

afterAll(() => {
  closeDb();
  rmSync(dir, {recursive: true, force: true});
});

describe('settings', () => {
  it('starts from conservative defaults with Western digits and shekels', () => {
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(getSettings().locale).toEqual({language: 'ar', digits: 'latn', currency: 'ILS'});
  });

  it('saves part of a section and keeps the rest', () => {
    const next = updateSettings('collection', {maxItemsPerRun: 30});
    expect(next.collection.maxItemsPerRun).toBe(30);
    expect(next.collection.minDelayMs).toBe(DEFAULT_SETTINGS.collection.minDelayMs);
    expect(getSettings().collection.maxItemsPerRun).toBe(30);
  });

  it('rejects out-of-range values with an Arabic message and saves nothing', () => {
    expect(() => updateSettings('collection', {minDelayMs: 100})).toThrow(SettingsError);
    expect(() => updateSettings('collection', {minDelayMs: 100})).toThrow(/أقل قيمة مسموحة 800/);
    expect(() => updateSettings('collection', {maxScrolls: 2.5})).toThrow(/رقم صحيح/);
    expect(getSettings().collection.minDelayMs).toBe(DEFAULT_SETTINGS.collection.minDelayMs);
  });

  it('rejects a minimum delay above the maximum', () => {
    expect(() => updateSettings('collection', {minDelayMs: 9000, maxDelayMs: 5000})).toThrow(/أصغر من أكثر انتظار/);
  });

  it('rejects unknown keys and values', () => {
    expect(() => updateSettings('locale', {digits: 'roman' as never})).toThrow(SettingsError);
    expect(() => updateSettings('collection', {turbo: true} as never)).toThrow(SettingsError);
  });

  it('switches to Arabic-Indic digits and another currency', () => {
    const next = updateSettings('locale', {digits: 'arab', currency: 'JOD'});
    expect(next.locale).toEqual({language: 'ar', digits: 'arab', currency: 'JOD'});
  });

  it('falls back to the defaults when a stored section is corrupt', () => {
    getDb()
      .update(schema.settings)
      .set({value: {digits: 42}})
      .run();
    expect(getSettings().locale).toEqual(DEFAULT_SETTINGS.locale);
  });

  it('resets a section', () => {
    updateSettings('collection', {maxItemsPerRun: 99});
    expect(resetSettings('collection').collection).toEqual(DEFAULT_SETTINGS.collection);
  });
});

describe('bridge status', () => {
  it('reports when the CLI was last used and what is installed in the repo', () => {
    const repo = join(dir, 'repo');
    mkdirSync(join(repo, '.claude', 'commands'), {recursive: true});
    mkdirSync(join(repo, '.claude', 'skills', 'rasd-top-content'), {recursive: true});
    mkdirSync(join(repo, '.claude', 'skills', 'other-skill'), {recursive: true});
    mkdirSync(join(repo, '.claude', 'skills', 'rasd-empty'), {recursive: true});
    writeFileSync(join(repo, '.claude', 'commands', 'rasd-analyze.md'), '#');
    writeFileSync(join(repo, '.claude', 'skills', 'rasd-top-content', 'SKILL.md'), '#');
    writeFileSync(join(repo, '.claude', 'skills', 'other-skill', 'SKILL.md'), '#');

    expect(getBridgeStatus(repo).cli).toBeNull();
    recordBridgeActivity('finding add');
    const status = getBridgeStatus(repo);
    expect(status.cli?.command).toBe('finding add');
    expect(Date.now() - Date.parse(status.cli!.lastSeenAt)).toBeLessThan(5000);
    expect(status).toMatchObject({analyzeCommand: true, playbooks: 1, mcp: {available: false}});
  });
});
