# V62 (+V63, +V70) — Merged Creation, Invite Prompt & Debris Sweep

Status: done
Branch: `task/V62-create-merge`
Base: `376b579` (v0.2.34)

## Summary
- **V62 — Merged creation screen & model (`src/campaign.mjs`, `src/home.mjs`):**
  - Dropped the store-link requirement from `validateGameSetup` (exported from both `src/campaign.mjs` and `src/home.mjs`) and `validateCampaign`.
  - Allowed rings with **no anchor post / no initial posts** (`posts: []`, `anchorPost: undefined`) across `createCampaign`, `validateCampaign`, `normalizeCampaign`, `encodeCampaignLink`/`decodeCampaignLink`, and `addPost`.
  - Merged setup + ring creation into one screen in `src/home.mjs` (`renderCreate`) with **2 required fields only**: Game name and Ring name.
  - **Tags preserved** as a visible optional comma-separated field on the creation form and displayed on the ring page header (per Cade's Nov 23 ruling).
  - Store links (Steam / itch.io) and first post (URL + platform + text) live in an optional collapsible section ("add now or later on the ring page").
  - Extended `parsePostUrl` in `src/campaign.mjs` to extract handles from Bluesky (`/profile/<handle>/post/<id>`), Threads (`/@<handle>/post/<id>`), and TikTok (`/@<handle>/video/<id>`) in addition to X and Reddit. Pasting a post URL infers the platform and autofills the handle.
  - **Never fabricates a handle**: removed the `'@' + game.name...` fallback that produced `@testgame`. Skipping the handle stores `members[0].handle = ""` and `store.me = {name, handle: ""}` (corrected by the smoke re-test: `store.me = null` left the creator a stranger to their own ring — V64 routed them to the invite landing and joining appended a second member, so the V63 1-member invite prompt never showed. The empty-handle `me` is recognised by `isInviteLanding`'s unclaimed-seed check; the handle itself is still backfilled on the first post, as before).
  - Exported pure helpers: `validateGameSetup`, `normalizeHandle`, `validateRingCreation`, `buildMergedCreation`.

- **V63 — Post-creation invite prompt & ring-page cleanup (`src/campaign-page.mjs`):**
  - Added pinned invite card (`#ring-invite-prompt`) at the top of the ring page whenever `shouldShowInvitePrompt(campaign)` is true (exact 1 member): *"Your ring is live. It needs other devs."* with a read-only invite link field (`#ring-invite-prompt-link`) and `[Copy invite link]` button (`#ring-invite-prompt-copy`) wired to the existing `shareLinkFor` + `copyShareUrl` helpers.
  - Hid the empty `"No templates running yet."` block on new 1-member rings via `shouldShowTemplatesSection(campaign)` — the Templates section renders once at least one template is running OR the ring has 2+ devs (multi-template V58–V60 model untouched).
  - Added desktop centered single-column wrapper class `campaign-page--centered` (`RING_COLUMN_CLASS`) to `<section class="campaign-page campaign-page--centered">`.

- **V70 — Debris sweep (`src/home.mjs`):**
  - Killed the `"Your turn · All caught up"` pill on accounts with no activity (`shouldShowTurnSection` returns `'none'` when there are no rings or no posts across the user's rings).
  - Hid `"Explore Network ›"` while the user has no rings (`shouldShowExploreNetwork`).
  - Moved the ⓘ ring explainer out of `#start-ring-info` popover into plain text on the first line of the page (`<p class="ring-explainer-line">`).

## Files changed
- `src/campaign.mjs`
- `src/home.mjs`
- `src/campaign-page.mjs`
- `tests/v62-create-merge.test.mjs` (new)
- `tasks/V62-create-merge.md` (this file)

## Shell wiring needed (coordinator-owned `style.css` — NOT edited in this branch)
1. **Desktop centered single-column ring page (V63):**
   In `style.css` (`@media (min-width: 1024px)`), `main.app-main:has(#campaign-extras:not(:empty))` currently forces a `minmax(0, 1fr) 350px` two-column grid even when `#campaign-extras` is `[hidden]` (on Feed and Members tabs), leaving a ~350px empty right rail. Add:
   ```css
   .campaign-page--centered {
     max-width: 48rem;
     margin: 0 auto;
   }
   @media (min-width: 1024px) {
     main.app-main:has(.campaign-page--centered):has(#campaign-extras[hidden]) {
       display: block;
       overflow-y: auto;
       padding: 1.25rem;
     }
     main.app-main:has(.campaign-page--centered):has(#campaign-extras[hidden]) > #view {
       height: auto;
       overflow: visible;
       padding: 0;
     }
   }
   ```
2. **Pinned invite prompt card (V63) & inline explainer (V70):**
   ```css
   .ring-invite-prompt {
     border: 1px solid var(--cabal-border-strong, var(--cabal-hairline));
     border-radius: var(--cabal-radius-md, 0.5rem);
     padding: 0.9rem 1rem;
     margin-bottom: 1rem;
     background: var(--cabal-surface-elevated, rgba(255, 255, 255, 0.03));
   }
   .ring-invite-prompt-copy {
     margin: 0 0 0.6rem;
   }
   .ring-invite-prompt-row {
     display: flex;
     gap: 0.5rem;
     align-items: center;
     flex-wrap: wrap;
   }
   .ring-invite-prompt-input {
     flex: 1 1 14rem;
     min-width: 0;
   }
   .ring-explainer-line {
     margin: 0 0 0.75rem;
     color: var(--cabal-muted);
     font-size: 0.9rem;
   }
   .create-optional-details {
     margin: 0.5rem 0;
   }
   ```

## Legacy test updates needed on merge (coordinator-owned test files — NOT edited in this branch)
Because V62 intentionally drops the store-link and anchor-post requirements, 3 pre-V62 test files assert the superseded rules:
1. `tests/v22-home.test.mjs:58` — `validateGameSetup: at least one store link required` (now optional).
2. `tests/v21-campaign.test.mjs:54,55,60,80` — asserts `game.links` required and `posts`/`anchorPost` required (now optional).
3. `tests/v38-sustained-model.test.mjs:109` — asserts `validateCampaign({ ...v2, posts: [], anchorPost: undefined }).length > 0` (now valid).
4. **Pre-existing clock-drift bug** (unrelated to V62): `tests/v38-sustained-model.test.mjs:245` (`unassistedPostsFor`) calls `ring()` which stamps `p0.createdAt = new Date().toISOString()`, then adds `p1` with hardcoded `createdAt: "2026-11-24T00:00:00Z"`. On/after `2026-11-24T00:00:00Z`, `p0` is newer than `p1`, flipping the expected order.

## Manual DOM checks
- Cold load (no `cabal.v2.game`): Home opens directly into the merged creation form with plain-text ring explainer on line 1, Game name + Ring name required, Tags + Handle visible & optional, and optional store-links/first-post disclosure.
- Submit with ONLY Game name + Ring name (e.g. "Test Game" + "Launch Ring") -> navigates directly to the ring page; verify:
  - Pinned invite card appears at top: *"Your ring is live. It needs other devs."* with read-only link and working `[Copy invite link]` button + toast.
  - No `"No templates running yet."` block is shown.
  - Members tab shows `"Test Game"` with NO fabricated `@testgame` handle.
  - Tags entered during creation appear in the ring header subtitle row.
- Paste an X / Bluesky / Threads / TikTok post URL in the optional post field (or in "Add a post" on the ring page) -> platform auto-selects and handle autofills.
- On Home dashboard with 0 rings or 0 posts: verify no `"Your turn · All caught up"` pill and no `"Explore Network ›"` link; verify ⓘ popover is gone and plain-text explainer is on the first line.
- Once a 2nd dev joins the ring: verify the pinned invite card disappears and the Templates section appears.
