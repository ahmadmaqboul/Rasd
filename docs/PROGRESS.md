# Progress

Last updated: 2026-11-18, end of the Phase 1 session in the cloud build environment.
Code: <https://github.com/ahmadmaqboul/Rasd> (`main`). CI runs type-check, tests and build on every push.

## Phase 1: Core platform

**Status: built and tested here. One step of the exit criterion needs the laptop.**
The exit criterion is "the user creates the سعد للاتصالات profile, connects an Instagram session, and sees
session health". Creating the profile works in the app. Connecting a session needs a person to log in on a
machine with a screen, and this container may not open Instagram. So the login and the health check were
proven with a real browser against a local fake platform, not against Instagram.

### Done

- [x] Full data model from §11 as an additive migration: business profiles and products, tracked entities
      (shared between profiles; roles own / competitor / seller), snapshots, posts, media, comment samples
      (text only, no author at all), ads and variants, market products, listings and price points, study runs,
      reports, templates, monitors and alerts, platform sessions, request usage, settings, jobs
- [x] Job queue and worker: lanes (one browser job per platform at a time), live progress over SSE, cancel,
      jobs left running by a closed app are marked interrupted
- [x] Sessions manager: login in a visible window that only waits (and waits through security checks), health
      check (valid / expired / challenged / unknown / missing), nickname, disconnect, dedicated-account warning,
      clear Arabic errors (no screen, profile in use, browser not installed, window closed, timeout)
- [x] Business profiles: list, create, edit, delete. Name required; accounts, products and prices on the page;
      category, region, currency, audience notes, costs and competitors under خيارات متقدمة. Field errors
      land on the right row
- [x] Settings: sessions, collection limits (under خيارات متقدمة), digits (0123 / ٠١٢٣) and currency, bridge
      status (last `rasd` CLI use, command and playbooks installed, MCP marked Phase 3), recent jobs, appearance
- [x] Library: Arabic-aware search, filters by type and business profile
- [x] Fixed «2+1» showing as «1+2» inside Arabic findings
- [x] 109 tests (jobs, sessions with a real browser, business, settings, API routes, bidi, plus Phase 0's)
- [x] GitHub repository and CI

### Not done in Phase 1

- [ ] **Log in to a real Instagram session from Settings and see «شغّالة»** — on the laptop (steps below)
- [ ] Collection limits are stored but not enforced yet; the Phase 2 collectors will read them
- [ ] The study setup screen still cannot start a collection (Phase 2 wires collection to jobs; Phase 4 the setup)

## Phase 0: Foundations and spikes

**Status: built, not closed.** The bridge spike works on demo data. The Ad Library spike read 0 ads on its one
real run (cause unknown). The Instagram spike has never run against the real site. Both need the laptop.
Details: [decisions.md → Spike results](decisions.md#spike-results).

- [ ] Spike 2 (Ad Library): run once on the laptop, read the saved screenshot/HTML/diagnostics, fix the parser
- [ ] Spike 1 (Instagram) against the real site
- [ ] Replace the hand-built parser fixtures with captured responses (a successful run saves them)

## On the laptop: what to run

Decision (2026-11-18): Rasd stays local, reading the platforms through a logged-in browser with a dedicated
collection account. **Step-by-step, including a message to paste into a local Claude Code session:
[laptop.md](laptop.md).**

In short: clone the repo, `npm install`, `npx playwright install chromium`, `npm run dev`, then in the app
add سعد للاتصالات under البزنس and log in to Instagram under الإعدادات → حسابات الدخول. That closes Phase 1.
Then run the two spikes (`npm run spike:adlibrary -- --keyword "شاحن" --max 20` and
`npm run spike:instagram -- <a public account> --study`) and fix the parsers against what they read.

## Known gaps (by design, for later phases)

| Gap | Phase |
|---|---|
| Collectors do not run as jobs yet, do not use the limits, no comment sampling, no Facebook pages, web stores or discovery | 2 |
| No MCP server; `/rasd-ask`, `/rasd-compare` and twelve of the fourteen playbooks are missing | 3 |
| The study setup screen only previews the recipe; templates page is empty | 4 |
| Findings are a flat list; no report structure, mood board, matrix, scoring, PDF | 5 |
| Monitors page is empty | 6 |
| No media download for video, keyframes, contact sheets or transcription | 2 / 7 |
| Session profile relies on Chromium's own encryption (decisions.md, open question 2) | — |
| Only Chromium was tested | 8 |

## Next: Phase 2 — Collectors

Direction chosen by the owner: scraping through the local logged-in browser. **The plan below still needs the
owner's OK before building.** Best done in a local session, right after the spikes, because the parsers need
real responses.

1. **Collection as jobs**: every collection runs as a job with live progress and cancel, respects the limits in
   Settings (per run, per day, per hour), and reuses anything collected in the last 12 hours.
2. **Meta Ad Library**: fix the parser from a real response; store ads, variant counts and start dates.
3. **Instagram**: profile, posts from the last 30 days with their images, and a sample of comments — text only,
   no commenter names.
4. **Facebook pages, store websites** (name, price, discount, availability) and **competitor suggestions**.
5. **«ابدأ الجمع»** on the study screen for account and ads studies (the full setup screen stays Phase 4).
6. **Tests** on real responses saved from the first runs.

Done when: collecting a real account for 30 days stores posts, media, comment samples and ads correctly.

## Open questions

See [decisions.md → Open questions for the owner](decisions.md#open-questions-for-the-owner): laptop OS,
session encryption, chart library, playbook language.
