# V25 — Demo mode + disclaimers and terms

Scope: fictional demo seed data (on by default on first load, clearly labeled, clearable) and the disclaimer/terms text.
Files owned: `src/demo.mjs`, `src/terms.mjs`, `tests/v25-demo.test.mjs`
Status: claimed
Branch: `task/V25-demo-terms`

## Frozen contract
- Campaign shape is defined in `tasks/V21-campaign-core.md` (same shape; do not redefine it).
- ALL demo content must be fictional. No real games, no real people, no real handles. Invent everything.
- Store keys (same as V21): `cabal.v2.demo` ('on'/'off'), `cabal.v2.game`, `cabal.v2.campaigns`, `cabal.v2.me`. Read/write localStorage directly with try/catch (V21's store module replaces these reads at integration).

## `src/demo.mjs`
- `demoGame()` — fictional game: "Starlight Salvage", a cozy space-salvage roguelite. Links: itch `https://starlight-salvage.itch.io/starlight-salvage` (fictional), tags [roguelite, cozy, space].
- `demoCampaigns()` — exactly 3, all `demo: true`, all for Starlight Salvage:
  1. LIVE "Launch week push" — window covers today, anchor post on X by the fictional dev, 4 members: 2 posted (with quote URLs), 2 pending.
  2. UPCOMING "Demo day push" — window starts tomorrow, 3 members, 0 posted.
  3. POPULAR "Steam Next Fest push" — 6 members, 5 posted.
  Fictional member names/handles only (e.g. "Moss", "Pip", "June", "Rook", "Sable", "Fern"). Anchor post texts are short, human, fictional.
- `seedDemo(store)` — writes the demo game + campaigns + me (a fictional "you" is NOT set; me stays empty) only when no `cabal.v2.demo` key exists (first load). Sets demo flag 'on'.
- `clearDemo(store)` — removes all demo:true campaigns and the demo game, sets demo flag 'off'.
- `DEMO_BADGE = 'DEMO'` constant; every demo render must show it (export a helper `demoBadge(campaign)` returning 'DEMO' or '').
- `mount(rootEl, ctx)` — renders a demo banner: "DEMO MODE — fictional example data. [Clear demo data] [Start with my own game]". The buttons call ctx.onClear / ctx.onStartFresh.

## `src/terms.mjs`
- `TERMS_TEXT` — plain-language disclaimer + terms, visible in the app. Must state: Cabal is a tool for promoting your own games; it does not post for you; you are responsible for what you post and for following each platform's rules; coordinated promotion must be honest, human-written, in your own words, disclosed; do not use it to harass, brigade, spam, or target anyone; the tool is provided as-is, without warranty; the author is not responsible for how anyone uses it; a disclaimer states the terms, it is not a shield. No legal jargon beyond what is needed. No SCT codes.
- `mount(rootEl)` — renders the terms text with a heading.

## Acceptance
- `tests/v25-demo.test.mjs` covers: demoCampaigns() returns 3 with the right live/upcoming/popular shape (use fixed dates relative to a passed `now`), seedDemo only seeds when flag absent, clearDemo removes demo items only, TERMS_TEXT contains the required points (harassment, as-is, own games, human posting).
- `npm test` green on the branch. Do NOT touch index.html, app.js, style.css, tasks/INDEX.md, or any other track's files. Do NOT merge. Push the branch and report: branch, files, test count, the fictional names used.
