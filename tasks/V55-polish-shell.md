# V55 — Polish shell: drop Pico, app shell, tokens, fonts

- **Status:** done
- **Branch:** `task/V55-polish-shell` (base `49a9a9a`)
- **Owner:** Gemini lane (polish round)

## Scope

Drop Pico.css, vendor `modern-normalize` + Fontsource `Cinzel` and `Inter`, build a CSS-grid app shell with a 56px sticky top bar and internal pane scrolling at >=1024px, move `#demo-banner` and `#update-banner` out of the sticky header as non-sticky dismissible strips, remove the duplicate demo-exit button, establish a 4-surface warm obsidian elevation ramp with `backdrop-filter: blur(8px)`, 3–4px radii, 600ms fades, and prune grep-proven dead CSS.

## Files changed

- `vendor/pico.min.css` (deleted)
- `vendor/modern-normalize.css` + `vendor/modern-normalize.LICENSE` (added, v3.0.1, MIT)
- `vendor/fonts/cinzel/cinzel-{latin,latin-ext}-{400,600}-normal.woff2` + `vendor/fonts/cinzel/LICENSE` (added, `@fontsource/cinzel@5.3.0`, SIL OFL 1.1)
- `vendor/fonts/inter/inter-{latin,latin-ext}-{400,500,600,700}-normal.woff2` + `vendor/fonts/inter/LICENSE` (added, `@fontsource/inter@5.3.0`, SIL OFL 1.1)
- `vendor/README.md` (updated with vendored assets, weights chosen, and licenses)
- `index.html` (swapped Pico for `modern-normalize.css`, moved `#demo-banner` and `#update-banner` out of sticky `<header>` into `.app-banners`, added inline SVG favicon, loaded `src/shell.mjs`)
- `style.css` (rebuilt without Pico: `@font-face` for Cinzel/Inter, 4-surface warm elevation ramp, 3–4px radii, `backdrop-filter: blur(8px)`, 600ms route/banner fades, gold DEMO badge, warm inputs with ember focus ring, CSS-grid desktop app shell with internal pane scroll, full-width Campaigns workspace + compact toolbar, pruned dead `.compose-sticky`, `.ring-progress`, `.member-status`, removed `/* Motion identity: Corporate. */`)
- `src/shell.mjs` (pure token/font config exports, duplicate demo-exit button deduplication, non-sticky banner dismiss controls, route scroll reset)
- `tests/v55-shell.test.mjs` (8 unit + static invariant tests)
- `tasks/V55-polish-shell.md` (this doc)

## Files NOT touched

`app.js`, `src/demo.mjs`, `src/graph.mjs`, `src/node-view.mjs`, `src/store.mjs`, `src/discovery.mjs`, `src/campaign.mjs`, `src/nostr.mjs`, `src/home.mjs`, `src/campaign-page.mjs`, `src/campaign-formats.mjs`, `src/intro.mjs`, `tasks/INDEX.md`, `version.json`.

## Acceptance evidence

### Automated tests (`npm test`)
- **459 / 459 passed** (451 baseline + 8 new tests in `tests/v55-shell.test.mjs`, 0 failures).

### Playwright headless smoke check (`localhost:8155`)
- **Sticky topbar height:** `56px` on both desktop (`1280×900`) and mobile (`360×800`), `position: sticky`.
- **Non-sticky dismissible banners:** `#demo-banner` and `#update-banner` are outside `<header>` (`demoInHeader: false`, `updateInHeader: false`, `position: relative`). Duplicate `"Clear demo data"` button removed, leaving `["Start with my own game", "×"]`; clicking `×` hides the banner cleanly (`dismissedHidden: true`).
- **Fonts loaded & resolved:** `document.fonts` reports `Cinzel:400`, `Cinzel:600`, `Inter:400`, `Inter:500`, `Inter:600`, `Inter:700` loaded. Computed `font-family` on `.brand` and `main h2` resolves to `Cinzel`; `body` resolves to `Inter`.
- **Full-width Campaigns workspace:** `main` width `1280px`, `.node-view` width `1225px`, `.node-svg` fills `889×685` below the compact single-row toolbar (`top: 122px`).
- **Heading clipping check:**
  - Ring page (`#/campaign/cmp_demo_launch`): `headerBottom: 56`, `h2Top: 77`
  - Create Ring (`#/rings` via Start a ring): `headerBottom: 56`, `h2Top: 97`
  - Create Template (`#/campaigns/new`): `headerBottom: 56`, `h2Top: 76`
- **360px mobile horizontal overflow:** `scrollWidth === clientWidth === 360` (`overflow: false`) on Home, Campaigns, Ring, and Create Template.
- **Errors:** 0 pageerrors, 0 app/asset console errors (only expected offline proxy WebSocket failures to public Nostr relays `wss://nos.lol/` and `wss://relay.damus.io/`).

### Manual DOM checks
- Verified visually via Playwright screenshots that `backdrop-filter: blur(8px)` lets the subtle ember canvas show through panels/topbar, gold DEMO badge replaces lemon `#f5c518`, Field Journal milestones render without hanging square bullets, and desktop panes scroll internally while keeping the 56px top bar and footer anchored.

### Screenshots
Saved to `~/workspace/cabal-bench/`:
- `polish-v55-home-desktop.png`
- `polish-v55-home-mobile.png`
- `polish-v55-campaigns-desktop.png`
- `polish-v55-campaigns-mobile.png`
- `polish-v55-ring-desktop.png`
- `polish-v55-create-ring-desktop.png`
- `polish-v55-create-template-desktop.png`
