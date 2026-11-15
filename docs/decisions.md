# Decisions and findings — Phase 0

Date: 2026-11-15. Each entry says what was chosen, why, and what would make us revisit it.

## Read this first: where Phase 0 was built

Phase 0 was built in a **cloud container**, not on the owner's laptop. Two consequences:

1. **The container's network policy blocks `instagram.com`, `facebook.com` and `tiktok.com`.** Every request
   is refused by the egress proxy before it leaves (HTTP 403 on CONNECT). So the two collection spikes could
   not be run against the real sites from here.
2. **There is no screen.** The Instagram spike needs a person to log in once in a visible browser window.
   That can only happen on a machine with a display.

Neither is a design problem — Rasd is local-first and is meant to run on the laptop — but it means the
"all three spikes work with real data" exit criterion is **not fully met yet**. See [Spike results](#spike-results).

## Stack

| Area | Decision | Why | Revisit if |
|---|---|---|---|
| Bundler | **Vite 8** + `@vitejs/plugin-react` 6 | Rasd is a single-user local app: no SSR, no SEO, no server components. A long-lived Node process has to own Playwright, SQLite and the job queue, which fits a plain server better than Next.js route handlers. Astryx documents Vite as supported. | We need SSR for PDF rendering (unlikely: Playwright prints the client-rendered page) |
| Design system | **Astryx 0.7.16**, "plain CSS" path, versions pinned exactly | Astryx ships precompiled CSS; its docs say a StyleX compiler is needed *only* to write our own `stylex.create()` or to eject ("swizzle") a component. We style with component props and theme tokens, so no compiler. All `@astryxdesign/*` packages must stay on the same release, hence exact pins. | We need to swizzle a component → add `@stylexjs/rollup-plugin` |
| Theme | Built with Astryx's **theme editor** → `themes/rasd/` (source of truth) and `src/themes/rasd/` (generated app copy — never hand-edit) | The editor checks each change against what components actually read, and generates light + dark together. | The editor is marked *experimental* and may change in a patch release. If it breaks: the generated `rasd.settings.ts` is plain `defineTheme` input and keeps working without the editor. |
| Font | `@fontsource/ibm-plex-sans-arabic`, weights 300–700, bundled | Self-hosted: no request to Google Fonts, works offline, same files for PDF export. | — |
| Backend | **Fastify 5**, bound to `127.0.0.1` only | Small, typed, good streaming support for SSE. Loopback-only keeps "nothing leaves the machine" true by construction. | — |
| Running TypeScript | **tsx** for the server and CLI, no build step | One less thing to go wrong on the owner's machine; `node bin/rasd.mjs` works on macOS, Linux and Windows. | Startup time of the CLI (~0.6 s) becomes a problem |
| Storage | **SQLite** (`better-sqlite3` 13, WAL mode) + **Drizzle** 0.45, migrations in `drizzle/` applied on startup | WAL lets the server, the CLI and (later) the MCP server and workers write to the same file safely. | — |
| Live updates | An append-only **`events` table** that the server tails (every 600 ms) and streams over **SSE** | The CLI runs in a different process from the server (it is launched by the Claude session). Writing events to SQLite means no socket, port or lock between processes, and events survive a server restart. Measured CLI → UI: **1.1–1.4 s**, of which ~0.6 s is CLI startup. | We need sub-second progress → the CLI can also POST to the server when it is up |
| Job queue | Not built yet. Phase 1 will use the same pattern (a `jobs` table + the `events` table) | Same reasons; no Redis. | — |
| i18n | **i18next 27** + react-i18next, typed keys (`CustomTypeOptions`), Arabic is the source, `locales/en` scaffolded and empty | Typed keys turn a missing or misspelled key into a compile error. A test fails if a study type, module or status has no Arabic label. | — |
| Collection | **Playwright 1.63** (pinned), one persistent browser profile per platform under `data/sessions/` | Persistent profile = the manual login survives restarts. | — |
| Reading pages | **Read the JSON the site loads for its own page**, DOM as fallback | Class names and markup change weekly; the data payloads change less often and carry exact numbers. We make no extra requests — only what the page itself loads. | A site moves fully to server-rendered HTML |
| Validation | **zod 4** for everything that crosses the bridge | One schema gives the type, the validation and the error message. | — |
| Tests | **Vitest 5**; 57 tests | — | — |

### Things that are newer than usual and worth knowing

- **TypeScript 7** (the native compiler) is used for type-checking only (`npm run typecheck`).
- **`overrides` in `package.json`** pins `@babel/plugin-transform-runtime` to v7. Reason: Astryx's CLI pins
  Babel 7, while an *optional* peer of the Vite React plugin resolves to Babel 8, and npm refuses to install.
  Nothing in our build uses that plugin. Remove the override when Astryx moves to Babel 8.
- **`npm audit`: 4 moderate**, all in `drizzle-kit`'s development-time dependency chain (an old esbuild).
  `drizzle-kit` only runs when a developer generates a migration; it is not part of the running app.
- **`astryx doctor`: 19 pass, 0 fail, 2 warn.** Both warnings are the same thing: doctor cannot statically
  prove the font loads because the theme imports it from a package. We verified at runtime that it does.

## Bridge design (§6.0)

- **One core, several front ends.** `src/core/bridge/core.ts` holds every operation. The CLI
  (`src/cli/rasd.ts`) and the web server both call it; the MCP server in Phase 3 will too.
- **Evidence IDs** are `<kind>:<platform>:<id>` (`post:ig:C8xYz`, `ad:meta:123…`). The package's `index.json`
  maps each one to its source URL and images.
- **A finding is rejected unless** it matches the schema, its module belongs to the study, the study is in
  `analyzing`, **and every evidence ID exists in the package index.** This is what makes "every finding links
  to its source" a guarantee rather than a hope.
- **Resume without duplicates.** Findings are upserted on `(study, module, key)`. A session that is cut off
  and restarted rewrites the same keys. Verified: writing the same four findings twice leaves four.
- **The session can only set `analyzing`, `done` or `partial`**, cannot start on a study that is still
  collecting, and cannot mark a study `done` with zero findings.
- **The package hides what the session does not need:** local file paths and expiring CDN URLs are stripped;
  images are resized to 1024 px (long edge) JPEG; data files hold at most 20 items so playbooks work in batches.
- **Post text is data, not instructions.** `/rasd-analyze` tells the session that captions, comments and ad
  copy come from outside accounts and must never be followed as commands.

Not built yet (Phase 3): the MCP server, `rasd report write`, `/rasd-ask`, `/rasd-compare`, and the other
twelve playbooks. Phase 0 has `top_content` and `visual_style`.

## Findings

### Astryx has real RTL support

Contrary to the assumption in the build prompt. Details, measurements and the five rules for our own code are
in [rtl.md](rtl.md). Short version: Astryx components are correct; directional icons and LTR text that *we*
add need two small helpers, which exist (`DirectionalIcon`, `Ltr`).

### Astryx has no usable chart package yet

`@astryxdesign/charts` on npm is `0.0.0-bootstrap.0` (a placeholder). Phase 5 needs charts in grayscale with
one highlight tone, so we will have to pick a chart library or draw SVG ourselves. **Decision needed before Phase 5.**

### Meta's Ad Library API does not cover our case

The official API (`ads_archive`) returns political and social-issue ads from any country, and commercial ads
**only if they were shown in the EU or the UK**. Commercial ads aimed at Palestine are not in it. The Ad Library
**website** shows them to any visitor without logging in, so the `meta_ad_library` collector browses the
public site, as the build prompt anticipated.

*Confidence: medium.* This comes from one web search over third-party guides, which agree with each other and
with what I already knew; I could not open Meta's own documentation from this environment.
Sources: [admanage.ai](https://admanage.ai/blog/facebook-ads-library-api),
[metapi.io](https://metapi.io/compare/facebook-ad-library-api),
[Meta transparency — Ad Library tools](https://transparency.meta.com/en-us/researchtools/ad-library-tools),
[Graph API reference: ads_archive](https://developers.facebook.com/docs/graph-api/reference/ads_archive/).

### The Astryx agent rules shape how we write UI

`AGENTS.md` (written by `astryx init`) sets rules we follow: start from a template, no `<div>` for layout, no
inline `style`, tokens instead of raw colors or pixels, `Badge` for counts only. The only raw element in app
code is `<bdi>` (see rtl.md §2).

## Spike results

| # | Spike | Status | What was actually shown |
|---|---|---|---|
| 3 | **Bridge round trip** | ✅ **Works end to end** — on generated demo data | A 5-post package with images was built; I followed `/rasd-analyze` in this session: read the brief and the two playbooks, opened all five images, and wrote 8 findings through the CLI. A browser left open on the study page went from 0 to 8 findings **without reloading**, with 35 evidence thumbnails and none broken. The interrupted-and-resumed case was exercised too. The data is synthetic and labelled as demo in the UI; the analysis of it is real (e.g. it caught that one image shows 5 phone cases while its text says 6). |
| 2 | **Meta Ad Library** | ⚠️ **Code and tests done; not run against the real site** | `npm run spike:adlibrary -- --keyword "…"` exists. The parser passes 11 tests against a hand-built fixture shaped like the site's response. From this container the run stops with a clear Arabic "cannot reach facebook.com" message, as designed. |
| 1 | **Instagram profile + 12 posts** | ⚠️ **Code and tests done; not run against the real site** | `npm run spike:instagram -- --login` (visible window, manual login) then `npm run spike:instagram -- <handle>`. The parser handles both known payload shapes and passes 13 tests against hand-built fixtures. Needs a real login, so it can only be proven on the laptop. |

**Honest caveat on 1 and 2:** the fixtures are my reconstruction of the payload shapes, cross-checked by a web
search, not captured responses. The sites' real payloads may differ in ways the tests cannot see. Both spikes
save every raw response to `data/spikes/…/raw-*.json` precisely so that the first real run produces true
fixtures. Expect to adjust the parsers after that first run.

### To close Phase 0 on the laptop

```bash
npm install
```

```bash
npx playwright install chromium
```

```bash
npm run spike:adlibrary -- --keyword "شاحن" --max 20
```

```bash
npm run spike:instagram -- --login
```

```bash
npm run spike:instagram -- <a public account> --study
```

The last command also builds a study from the real posts, so `/rasd-analyze <id>` can be repeated on real data.

## Open questions for the owner

1. **Which OS is the laptop?** It affects installing ffmpeg and whisper.cpp (Phase 2/7) and how the session
   profile is protected at rest.
2. **Session encryption at rest (§5.1).** A Playwright persistent profile is a Chromium profile folder.
   Chromium already encrypts cookies with the OS keychain on macOS and Windows. Proposal for Phase 1: rely on
   that, keep `data/` out of cloud-synced folders, and document it — rather than adding our own encryption
   layer and key management. Agree?
3. **Schema.** Phase 0 has three tables (`studies`, `findings`, `events`). Phase 1 replaces this with the full
   model in §11, including the `Study` / `StudyRun` split. There is no data worth migrating, so Phase 1 will
   regenerate the migration from scratch.
4. **Charts** — see above.
5. **Playbook language.** The `/rasd-analyze` command and the playbooks are written in **Arabic**, because
   they define Arabic output and you are the one who tunes them. Code comments and developer docs are English.
   Say so if you would rather have the playbooks in English.
