# V57 — Nav + Ring Page + Forms + Copy

Status: done
Branch: `task/V57-nav-forms-copy`
Base: `49a9a9a` (v0.2.28)

## Summary
- **Navigation & wayfinding (`src/nav.mjs`, minimal edits in `app.js`):**
  - Inline Lucide SVGs (`house`, `share-2` network, `wrench`, `chevron-left`, `share`, `copy`, `info`, `x`) with ISC attribution comment — no icon font, no CDN.
  - Unified desktop topbar nav style (icon + label, ember/gold active indicator).
  - Fixed mobile bottom tab bar (`<= 768px`) with visible icon + label (`Home`, `Network`, `Tools`) mounted from JS (no `index.html` edits).
  - Contextual back chevron + route title bar (`#detail-back-bar`) on detail routes.
  - Origin-aware route→tab mapping (`sectionForRoute` / `navItemForRoute`) so rings reached from Network/Campaigns light the Network tab and point back to Network.
  - Scroll reset (`window.scrollTo(0, 0)`) on every `route()`.
- **Home density (`src/home.mjs`, `src/gamify.mjs`):**
  - Dismissible first-run primer card at the top of Home (`cabal.v2.primerDismissed`).
  - Replaced duplicate "Latest activity" full card with a clickable one-line activity strip.
  - Collapsed empty "Your turn" dashed box into a compact status pill (`Your turn · All caught up`).
  - Dense clickable My Rings list rows (title, dev count, last activity, right status pill, hairline dividers, whole-row click + keyboard activation).
  - Fixed Field Journal list-marker specificity (`list-style: none !important`) and raised unreached milestone contrast from `opacity: 0.45` to WCAG AA (`opacity: 1`, `#c5baa8`/`#9e9382` on `#14100d`) with sigil indicators and Primer progress meter.
- **Ring page (`src/campaign-page.mjs`):**
  - Detail header with prominent ring title, game subtitle + platform chips, overlapping member avatar stack, and Share icon-button with copy toast (`#cabal-toast`).
  - `Feed / Members / Sync` tabs; Nostr sync console hidden by default and tucked into a collapsed `<details class="ring-sync-sheet">` under the `Sync` tab.
  - Share link uses copy button + toast; raw URL input tucked under collapsed `<details>`; "This link is long" downgraded from bold red `.form-error` to plain muted `.ring-share-note`.
  - Post head stacks cleanly on two lines at 360px; in-feed "Pass it on" essay collapsed into compact bar + `<details>`.
- **Forms (`src/home.mjs`, `src/campaign-formats.mjs`):**
  - Shared `.cabal-page-header` and `.cabal-form` (`max-width: 36rem`, 2-col `.cabal-form-row`, `.cabal-form-footer`, fixed `.btn-sm`/`.btn-md` sizes).
  - Submit buttons sit above the fold on both Create Ring (`bottom: 484px`) and Create Template (`bottom: 871px`) at `1280×900`.
- **Copy standardization:**
  - Standardized terminology across views: **Ring** (dev group/feed), **Template** (reusable post format), **Network** (node map).
  - Shortened ledes; moved `START_RING.help` into an info-icon popover (`popovertarget`).
  - Shortened demo banner copy and hid duplicate Clear button; styled relay usage warnings as status chips; moved footer disclaimer to Tools & Terms.

## Files changed
- `src/nav.mjs` (new — nav chrome, Lucide inline SVGs, route→tab & back-bar helpers, toast)
- `src/home.mjs` (dense rows, primer card, activity strip, quiet turn pill, shared `.cabal-form`)
- `src/campaign-page.mjs` (detail header, avatar stack, share toast, Feed/Members/Sync tabs, 2-line post meta, collapsed pass-it-on)
- `src/campaign-formats.mjs` (shared `.cabal-form`, compact rhythm, template copy)
- `src/gamify.mjs` (milestone sigils + Primer progress bar)
- `src/intro.mjs` (Ring / Template / Network copy alignment)
- `app.js` (minimal nav-only edits + Sync tab visibility toggle + Tools disclaimer note — flagged below)
- `tests/v57-nav-forms.test.mjs` (new — 11 unit tests for V57 pure helpers)
- `tasks/V57-nav-forms-copy.md` (this file)
- CSS seam deliverable (outside repo): `/home/hatch/workspace/cabal-bench/v57-nav-styles.css`

## Flagged `app.js` edits
- Imported `* as navChrome from './src/nav.mjs'`.
- Added `lastSection` tracking + `navItemForView(view, opts)` delegation to `navChrome.navItemForRoute`.
- Added `window.scrollTo(0, 0)` and `chrome?.update(...)` in `route()`, plus title updates in `renderCampaign` and `renderFormat`.
- Wrapped `nostr.mount` in `renderSyncPanel` inside a collapsed `<details class="ring-sync-sheet">` and toggled `#campaign-extras.hidden` via `onTabChange` from `campaignPage.mount`.
- Removed bottom-of-Home primer link from `renderHomeExtras` (now a dismissible card at the top of Home) and added Terms/disclaimer note in `renderTools`.
- Mounted `chrome = navChrome.mountChrome(document)` in `start()`.
- Graph wiring and `#c=` link intent untouched.

## Acceptance & Verification Evidence
- **Unit tests:** `npm test` — **462/462 pass** (451 baseline + 11 new tests in `tests/v57-nav-forms.test.mjs`).
- **Playwright headless smoke (localhost + `addStyleTag` with `v57-nav-styles.css`):** **17/17 pass**:
  - Mobile (360×800) bottom tab bar visible with labels (`Home`, `Network`, `Tools`), 0px horizontal overflow.
  - Dense rows render with whole-row click, dismissible primer card, quiet turn pill, no journal bullets (`listStyleType: "none"`), WCAG AA milestone opacity (`1`).
  - Navigating resets scroll to top (`before=400`, `after=0`).
  - Back chevron visible on ring page; rings reached from Campaigns light the `Network` tab and point back to `#/campaigns`.
  - Ring tabs switch (`Feed` / `Members` / `Sync`); Nostr sync hidden on Feed and collapsed in `<details>` on Sync.
  - Share copy button shows `.cabal-toast.is-visible`; long-link warning renders as `.ring-share-note`.
  - Post meta stacks cleanly on 2 lines at 360px.
  - Create Ring submit button above fold at 1280×900 (`bottom: 484px`); Create Template submit button above fold at 1280×900 (`bottom: 871px`).
  - Zero console errors, zero pageerrors.

## Screenshots
- `/home/hatch/workspace/cabal-bench/polish-v57-home-mobile.png`
- `/home/hatch/workspace/cabal-bench/polish-v57-ring-mobile.png`
- `/home/hatch/workspace/cabal-bench/polish-v57-ring-desktop.png`
- `/home/hatch/workspace/cabal-bench/polish-v57-create-form.png`
