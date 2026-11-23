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
| V37 | Pass it on: teach the second-order loop (#Ring channel) | `src/intro.mjs`, `src/campaign-page.mjs`, `style.css`, `tests/v33-intro.test.mjs`, `tests/v22-home.test.mjs`, `tasks/V37-pass-it-on.md`, `version.json` | done | `task/V37-pass-it-on` |
| V38 | Sustained-ring campaign model: posts + assists, URL recognition | `src/campaign.mjs`, `src/discovery.mjs`, `src/demo.mjs`, `src/atom.mjs`, `scripts/generate-atom.mjs`, `data/campaigns.json`, `campaigns.atom`, `tests/v38-sustained-model.test.mjs`, `tasks/V38-campaign-model.md`, `version.json` | done | `task/V38-campaign-model` |
| V39 | Sustained-ring feed UI: campaign page, composer, checklist, home | `src/campaign-page.mjs`, `src/quote-composer.mjs`, `src/checklist.mjs`, `src/home.mjs`, `tests/v39-sustained-feed.test.mjs`, `tasks/V39-feed-ui.md`, `version.json` | done | `task/V39-sustained-feed` |
| V40 | Sustained-ring journal + intro rewrite | `src/gamify.mjs`, `src/intro.mjs`, `tests/v40-sustained-journal.test.mjs`, `tasks/V40-gamify-intro.md`, `version.json` | done | `task/V40-sustained-journal` |
| V41 | Nostr sync — merged via V43b under the shared-campaign-key shape (per-user keys superseded) | `src/nostr.mjs`, `src/nostr-schnorr.mjs`, `tests/v41-nostr-sync.test.mjs`, `tasks/V41-nostr-sync.md`, `version.json` | done (via V43b) | `task/V43b-nostr-shared-key` |
| V42 | Sustained-ring integration: merge V38–V40, wire shell (firstPostIds, passon, per-post checklist) | `app.js`, `src/campaign-page.mjs`, `src/campaign.mjs`, `tests/v26-migration.test.mjs`, `tests/t01.test.mjs`, `tasks/V42-integration.md`, `tasks/INDEX.md`, `.gitignore`, `version.json` | done | — (direct, coordinator) |
| V43a | Creator removal model: createdBy, removedMembers, removeMember, key in link fragment | `src/campaign.mjs`, `tests/v43-removal-model.test.mjs`, `tasks/V43a-removal-model.md`, `version.json` | done | `task/V43a-removal-model` |
| V43b | Nostr shared campaign keypair + creator removal via relay (rework of V41) | `src/nostr.mjs`, `tests/v41-nostr-sync.test.mjs`, `tests/v43-nostr-removal.test.mjs`, `tasks/V43b-nostr-shared-key.md`, `version.json` | done | `task/V43b-nostr-shared-key` |
| V43c | Creator removal UI: Remove button, removed roster, removed-member read-only | `src/campaign-page.mjs`, `tests/v43-removal-ui.test.mjs`, `tasks/V43c-removal-ui.md`, `version.json` | done | `task/V43c-removal-ui` |
| V44 | Sustained-ring integration: merge V43a–V43c, wire shell (keygen on creation, sync panel, short-link route, share-link choice) | `app.js`, `index.html`, `style.css`, `src/home.mjs`, `src/campaign-page.mjs`, `tests/v44-integration.test.mjs`, `tasks/V44-integration.md`, `tasks/INDEX.md`, `version.json` | done | — (direct, coordinator) |

Coordinator owns the shell (`index.html`, `style.css`, `app.js`), the merge,
and the end-to-end Playwright check. Tracks build modules + tests only and
never touch the shell or each other's files.
| V45 | Rings/Campaigns split: format model, My Rings + Campaigns views, intro section, seed formats | `src/campaign-formats.mjs`, `data/formats.json`, `src/home.mjs`, `src/discovery.mjs`, `src/intro.mjs`, `tests/v45-split.test.mjs`, `tasks/V45-rings-campaigns-split.md`, `version.json` | done | `task/V45-rings-campaigns-split` |
| V46 | Template popularity via Nostr: relay-event counting, usage sort, honest-limits copy | `src/popularity.mjs`, `tests/v46-popularity.test.mjs`, `tasks/V46-template-popularity.md`, `version.json` | done | `task/V46-template-popularity` |
| V47 | Browser flags: sync panel on ToonSouls (mechanism + patch), relay defaults (drop nostr.band), full BIP-340 vectors | `src/nostr.mjs`, `src/sync-target.mjs`, `tests/v47-bip340-vectors.test.mjs`, `tests/v47-browser-flags.test.mjs`, `tasks/V47-browser-flags.md`, `version.json` | done | `task/V47-browser-flags` |
| V48 | Rings/Campaigns integration: merge V45–V47, wire shell (routes, preselected-format creation, popularity into discovery, V47 sync-panel patch, format tag on Nostr events) | `app.js`, `index.html`, `style.css`, `src/nostr.mjs`, `src/home.mjs`, `src/discovery.mjs`, `src/campaign-formats.mjs`, `tests/v48-integration.test.mjs`, `tasks/V48-integration.md`, `tasks/INDEX.md`, `version.json` | done | — (direct, coordinator) |
| V49 | Obvious creation (Cade's complaint): "Start a ring" on Rings, "New campaign template" on Campaigns, template create form, user formats in localStorage | `src/home.mjs`, `src/discovery.mjs`, `src/campaign-formats.mjs`, `src/user-formats.mjs`, `tests/v49-create-actions.test.mjs`, `tasks/V49-create-actions.md`, `version.json` | done | `task/V49-create-actions` |
| V51 | Node graph model: buildGraph/layoutGraph, listable-only nodes, share-gated formats | `src/graph.mjs`, `tests/v51-node-graph.test.mjs`, `tasks/V51-node-graph.md`, `version.json` | done | `task/V51-node-graph` |
| V52 | Node view UI: 2D SVG graph, tap detail panel, pan/zoom, create actions on the view | `src/node-view.mjs`, `tests/v52-node-view.test.mjs`, `tasks/V52-node-view.md`, `version.json` | done | `task/V52-node-view` |
| V53 | Node view integration: merge V51+V52, #/campaigns mounts the net, Souls node styles, demo rings run formats | `app.js`, `index.html`, `style.css`, `src/demo.mjs`, `data/campaigns.json`, `tests/v53-integration.test.mjs`, `tasks/V53-integration.md`, `version.json` | done | — (direct, coordinator) |
| V49i | V49 integration (coordinator): `#/campaigns/new` route, merged formats everywhere, create-action styles; verifier round-2 fixes (formatId adoption, relay client close, "used by 0 rings" guard) | `app.js`, `style.css`, `src/nostr.mjs`, `src/campaign-formats.mjs`, `tests/v41-nostr-sync.test.mjs`, `tests/v48-integration.test.mjs`, `version.json` | done | — (direct, coordinator) |
