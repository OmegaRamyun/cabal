# V59 — Adopt Template UI (Two Entry Points)

Status: done
Branch: `task/V59-adopt-template-ui`
Base: `0cc0686` (v0.2.31)

## Summary
- **V58 contract shim (`src/campaign-formats.mjs`):**
  - Implemented local contract-exact `formatIdsForRing`, `formatIdForRing` (legacy alias), `adoptTemplate`, `removeTemplate`, and multi-template `ringsRunningFormat` so V59 builds and tests cleanly before V58 merges. V60 integration can keep or swap in V58's versions directly.
- **Entry Point 1 — Format page (`src/campaign-formats.mjs`):**
  - Added "Run this template in my ring" button beside "Start a ring" in `.cabal-page-header-actions`.
  - Pure helpers: `isRingMember(ring, me)`, `adoptableRingsForFormat(formatId, myRings, me)`, `adoptFormatIntoRing(ring, formatId, me)`.
  - Opens a ring picker modal (desktop) / bottom sheet (`< 900px`, matching V56 `.node-panel`) listing rings from the local store where `me` is a non-removed member. Adopts into the chosen ring, persists to store, invokes optional `ctx.onAdopt(ring, formatId)`, and navigates to that ring. Already-running rings show a `Running` pill and act as a safe no-op.
- **Entry Point 2 — Ring page (`src/campaign-page.mjs`):**
  - Added `<section class="ring-templates">` between the ring header and tabs: chips for running templates (each linking to `#/format/<id>`) plus a member-only "Browse & adopt template" button.
  - Pure helpers: `canAdoptTemplate(campaign, me)`, `canRemoveTemplate(campaign, me)`, `removeTemplateConfirmCopy(tagline)`, `runningTemplateChips(campaign, formats, me)`, `pickableFormatsForRing(campaign, opts)`, `adoptTemplateInRing(campaign, formatId, me)`, `removeTemplateFromRing(campaign, formatId, me)`.
  - Template picker admits listable formats (run by >= 1 listable ring or positive relay usage) plus the user's own formats (`loadUserFormats()`).
  - Removal is creator-only behind `confirm`, keeps all past posts and assists, updates local store, and fires optional `ctx.onTemplateRemoved`. Adoption fires optional `ctx.onTemplateAdopted`.
- **Styles (`style.css`):**
  - Appended V59 styles using V55–V57 shell tokens (`.ring-templates`, `.template-chip`, `.adopt-picker-backdrop`, `.adopt-picker-sheet` as centered dialog on desktop and bottom sheet `< 900px` with drag handle matching V56).

## Files changed
- `src/campaign-formats.mjs`
- `src/campaign-page.mjs`
- `style.css`
- `tests/v59-adopt-ui.test.mjs` (new)
- `tasks/V59-adopt-template-ui.md` (this file)

## Manual DOM checks (for V60 live verification)
- Format page (`#/format/fmt_algoigno`): verify "Run this template in my ring" sits cleanly beside "Start a ring" on desktop and wraps cleanly at 360px; opens bottom sheet on mobile (`< 900px`), adopts into chosen ring, navigates to `#/campaign/<id>` showing the new chip.
- Ring page (`#/campaign/<id>`): verify running template chips link to `#/format/<id>`, "Browse & adopt template" opens bottom sheet on mobile (`< 900px`) above the bottom tab bar, creator sees `×` remove behind `confirm` while non-creator member does not, and removing a template leaves posts/assists intact.
