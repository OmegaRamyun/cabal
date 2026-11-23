# Task queue — Cabal Ring Kit Stage 1 MVP

Parallel-agent queue. One task = one file set + one acceptance test.
Agents: claim by branching `task/Txx-short-name`, flip status to
`claimed` in your branch, push when `npm test` is green. Coordinator
merges. Never edit another task's files.

| Task | Scope | Files owned | Status | Branch | Lane |
|---|---|---|---|---|---|
| T01 | App shell, layout, module registry | `index.html`, `style.css`, `app.js` | done | — | Sonnet |
| T02 | Intent composers (X / Bluesky / Threads / Reddit) | `src/intents.mjs`, `tests/t02.test.mjs` | done | — | Sonnet |
| T03 | Similarity gate — lexical | `src/similarity.mjs`, `tests/t03.test.mjs` | done | — | Sonnet |
| T04 | Similarity gate — MiniLM embeddings (opt-in) | `src/embeddings.mjs`, `tests/t04.test.mjs` | removed (T11) | — | Hydrogen |
| T11 | Remove AI embeddings, hash gate in composer (warnings only) | `src/similarity.mjs`, `tests/t03.test.mjs`, `tests/t01.test.mjs`, `app.js`, `index.html`, `src/checklist.mjs`, `tasks/T03.md`, `tasks/T04.md` | done | — | — |
| T05 | Matchmaking directory + match score | `directory/`, `schemas/directory.schema.json`, `src/match.mjs`, `tests/t05.test.mjs` | done | — | Sonnet |
| T06 | Discord #rings bridge | `src/discord.mjs`, `tests/t06.test.mjs` | done | — | Hydrogen |
| T07 | Kickstarter planner + referral tags | `src/kickstarter.mjs`, `tests/t07.test.mjs` | done | — | Sonnet |
| T08 | Steam UTM builder + campaign templates | `src/steam.mjs`, `src/templates.mjs`, `tests/t08.test.mjs` | done | — | Hydrogen |
| T09 | Pre-post checklist + docs | `src/checklist.mjs`, `CONTRIBUTING.md`, `tests/t09.test.mjs` | done | — | Hydrogen |
| T10 | Test harness + CI | `package.json`, `tests/`, `.github/workflows/test.yml` | done | — | Sonnet |

Lane suggestions are a starting split, not a lock — the coordinator
assigns by quota and load. T10 goes last or alongside; it owns the
harness, other tasks own their test files.

## v0.2 — campaign-first redesign (brief: REDESIGN-BRIEF.md, commit 1e489af)

| Task | Scope | Files owned | Status | Branch |
|---|---|---|---|---|
| V21 | Campaign object + link intent + store | `src/campaign.mjs`, `src/store.mjs`, `tests/v21-campaign.test.mjs` | done | `task/V21-campaign-core` |
| V22 | Home dashboard + campaign page | `src/home.mjs`, `src/campaign-page.mjs`, `tests/v22-home.test.mjs` | done | `task/V22-home-page` |
| V23 | Composer fed by the campaign | `src/quote-composer.mjs`, `tests/v23-quote-composer.test.mjs` | done | `task/V23-quote-composer` |
| V24 | Discovery: similar + popular, static list | `src/discovery.mjs`, `data/campaigns.json`, `tests/v24-discovery.test.mjs` | done | `task/V24-discovery` |
| V25 | Demo mode + disclaimers/terms | `src/demo.mjs`, `src/terms.mjs`, `tests/v25-demo.test.mjs` | done | `task/V25-demo-terms` |
| V26 | Migration: Stage 1 modules re-homed | `src/checklist.mjs`, `src/discord.mjs`, `tests/v26-migration.test.mjs` | done | `task/V26-migration` |
| V20 | Shell integration: router, demo seeding, link intent, dedupe | `index.html`, `style.css`, `app.js`, `tests/t01.test.mjs` | done | `task/V20-integration` |

Coordinator owns the shell (`index.html`, `style.css`, `app.js`), the merge,
and the end-to-end Playwright check. Tracks build modules + tests only and
never touch the shell or each other's files.
