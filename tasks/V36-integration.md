# V36 — Integration: wire V33 intro pages, V34 background, V35 journal into the shell (Dark Souls theme)

Status: in progress (coordinator branch)
Branch: `task/V36-integration`
Files owned: `index.html`, `style.css`, `app.js`, `tasks/INDEX.md` (coordinator-only) +
integration touches: `src/store.mjs` (one KEYS line), `src/gamify.mjs`
(`trackRevision` helper), `src/checklist.mjs` (campaign `ctx` for
`mount` + load/save helpers), `tests/t01.test.mjs`, `tests/v30-navbar.test.mjs`,
`tests/v35-gamify.test.mjs`, `tests/v26-migration.test.mjs`

## What this wires
- V33 intro pages on `#/intro`, `#/intro/how`, `#/intro/theory` (parseHash
  branch + route case + `record("page")` on view).
- V34 Shadow Cabal background mounted once in `start()` on
  `document.body`, with the worker's backdrop CSS.
- V35 field journal on Home (below the dashboard) + `record("page" /
  "discover" / "rest" / "revise")` hooks from the shell.
- Dark Souls theme across the shell: forced dark (`data-theme="dark"`),
  ember/gold accents, serif display type, deliberate fades. Readable first:
  the scrim guard and opaque cards stay.

## Decisions
- **Forced dark, not auto.** Cade ordered the Souls menu look across all
  three lanes. The V34 verifier recommended keeping auto theme because
  "there is no Souls theme lane yet" — this round IS that lane: the Souls
  tokens land with the forced dark, so Pico renders dark cards and the
  dark canvas fits (the verifier's clash scenario — dark canvas behind
  light cards — cannot occur). `data-theme="dark"` is set statically in
  `index.html`, so `detectTheme` reads dark at mount; no `data-theme`
  observer is needed for a static attribute. `meta color-scheme` → `dark`.
- **Journal lives in `#home-extras`, NOT inside `#view`.** `home.mjs`
  re-renders by overwriting `rootEl.innerHTML` on interactions (setup
  submit, create flow), so anything appended inside `#view` after
  `home.mount` would be wiped on the next render. `#home-extras` is a
  sibling `<div>` inside `<main>`, populated by `route()` only for the
  home view (emptied on other routes, re-mounted fresh each route so
  milestones never go stale).
- **Rest Point via the composer route, not the tools page.** The tools
  page keeps the generic 6-item checklist (no `ctx` → behavior unchanged).
  The per-campaign 8-item checklist mounts under the quote composer
  (`renderComposer`) with `ctx = { campaignId, onReadyChange }`;
  ready → `record("rest")`. The Voice Card rides along under the
  checklist as a local reference while writing (no skip flag — wrapping
  the 120-line voice section in a conditional was not worth it, and the
  reference posts genuinely help while drafting). `checklist.mount`
  gains an optional second arg — default path is byte-for-byte the old
  behavior.
  Campaign checklist state persists under `cabal.v2.checklist.<id>` via
  new pure `loadCampaignChecklistState` / `saveCampaignChecklistState`
  helpers (node-tested); the mount DOM wiring gets a manual check note
  per AGENTS.md (DOM-only behaviour).
- **Kindled via `trackRevision` in `gamify.mjs`.** Watches one textarea:
  remembers the first draft the gate flags, assesses the current draft
  against it on each input, records `revise` when it kindles, resets on
  empty. Wired in `renderComposer` (via the composer's returned
  `textarea` handle) and in `renderCampaign` for the inline composer
  (queried as `#campaign-composer textarea` after `campaignPage.mount`
  — no V22 file touched; the mount is synchronous, so the query lands).
  Draft id is `composer:<campaignId>` in both places (one draft, one
  journal entry per campaign).
- **`journal` key in `store.mjs` KEYS** so `clearAll()` wipes the journal
  (verifier-confirmed as the right call).
- **Intro nav:** gear menu + footer link to `#/intro`; intro routes map
  to the Home nav item (no separate top-bar item). Intro pages record
  `page` with `pageIds` from `introPageIds()` (the V35 wiring note's
  `INTRO_PAGE_IDS` export does not exist — it is a function).
- **Discover:** `record("discover")` fires in the `navigate` callback
  `renderDiscover` passes to `discovery.mount` (fires on card open).
- **Verifier fixes applied on the lane branches before merge** (see
  `cabal-bench/verify-v33-v35.md`, `cabal-bench/verify-v34.md`):
  - V33: sync copy qualified to current behavior (link adds a campaign
    you do not have; it does not update one you already have; merge-on-open
    is planned, not built), X wording restored to the verified policy
    line, Kickstarter 17% tightened to the anchor, trailing-slash
    normalization in `introPageIdForRoute`.
  - V34: fog alphas raised to 0.45–0.50 and warmed (were banding-level
    under the scrim), 30 fps pacer tolerance (`minFrameMs - 2`), doc
    corrected (zero per-frame allocations holds for `stepField` only).
  - V35: `assessRevision` now needs a verdict transition
    (review/warn → pass) plus kept-trigram share ≤ 0.6 (blocks the
    trim-to-5-words and nonsense-append probes); `record()` guards a
    null payload; 5 kill-list additions (speed badges, decay penalties,
    invite counters, timed quests, collective completion rewards).
  - Known V35 limit, documented in the test: pure filler sharing nothing
    with either draft still kindles — no similarity test can tell filler
    from a genuine from-scratch rewrite; the milestone is private, so
    gaming it only fools the user.
  - V34 finding NOT fixed: the backdrop shows only in the side gutters /
    footer (cards are opaque) — a design consequence, not a bug. Mobile
    gutters are 0.75rem, so it is effectively invisible there; the Souls
    feel on mobile comes from the tokens + intro/journal, not the canvas.

## Open / needs Cade's ruling (NOT decided here)
- The V35 conflict flag stands: `AGENTS.md` bans "points, streaks, or
  rewards for posting/engaging" while the order asked for "streaks/roles/
  badges that reward genuine participation". What shipped is cosmetic
  self-chosen titles + private craft milestones (no post counting, no
  streaks). Participation rewards need his explicit ruling + an AGENTS.md
  amendment.
- APP_VERSION updater baseline race (critique #6): still unruled.
- Short-link ruling (build-whole-thing vs short-links-only): still
  pending; nothing here pre-empts it. The intro copy promises no short
  links, no backend, no accounts.
- Threads: still no ship without a live click-test.

## Manual check note
DOM-only behaviour (Playwright smoke, local `python3 -m http.server`):
`#/intro`, `#/intro/how`, `#/intro/theory` render + nav highlights Home;
background canvas visible in gutters, no console errors, reduced-motion
renders one static frame; journal appears on Home below the dashboard,
title select persists, milestones light up after page/discover/rest/
revise actions; composer checklist persists per campaign and Rest Point
fires when all 8 are checked; Kindled fires after a flagged draft is
genuinely reworked in either composer.
