# Decisions and findings

Phase 0: 2026-11-15. Phase 1: 2026-11-18. Each entry says what was chosen, why, and what would make us revisit it.
Phase 1 decisions are in [their own section](#phase-1-core-platform).

## Read this first: where Phase 0 was built

Phase 0 was built in a **cloud container**, not on the owner's laptop. Two consequences:

1. **The container's network policy blocked `instagram.com`, `facebook.com` and `tiktok.com`.** Late in
   Phase 0 the owner allowed four exact hosts (`www.facebook.com`, `static.xx.fbcdn.net`, `www.instagram.com`,
   `static.cdninstagram.com`). The media CDNs use changing host names (`scontent-…fbcdn.net`,
   `scontent-…cdninstagram.com`) that an exact-host allowlist cannot cover, so images still cannot load here.
   One real Ad Library run was made after that; see the results table.
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
| Job queue | A **`jobs` table** worked by a worker inside the server process; every change is written to the `events` table, so progress reaches the UI over the same SSE stream (Phase 1, details below) | Same reasons as live updates; no Redis, no second process to keep alive. | We need jobs to survive the app being closed mid-run (today they are marked interrupted and must be restarted) |
| i18n | **i18next 27** + react-i18next, typed keys (`CustomTypeOptions`), Arabic is the source, `locales/en` scaffolded and empty | Typed keys turn a missing or misspelled key into a compile error. A test fails if a study type, module or status has no Arabic label. | — |
| Collection | **Playwright 1.63** (pinned), one persistent browser profile per platform under `data/sessions/` | Persistent profile = the manual login survives restarts. | — |
| Reading pages | **Read the JSON the site loads for its own page**, DOM as fallback | Class names and markup change weekly; the data payloads change less often and carry exact numbers. We make no extra requests — only what the page itself loads. | A site moves fully to server-rendered HTML |
| Validation | **zod 4** for everything that crosses the bridge | One schema gives the type, the validation and the error message. | — |
| Tests | **Vitest 5**; 109 tests after Phase 1. The session tests drive a real browser (headed, under Xvfb when there is no screen) against a local fake platform; they are skipped where Chromium is not installed, e.g. in CI | — | — |
| CI | **GitHub Actions**: `npm ci`, type-check, tests, build on every push to `main` | Catches a broken install or build before it reaches the laptop. | — |

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
| 2 | **Meta Ad Library** | ❌ **Ran once against the real site and read 0 ads** | After the hosts were allowed, `npm run spike:adlibrary -- --keyword "phone charger"` loaded the real page: no network block, no login wall or challenge detected, and the proxy log shows the page then asked for images from Facebook's media CDN, which suggests ad cards were drawn. But the collector captured **no** response containing an ad id, so it reported 0 ads with its "could not read any ad" warning. **The cause is not known.** That run saved no screenshot or HTML, and a second run with diagnostics was refused by this session's permission checks, so I stopped. The parser still passes 14 tests against a hand-built fixture — which is exactly the weakness: the fixture is my guess at the shape. |
| 1 | **Instagram profile + 12 posts** | ⚠️ **Code and tests done; not run against the real site** | `npm run spike:instagram -- --login` (visible window, manual login) then `npm run spike:instagram -- <handle>`. The parser handles both known payload shapes and passes 11 tests against hand-built fixtures. Needs a real login, so it can only be proven on the laptop. |

**Honest caveat on 1 and 2:** the fixtures are my reconstruction of the payload shapes, cross-checked by a web
search, not captured responses. The one real run already showed the Ad Library reconstruction is wrong or
incomplete somewhere. Treat both parsers as **unproven** until they have read real data.

What changed after the failed run (all untested against the real site):

- The collector accepts both spellings of the ad id key (`ad_archive_id`, `adArchiveID`) when deciding which
  responses to parse; before, a camelCase payload was skipped before the parser ever saw it.
- Embedded results are also read from the live DOM, not only from the first response body.
- **Both spikes now save `page.png` and `page.html` when they read nothing**, and the Ad Library spike prints
  how many GraphQL responses it saw and how many mentioned ads. The next empty run will say why.

Likely causes to check first, in order: results delivered in a response the filter does not match (a different
endpoint or key names); results rendered only after an interaction (consent, "see results" prompt); a
different page served to data-center addresses than to a home connection.

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

## Phase 1: core platform

### Data model (§11)

- **Additive migration** (`drizzle/0001_phase1_core.sql`), not a regenerated one as first proposed. It keeps the
  demo studies and their findings and costs nothing. drizzle-kit drops `ON DELETE` actions when it *adds* a
  foreign-key column in SQLite, so the two `ALTER TABLE studies ADD …` lines were edited by hand to say
  `ON DELETE set null`; checked on a copy of the real database (deleting a profile unlinks its studies).
- **Tracked entities are shared.** An account (`platform` + normalized handle) exists once; `profile_entities`
  says which profile tracks it and as what (`own` / `competitor` / `seller`). Posts and ads hang off the entity,
  so data collected for one profile is not collected again for another. Removing an account from a profile
  keeps the entity and its data.
- **Study vs. StudyRun.** A study is the question and its parameters; a run is one attempt at collecting and
  packaging it (a failed run, then a retry). Findings stay on the study. Re-running a *template* later makes a
  new study, so "compare with last time" compares two studies from the same template.
- **Privacy by schema (§5.4).** `comment_samples` has no column for an author — not even a hash. Duplicate
  comments are caught by a hash of the text.
- **Money** is stored as REAL next to its currency. Fine for display and scoring; revisit if Rasd ever sums
  money for accounting.

### Jobs

- One worker inside the server. Jobs carry a **lane**; two jobs in the same lane never run at the same time.
  Browser jobs use the platform as their lane, because a Chromium profile can only be opened once.
- **Cancel** works through an `AbortSignal`: a queued job is cancelled at once; a running one is checked every
  second and its handler stops (and closes its browser window) at the next step or sleep.
- A job left running when the app was closed is marked **interrupted** at the next start, with an Arabic
  message, so nothing shows "running" forever.
- Errors: a handler throws `JobError(arabicMessage, code)` for things the user can act on (`no_display`,
  `profile_busy`, `browser_missing`, `window_closed`, `timeout`); anything else is logged and shown as a
  generic Arabic message, never a stack trace.

### Platform sessions (§5.1)

- **Login** opens a visible Chromium window on the platform's login page and only *waits*: it polls the
  browser's cookies every 2 s until the login cookie appears (`sessionid` on Instagram; `c_user` + `xs` on
  Facebook), for up to 15 minutes. It never types, clicks or fills anything. If the platform shows a security
  check, the step changes to "كمّله بنفسك بالنافذة" and Rasd keeps waiting.
- **Health check** reads the saved cookies with a hidden browser, then opens the platform's home page **once**
  and classifies it: logged in → `valid`; redirected to a login page or shown a password field → `expired`;
  a checkpoint/challenge URL or a captcha → `challenged`; unreachable → `unknown` with the network message.
  An offline check (cookies only) is available and gives `unknown`.
- Rasd does **not** read which account is logged in. The user can give the session a nickname ("حساب الجمع").
- **Disconnect** deletes the profile folder; refused while any job uses that platform.
- The Ad Library needs no login, so it has no session of its own.
- **Encryption at rest** is unchanged: we rely on Chromium's own cookie encryption (OS keychain on macOS and
  Windows; on Linux it depends on the desktop keyring). Still open question 2 below.

### Settings and the bridge status

- Settings are stored per section (`collection`, `locale`) and validated with zod; a missing or corrupt stored
  section falls back to the defaults, so a bad value cannot stop the app. Defaults are conservative: 60 items per
  source per run, 600 per platform per day, 150 requests per hour, 1.8–4.2 s between steps, reuse anything
  collected in the last 12 hours. **Phase 2 collectors enforce them**; Phase 1 only stores them.
- **Digits and currency** drive every formatter in the UI. Changing them remounts the page under the providers,
  so every number on screen changes at once.
- **Bridge status**: the `rasd` CLI records its last command and time on every run; Settings shows it, plus
  whether `/rasd-analyze` and how many playbooks are in the repo. The MCP server is Phase 3, shown as such.

### Arabic text with number expressions

`«2+1»` inside an Arabic sentence rendered as `«1+2»`: in an Arabic paragraph the digits become *Arabic
numbers*, and a `+` or `-` between two of them is not kept between them. Findings now pass through
`isolateNumberRuns()` (`src/web/lib/bidi.ts`), which wraps expressions like `2+1`, `10-15`, `530 + 88` in
Unicode isolate marks. Measured: the `2` now sits left of the `1`. Rule added to [rtl.md](rtl.md).

### What could not be verified here

- A **real** Instagram or Facebook login and health check: this container may not open those sites, and the
  login needs a person. The same code was run end to end with a real browser against a local fake platform
  (login, a security-check pause, cancel, and valid / expired / challenged checks).
- In this container a login attempt fails, as intended, with "ما بقدر أفتح نافذة متصفح على هذا الجهاز…",
  because there is no screen.

## Running Rasd with nothing on the laptop (owner's request, 2026-11-18) — decision pending

The owner asked for Rasd to run fully remote, with nothing installed on the laptop. That changes principle
"Local and private" and the Phase 2 collectors, so it waits for the owner's choice. What we found:

- **A logged-in browser on a server does not work for Instagram.** Instagram flags data-center IP ranges and
  answers logins from them with security checks or bans; the usual "fix" sold for this is residential or mobile
  proxies, i.e. disguising the traffic. That is getting around a platform's protection, which Rasd never does.
- **Meta's official API covers most of what we need for Instagram, from any server.** *Business Discovery*
  lets a professional (business or creator) Instagram account read another public professional account:
  follower and media counts and its media list with captions, like and comment counts and dates. It needs
  Saed Tel's Instagram to be a professional account linked to a Facebook Page, and a Meta developer app.
  Limits: personal accounts cannot be read; comment *text* of other accounts is not included; media
  downloads follow the owner's settings; rate limit 1,000 queries per hour. Permissions must be checked
  against the current API version before building.
- **Ads**: the Ad Library API still excludes commercial ads outside the EU, so ads would come from the public
  Ad Library web page, opened by a headless browser on the server *without logging in*. Whether Meta serves
  that page to a data-center IP has to be tested.
- **Hosting**: a small always-on server with a disk (about 5–7 USD a month), the app behind a password and
  HTTPS, opened from any browser. Analysis stays in a Claude session (like this one), which talks to the
  server's API through the `rasd` bridge with a token. This is a new paid service, so it needs the owner's
  go-ahead.

Options put to the owner: (1) private server + official API + public Ad Library (recommended);
(2) private server + logged-in browser (not recommended: blocks and account bans); (3) decide later.

## Open questions for the owner

1. **Which OS is the laptop?** It affects installing ffmpeg and whisper.cpp (Phase 2/7) and how the session
   profile is protected at rest.
2. **Session encryption at rest (§5.1).** A Playwright persistent profile is a Chromium profile folder.
   Chromium already encrypts cookies with the OS keychain on macOS and Windows. Phase 1 relies on that and
   adds no encryption of its own. Keep `data/` out of cloud-synced folders. Say if you want more.
3. ~~**Schema.**~~ Done in Phase 1, as an additive migration (see above).
4. **Charts** — see above.
5. **Playbook language.** The `/rasd-analyze` command and the playbooks are written in **Arabic**, because
   they define Arabic output and you are the one who tunes them. Code comments and developer docs are English.
   Say so if you would rather have the playbooks in English.
