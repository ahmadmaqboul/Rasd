#!/usr/bin/env node
// مُشغِّل `rasd`: يحمّل TypeScript مباشرة عبر tsx فلا نحتاج خطوة بناء للـ CLI.
// الاستعمال (يعمل على ماك/لينكس/ويندوز):  node bin/rasd.mjs study list
import {register} from 'tsx/esm/api';

register();
await import('../src/cli/rasd.ts');
