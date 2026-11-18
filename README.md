# رَصد · Rasd

Local-first market and competitor intelligence for social media. Rasd collects public data from Instagram,
Facebook and the Meta Ad Library through a logged-in browser on your own machine, and turns it into Arabic
reports with evidence behind every finding.

**Rasd never calls an AI API.** The app collects, stores and displays. The analysis is done by a Claude
session (Claude Code in this repo) that reads the collected data through the `rasd` CLI and writes its
findings back. No API keys, nothing leaves your machine except the browsing itself.

Status: **Phase 1** (core platform) built; Phase 0's real-data spikes still need one run on the laptop.
See [docs/PROGRESS.md](docs/PROGRESS.md).

Running it on the laptop with a local Claude Code session, step by step: [docs/laptop.md](docs/laptop.md).

## Requirements

- Node.js 22.13 or newer
- ffmpeg (used from Phase 2)

## Run it

```bash
npm install
```

```bash
npx playwright install chromium
```

```bash
npm run dev
```

Open <http://127.0.0.1:5173>. The API server listens on `127.0.0.1:4310`; both are reachable from this
machine only. All data lives in `./data` (ignored by git). Set `RASD_DATA_DIR` to move it.

## First steps in the app

1. **البزنس → أضف بزنس**: create the profile (only the name is required; accounts, products and prices help).
2. **الإعدادات → حسابات الدخول → سجّل الدخول**: a browser window opens on Instagram's login page. Log in by
   hand with a **dedicated** account (not the business's main one). If Instagram asks for a security check,
   complete it in that window; Rasd waits and never fills anything in. The card then shows the session as
   «شغّالة», and «افحص الجلسة» checks it again later.

## Try the bridge (no platform access needed)

```bash
npm run spike:bridge
```

This creates a small demo study (5 generated posts with images, clearly labelled as demo) and prints its id.
Open the study in the app, press **انسخ أمر التحليل**, and paste the command into a Claude Code session opened
in this folder:

```
/rasd-analyze 1
```

Findings appear in the open page as the session writes them.

## Collection spikes (need a real network; Instagram needs a login)

Use a **dedicated** account for collection, not the business's main account.

```bash
npm run spike:adlibrary -- --keyword "شاحن" --max 20
```

```bash
npm run spike:instagram -- --login
```

```bash
npm run spike:instagram -- <account> --study
```

`--login` opens a visible browser window; log in by hand and close it. (The login in Settings does the same
and saves to the same place.) If a platform shows a login wall, a
security check or a captcha during collection, Rasd stops and tells you. It never tries to get past one.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | API server + web app with hot reload |
| `npm run build` then `npm start` | Production build served from one port (4310) |
| `npm test` | Unit tests |
| `npm run typecheck` | TypeScript check |
| `node bin/rasd.mjs --help` | The bridge CLI used by the Claude session |
| `npm run db:generate` | Generate a migration after changing `src/core/db/schema.ts` |
| `npm run astryx -- <cmd>` | Astryx CLI (component docs, theme editor, doctor) |

## Layout

```
src/core/         shared logic: database, schemas, recipes, the bridge core, jobs, settings,
                  sessions, business profiles
src/cli/          the `rasd` CLI
src/server/       local API (buildServer in app.ts) + SSE event stream + the job worker
src/collectors/   browser session, pacing, session login/check jobs, Instagram and Ad Library collectors
src/spikes/       Phase 0 spike scripts
src/web/          the React app (Astryx components only)
locales/          every UI string — ar is the source, en is scaffolded
themes/rasd/      the theme, edited with the Astryx theme editor
src/themes/       generated copy of the theme — do not edit by hand
.claude/          /rasd-analyze and one playbook per analysis module
docs/             decisions, RTL notes, progress
```

## Working on the UI

Read `AGENTS.md` first (written by Astryx). In short: start from an Astryx template, no `<div>` for layout,
no inline styles, tokens instead of raw colors. Two project rules on top, from [docs/rtl.md](docs/rtl.md):

- Arrow and chevron icons go through `DirectionalIcon`.
- URLs, handles, commands and IDs go through `Ltr`.
- Text from platforms or from a Claude session goes through `isolateNumberRuns()` (keeps «2+1» in order).

To change the theme: `npm run astryx -- experimental theme editor set rasd <thing> <value>`, then look at the
result with `npm run astryx -- experimental theme editor show rasd --png`.
