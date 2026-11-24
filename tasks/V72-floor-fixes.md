# V72 — Floor Fixes (Hallmark + MWG audit, 2026-11-24)

Status: done
Branch: `task/V72-floor-fixes`
Base: `0223f53` (v0.2.39)

## Summary

Coordinator lane: `style.css`, `index.html`, `app.js` (plus this file and the
acceptance test). Implements the audit's ranked Floor first, then the cheap
trailing items that live in coordinator-owned files. The `src/` copy fixes
(em-dash `src/first-run.mjs:9`, middle dot `src/campaign-formats.mjs:446`,
middle dot `src/nostr.mjs:874`) landed in the V73a/V73b worker lanes.

- **H1 primary-button contrast (3.82:1 -> 4.5:1+):**
  - Resting CTA background: `--cabal-ember` `#c8501e` -> `--cabal-ember-deep`
    `#a84318`. Bone-bright `#f5ead9` on ember-deep = **5.07:1**.
  - Hover CTA background: ember-deep -> new token `--cabal-ember-cta-hover`
    `#8f3712`. Bone-bright on `#8f3712` = **6.48:1**.
  - Sites: primary/submit/quote-posted buttons (`style.css:402` resting,
    `:408` hover), `.cabal-update-refresh` (`:636`), `.node-action-start`
    (`:1470` + `:1474` hover, was `#d85a26` = 3.26:1),
    `.node-panel-open` (`:1920` + `:1926` hover, same), sticky
    `.ringless-cta` (`:3481`, was bare `#fff` on ember = 4.54:1 marginal,
    now bone-bright on ember-deep = 5.07:1). The `#f4ece1` text on those
    buttons is now `var(--cabal-bone-bright)`.
- **H2 overflow-x (`style.css:2198`):** `overflow-x: hidden` -> `clip` on
  `html, body`. The correct `clip` was already at `:175`; `hidden` broke
  sticky. One word.
- **FAIL 34 extra, found on re-run:** `.adopt-picker-sheet` width
  `min(30rem, calc(100vw - 2rem))` -> `calc(100% - 2rem)` (`style.css:3258`).
  Same defect class found while here: `.ringless-cta` desktop
  `max-width: calc(100vw - 2rem)` -> `calc(100% - 2rem)` (`style.css:3516`).
  No `100vw` remains in `style.css`.
- **H4 token lift (gate 48):** sloplint on main reported 163 FAIL 48s in
  `style.css` (audit said 177 across 3 files incl. vendored
  `modern-normalize.css`). This lane: **116 `var(--x, <literal>)`
  fallbacks dropped** to bare `var(--x)` (fallback only ever applied if
  the token were undefined; every token is defined) **+ 65 bare literals**
  routed to tokens. Zero hex/rgba literals remain past the token block
  (verified by sloplint re-run and by the acceptance test's file scan).
  - 32 new tokens in `:root` (see Files changed / test for the full list):
    `--cabal-ember-cta-hover`, `--cabal-error`, `--cabal-muted-light`,
    `--cabal-bone-soft`, `--cabal-bone-dim`, `--cabal-bone-mid`,
    `--cabal-mono`, `--cabal-ember-faint/mist/line`, `--cabal-gold-faint/glow`,
    `--cabal-hairline-wash`, `--cabal-ground-veil`,
    `--cabal-surface-elevated` (was only ever a `var()` fallback at `:3540`;
    the token did not exist), `--cabal-surface-wash`,
    `--cabal-white-faint/soft`, `--cabal-scrim`, `--cabal-posted-line/wash`,
    `--cabal-avatar-0..5`, `--cabal-shadow-sm/lg/strong/sheet`.
  - Near-duplicate alphas consolidated where the delta is visually
    negligible (documented, reviewable): ember 0.06/0.08 -> faint 0.08;
    ember 0.10/0.14 -> mist 0.12; ember 0.42 -> line 0.45; ember 0.18 ->
    soft 0.16; gold 0.06/0.08/0.10 -> faint 0.08; surface-1 0.88/0.92/0.96
    -> 0.86; ground 0.78/0.84 -> veil 0.80; black 0.55/0.56/0.60 -> scrim
    0.55; hairline 0.50 -> wash 0.55.
  - Exact-value single-use tokens kept where consolidation would change
    the look: avatar hues 0-5, gold-glow 0.55, posted line/wash,
    surface-wash 0.45, shadow-sm/lg/strong/sheet geometries.
  - Fallbacks that hid a *different* value than the token got a real
    token, not a silent drop: `var(--cabal-muted, #a89c8a)` ->
    `--cabal-muted-light`; `var(--cabal-bone, #e4dccf)` ->
    `--cabal-bone-soft`; `var(--cabal-hairline, #3a2f26)` ->
    `--cabal-hairline-strong`.
- **H3 tracked-caps labels (7 sites):** removed `text-transform: uppercase`
  + `letter-spacing` from `.cabal-demo-banner strong` (`:597`),
  `.demo-badge` (`:854`, tracking only), `.quote-anchor-label` (`:1017`),
  `.node-panel-subhead` (`:1793`), `.node-panel-kind` (`:1850`),
  `.section-eyebrow` (`:2493`), `.activity-strip-label` (`:2606`). Labels
  keep their size/weight; they are plain heads now. Source text was
  already sentence case except the DEMO badge — see follow-up below.
- **H5/H6 + meta (`index.html`):** title `Cabal Ring Kit — campaign-first`
  -> `Cabal Ring Kit: campaign-first`; footer middle dot -> comma;
  atom-link title em dash -> colon (same gate-19 class, not flagged);
  added `<meta name="description" content="Cabal is a campaign-first tool
  for indie devs to organize retweet and repost rings around their own
  games. Anonymous, link-invited, no accounts.">`.
- **M2 (`app.js:290`):** `JSON.parse(JSON.stringify(campaign))` ->
  `structuredClone(campaign)`. No `undefined` guard needed: the function
  already returns early when `!campaign` (`app.js:288`).

## Linter verification
- Before (main): sloplint static `175 FAIL, 22 WARN` across `style.css` +
  `index.html` (baseline `/tmp/sloplint-before.txt`).
- After (this branch, full static run): `1 FAIL, 19 WARN` (was `175 FAIL,
  22 WARN` on main). The single remaining FAIL is FAIL 20 (no Hallmark
  stamp — waived per audit: expected for a non-Hallmark project, do NOT
  add). The 19 WARNs are all out of this round's scope: side stripe x8
  (WARN 3, H9 waived), nav shape x1 (WARN 42, H8 waived), glass panel x1
  (WARN 29), dark surfaces x4 (WARN 41, H7 render tier), finish items
  F3 x1 / F7 x3 / F24 x1 (H10-H12). Full output:
  `/tmp/sloplint-after-v72-full.txt`.
- Render tier (run by the coordinator after the merges, puppeteer-core +
  Playwright headless shell via a `--no-sandbox` wrapper):
  `2 FAIL, 3 REFLEX, 20 WARN` across the 2 files + the local URL, with 5
  screenshots in `~/workspace/cabal-wt-merge/.hallmark/shots`. The one new
  FAIL is FAIL 40 (input edge 1.56:1 at 1440px) — real, but out of this
  round's ranked scope; queued as a follow-up in `tasks/INDEX.md`, not
  fixed here. The 3 REFLEXes are not applicable (39b control heights are
  app UI at 38-40px, which the fix note permits; 44c/77 misread an app
  shell as a marketing landing page).
- REFLEX 26b "no `:active`" is a linter false positive: a global
  `button:active` rule exists at `style.css:389-391`. Nothing to do.

## Files changed
- `style.css` (H1/H2/H3/H4 + FAIL 34 + 32 new tokens)
- `index.html` (title, meta description, footer dot, atom title)
- `app.js` (`:290` structuredClone)
- `tests/v72-floor-fixes.test.mjs` (new, 20 tests)
- `tasks/V72-floor-fixes.md` (new)

## Manual-check notes (DOM-only behavior)
- Open the app: primary buttons (Start a ring, submit actions) read
  bone-bright on deep ember; hover darkens slightly. No visual change
  expected anywhere else — the token lift preserves values except the
  documented alpha consolidations (±0.02-0.04 alpha on tints).
- Scroll a long page: the header stays sticky (H2 `clip` fix).
- Open the adopt picker and the sticky CTA on desktop 1280px: no
  horizontal scrollbar appears (FAIL 34 fix).
- The DEMO badge still renders "DEMO" in capitals: the CSS tracking is
  gone but the source text is caps — see follow-up.

## Follow-ups (not this lane)
- **V75 candidate — "DEMO" source text to sentence case:** the H3 CSS fix
  is complete, but the badge text itself is `"DEMO"` / `"DEMO MODE"` in
  source (`src/demo.mjs:13,315`, `src/home.mjs:527,550`,
  `src/campaign-formats.mjs:438,544,614`, `src/discovery.mjs:117,137`,
  `src/campaign-page.mjs:899,1298`) and 5 test files assert it
  (`tests/v24-discovery`, `v25-demo`, `v45-split`, `v55-shell`,
  `v57-nav-forms`). Changing it touches worker-owned files; needs its own
  task + test updates. Suggested: `"Demo"` / `"Demo mode"`.
- **H7 dark surfaces (WARN 41, render tier) and H10-H12 finish items:**
  out of scope for this round per the audit ranking.
- **H8/H9 waivers:** recorded in `tasks/INDEX.md` by the coordinator at
  integration time (nav shape = app chrome; side-stripe x8 = house style).
