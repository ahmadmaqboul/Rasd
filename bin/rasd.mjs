#!/usr/bin/env node
// `rasd` launcher: loads TypeScript directly through tsx, so the CLI needs no build step.
// Usage (works on macOS/Linux/Windows):  node bin/rasd.mjs study list
import {register} from 'tsx/esm/api';

register();
await import('../src/cli/rasd.ts');
