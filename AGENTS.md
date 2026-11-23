# AGENTS.md

Cabal Ring Kit — v0.2 campaign-first. Static webapp, zero backend. Read
this before writing code. Keep it short: commands first, rules second.
Design contract: REDESIGN-BRIEF.md. v0.2 queue: tasks/INDEX.md (V20–V26).

## Commands

- Run: `python3 -m http.server 8000` in the repo root, open
  http://localhost:8000
- Tests: `npm test` (runs `node --test "tests/**/*.test.mjs"` — the bare `node --test tests/` form fails on Node 24, which treats `tests/` as a file path)
- No build step. No framework. No runtime npm dependencies.

## Stack

Vanilla ES modules, no bundler. Each feature is one `src/<name>.mjs` that
exports pure functions and a `mount(rootEl, ctx)` for its UI. `index.html`
is the shell; `app.js` is the hash router (home, campaign, composer,
discover, tools, terms) plus the link intent (`#c=` decodes a campaign
from the URL) and first-load demo seeding. Views read and write through
V21's `src/store.mjs` (`cabal.v2.*` localStorage keys). No module touches
another module's DOM. No AI in the app: the similarity gate is SimHash +
word 3-grams, computed locally in the browser, no model, no download, no
network. Demo data is fictional and flagged `demo: true` with a DEMO
badge everywhere it appears; `src/demo.mjs` seeds it on first load only.

## Versioning

`version.json` at the repo root is the app version (`{ version,
updatedAt }`). Bump the patch number on EVERY merge to main, and set
`updatedAt` to the merge time (UTC). The auto-updater (`src/updater.mjs`)
polls it; a stale version.json means users never see the update banner.
A minor/major bump is a deliberate decision, recorded in the task that
makes it — the default is patch +1 per merge.

## File ownership

One task = one file set (see `tasks/INDEX.md`). Only the coordinator
touches `index.html`, `style.css`, `app.js`. Only the coordinator touches
`tasks/INDEX.md`. Never edit another task's files — if you need a shared
change, say so in your report and stop.

## Claim protocol (for parallel agents)

1. Branch: `task/Txx-short-name` (one branch per task, from `main`).
2. In your branch, flip your task file's status to `claimed`.
3. Implement, write your acceptance test, run `npm test` green.
4. Push the branch. Do NOT merge — the coordinator merges green
   branches. Report: branch name, files changed, test result.

## Hard don'ts

- No auto-posting, auto-like, auto-follow, auto-comment, auto-DM, no vote
  exchange. Posting happens only when a human taps Post in the
  platform's own composer.
- No quotas, ledgers, points, streaks, or rewards for posting/engaging.
- No scraping, no browser automation, no password logins.
- No credentials or tokens stored anywhere. Webhook URLs live in the
  user's localStorage only, never committed.
- No Postiz code — AGPL. Mirror its adapter *pattern* only, re-implement
  from scratch. No AGPL-licensed code in this repo, ever.
- No AI-generated campaign copy presented as human. Templates are
  structure + disclosure lines, never fill-in-the-blank captions.
- No unverified numbers presented as fact. Do-not-cite list: the
  "47-campaign, 27% avg / 26% median" Kickstarter benchmark; the
  "5,190 Kickstarters on Reddit, 65% vs 84–99%" study; "10 cross-promo
  DMs in 2 days → warning"; the Feb 2025 mech-shooter astroturf boycott;
  "curator bans 2022". Verified anchors only: Kickstarter official 32%
  pre-launch conversion (vs 17% post-launch), FTC penalty $53,088 per
  violation, X $0.20 per URL-bearing post, Reddit public API ends
  Mar 2027.
- No SCT codes in the product or docs. DISARM is the labelling
  vocabulary only; checks are plain testable rules.
- Threads intent domain is unresolved (threads.net vs threads.com) —
  implement threads.net with a TODO and a live-test note. Do not ship
  either without a click-test.
- Every template ships a disclosure line. Every ring share is
  human-written, in the sharer's own words, staggered, disclosed.

## Acceptance rule

Every task ships `tests/<task>.test.mjs` (node --test) covering its pure
functions with fixtures. Green before done. DOM-only behaviour gets a
manual check note in the task file, not a skipped test.
