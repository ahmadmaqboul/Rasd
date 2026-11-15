# Progress

Last updated: 2026-11-15 — end of the Phase 0 session in the cloud build environment.

## Phase 0 — Foundations and spikes

**Status: built, not closed. One spike works; one failed its first real run; one has not been run.**
The exit criterion is "the app opens in Arabic with the correct font and theme, and all three spikes work with
real data". The first half is met. The second half is met for the bridge only, and only on demo data.
Why, and exactly what to run: [decisions.md → Spike results](decisions.md#spike-results).

### Done

- [x] Repo scaffold: React 19 + Vite 8 + Astryx 0.7.16 + Fastify 5 + SQLite/Drizzle, TypeScript throughout
- [x] `astryx init --all` run; its agent rules (`AGENTS.md`) are followed
- [x] Black-and-white theme (light + dark), muted semantic colors, built with the Astryx theme editor
- [x] IBM Plex Sans Arabic, self-hosted, weights 300–700
- [x] `<html lang="ar" dir="rtl">`, Western digits by default
- [x] i18n: every UI string in `locales/ar/*.json`, typed keys, `locales/en` scaffolded
- [x] App shell with the six navigation items; mobile nav works
- [x] Home: the one question, paste/search box that suggests a study type, ten study-type cards from declarative recipes
- [x] Library and study view (status, copy-the-command button, live findings with evidence thumbnails)
- [x] RTL verification with screenshots and measurements → [rtl.md](rtl.md)
- [x] Bridge core + `rasd` CLI (`study list|show|data|status`, `finding add|list`) with validation
- [x] Analysis package builder (brief, chunked data, resized images, evidence index)
- [x] `/rasd-analyze` command + playbooks for `top_content` and `visual_style`
- [x] **Spike 3 (bridge round trip): works end to end**, on labelled demo data
- [x] Instagram collector + spike script, with login-wall / challenge / blocked-network handling
- [x] Meta Ad Library collector + spike script (**does not read real data yet** — see Not done)
- [x] 58 tests (parsers, bridge rules, study suggestions, recipes, locale completeness)
- [x] [decisions.md](decisions.md)

### Not done

- [ ] **Spike 2 (Ad Library): fix it.** One real run loaded the page and read 0 ads; cause unknown. The spike
      now saves a screenshot, the HTML and response counts on an empty run — run it once, read those, fix the
      parser. Details in [decisions.md](decisions.md#spike-results).
- [ ] **Spike 1 (Instagram) against the real site** — never run. Needs a manual login in a visible browser,
      so it has to happen on the laptop.
- [ ] Replace the hand-built parser fixtures with captured responses (a successful run saves them automatically)

## Known gaps (by design, for later phases)

| Gap | Phase |
|---|---|
| The study setup screen only previews the recipe; nothing can be started from the UI | 4 (collection wiring: 2) |
| Business, Templates and Monitors pages are empty states that say so | 1 / 4 / 6 |
| Settings has appearance only; no session manager, limits, or bridge status | 1 |
| Schema is three tables; no business profiles, posts, ads, snapshots | 1 |
| No job queue or collection progress UI | 1 |
| No media download for video, no keyframes or contact sheets, no transcription | 2 / 7 |
| No comment sampling, no Facebook pages, web stores or discovery collectors | 2 |
| No MCP server; `/rasd-ask`, `/rasd-compare` and twelve of the fourteen playbooks are missing | 3 |
| Findings are shown as a flat list; no report structure, mood board, matrix, scoring, PDF | 5 |
| No library search or filters | 1 |
| Session profile is not encrypted by Rasd itself (see decisions.md, open question 2) | 1 |
| Only Chromium was tested | 8 |

## Next: Phase 1 — Core platform

Not started. Per the working agreement, a short plan will be posted for approval first. It will cover: the
full schema (§11), Business Profiles CRUD, the Settings sessions manager with headed login and session health,
collection limits, bridge status, and the job queue with SSE progress.

## Open questions

See [decisions.md → Open questions for the owner](decisions.md#open-questions-for-the-owner): laptop OS,
session encryption approach, schema reset, chart library, playbook language.
