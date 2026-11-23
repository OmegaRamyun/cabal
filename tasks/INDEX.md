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
| V27 | UI polish: Pico.css vendored, tokens, motion | `vendor/pico.min.css`, `vendor/README.md`, `style.css`, `index.html`, `src/home.mjs`, `src/campaign-page.mjs`, `src/discovery.mjs`, `tasks/V27-polish.md` | done | `task/V27-ui-polish` |
| V28 | Social feel: feed, avatars, relative time, composer-first | `src/campaign.mjs`, `src/demo.mjs`, `src/quote-composer.mjs`, `src/campaign-page.mjs`, `src/home.mjs`, `src/discovery.mjs`, `style.css`, `tasks/V28-social-feel.md`, `tests/v28-social.test.mjs` | done | `task/V28-social-feel` |
| V29 | Auto-updater: version.json polling + banner, never force-reload | `version.json`, `src/updater.mjs`, `tests/v29-updater.test.mjs`, `tasks/V29-auto-updater.md`, `index.html`, `style.css`, `app.js` | done | `task/V29-auto-updater` |
| V30 | Navbar: icon top bar, Tools & Terms gear menu | `index.html`, `style.css`, `app.js`, `tests/v30-navbar.test.mjs`, `tasks/V30-navbar.md`, `version.json` | done | `task/V30-navbar` |
| V31 | Atom discovery feed (`campaigns.atom`) | `src/atom.mjs`, `scripts/generate-atom.mjs`, `campaigns.atom`, `tests/v31-atom.test.mjs`, `index.html`, `version.json` | done | `task/V31-atom` |
| V32 | ToonSouls example campaign (for the bit) | `data/campaigns.json`, `campaigns.atom`, `tasks/V32-toonsouls.md`, `version.json` | done | `task/V32-toonsouls` |
| V33 | Intro pages: what Cabal is, how it works, the theory | `src/intro.mjs`, `tests/v33-intro.test.mjs`, `tasks/V33-intro-pages.md` | done | `task/V33-intro-pages` |
| V34 | Shadow Cabal background: gradient-noise canvas + scrim | `src/background.mjs`, `tests/v34-background.test.mjs`, `tasks/V34-shadow-background.md` | done | `task/V34-shadow-background` |
| V35 | Field journal gamification (craft only, no quotas/ledgers) | `src/gamify.mjs`, `tests/v35-gamify.test.mjs`, `tasks/V35-gamification.md` | done | `task/V35-gamification` |
| V36 | Integration: wire V33/V34/V35 into the shell, Souls theme | `index.html`, `style.css`, `app.js`, `tasks/V36-integration.md`, `src/store.mjs`, `src/gamify.mjs`, `src/checklist.mjs`, `tests/t01.test.mjs`, `tests/v21-campaign.test.mjs`, `tests/v26-migration.test.mjs`, `tests/v30-navbar.test.mjs`, `tests/v35-gamify.test.mjs`, `version.json` | done | `task/V36-integration` |

Coordinator owns the shell (`index.html`, `style.css`, `app.js`), the merge,
and the end-to-end Playwright check. Tracks build modules + tests only and
never touch the shell or each other's files.
