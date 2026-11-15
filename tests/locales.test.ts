import {readdirSync, readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {STUDY_STATUSES} from '../src/core/db/schema';
import {MODULES, RECIPES} from '../src/core/recipes';

type Tree = {[key: string]: string | Tree};
const load = (lang: string, ns: string): Tree =>
  JSON.parse(readFileSync(new URL(`../locales/${lang}/${ns}.json`, import.meta.url), 'utf8')) as Tree;

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((out, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? {...out, [path]: value} : {...out, ...flatten(value, path)};
  }, {});
}

const namespaces = readdirSync(new URL('../locales/ar', import.meta.url)).map(f => f.replace('.json', ''));

describe('locales', () => {
  it('scaffolds an English file for every Arabic namespace', () => {
    const en = readdirSync(new URL('../locales/en', import.meta.url)).map(f => f.replace('.json', ''));
    expect(en.sort()).toEqual([...namespaces].sort());
  });

  it('has no English key that is missing from Arabic (Arabic is the source)', () => {
    for (const ns of namespaces) {
      const ar = flatten(load('ar', ns));
      for (const key of Object.keys(flatten(load('en', ns)))) expect(ar, `${ns}:${key}`).toHaveProperty([key]);
    }
  });

  it('has no empty Arabic strings', () => {
    for (const ns of namespaces) {
      for (const [key, value] of Object.entries(flatten(load('ar', ns)))) expect(value.trim(), `${ns}:${key}`).not.toBe('');
    }
  });

  it('labels every study type, module and status', () => {
    const studies = flatten(load('ar', 'studies'));
    for (const recipe of RECIPES) {
      for (const field of ['label', 'description', 'input']) expect(studies).toHaveProperty([`types.${recipe.id}.${field}`]);
    }
    for (const module of MODULES) expect(studies).toHaveProperty([`modules.${module}`]);
    const common = flatten(load('ar', 'common'));
    for (const status of STUDY_STATUSES) expect(common).toHaveProperty([`status.${status}`]);
  });
});
