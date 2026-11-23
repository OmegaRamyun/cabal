# V39 — Sustained-ring feed UI: campaign page, composer, checklist, home

Status: claimed
Branch: `task/V39-sustained-feed`
Spec: `/home/hatch/workspace/cabal-bench/redesign-sustained-ring.md` (sections 2a, 4, 8–10, 15)
Files owned: `src/campaign-page.mjs`, `src/quote-composer.mjs`, `src/checklist.mjs`, `src/home.mjs`, `tests/v39-sustained-feed.test.mjs`, `tasks/V39-feed-ui.md`

## What changed

### 1. Campaign page (`src/campaign-page.mjs`, spec sections 2a, 4, 9)
- Rebuilt as a **feed** of posts sorted newest first (`feedPosts`). The founding post (`posts[0]`) renders as a regular feed card, not a special shrine.
- Each post card shows author + avatar, platform label (all 8 spec platforms), optional kind tag, relative time, text/context, and a "View post" link.
- Under each card, assists render directly as **comments** (the Enscryption): `Handle: <note or quoteText>` plus the contribution link when present (`View quote` for X/Bluesky, `View share` otherwise). No separate receipts list, no ledger view, no assist counts or progress bars, no window display.
- Two-tier per-post action for ring members:
  - X / Bluesky post not yet assisted -> inline `quoteComposer` mounted for THAT post.
  - Other platform not yet assisted -> generic "I contributed" form with one-line Enscryption input (`What did you do?`, max 280 chars, prompted not demanded) and optional share-URL plain text input.
  - Already assisted -> shows `Contributed` (plus link when provided).
- **Add a post** form (any member): paste a URL -> `parsePostUrl` passively prefills platform, author, and title/text without locking any field; manual entry always works; appends via `addPost` and re-renders.
- **Pass-it-on nudge**: follows the NEWEST post with a quotable/shareable contribution URL (`newestQuotablePost`), keeping the V37 guardrail copy (`#Ring` channel named, only what you genuinely like, never an obligation, never a count).
- Ring section shows the roster only (no per-member status, no counts).

### 2. Composer (`src/quote-composer.mjs`, spec sections 8, 15)
- `mount()` accepts `ctx.post` (defaulting to `campaign.posts[0]` then `campaign.anchorPost`).
- Renders **only** for `x` / `bluesky` target posts (`isComposerPlatform`); returns `{ supported: false, ... }` for other platforms without touching the DOM.
- `comparisonTexts(campaign, me, post)` and `scoreDraft(draft, campaign, me, post)` score strictly against the target post's text + other members' `quoteText` on THAT post only (excluding `me` case-insensitively).
- `intentUrl(platform, draft, post)` takes the target post (with legacy campaign fallback).
- Revision tracking wires `trackRevision` with composite `draftId` = `${campaignId}:${postId}` (`composerDraftId`).
- Similarity gate remains strictly advisory (warnings only, never blocks, never writes copy, never auto-posts).

### 3. Checklist (`src/checklist.mjs`, spec sections 10, 15)
- Per-post storage key: `cabal.v2.checklist.<campaignId>.<postId>` via `checklistKey(campaignId, postId?)` (omitting `postId` returns the legacy campaign key for read-only compat).
- 7-item set: the 6 pre-post items (unchanged) + `postLink` (`"This post's link works"`). Retired `anchorLink` and `ownWordsEveryMember`.
- `createCampaignChecklist`, `loadCampaignChecklistState`, `saveCampaignChecklistState`, and `isCampaignChecklistReady` operate on the 7-item per-post shape.
- `mount()` accepts `ctx.postId` and fires `ctx.onReadyChange(ready, { campaignId, postId, state })` per post.

### 4. Home (`src/home.mjs`, spec section 9)
- Removed `pendingMembers` import/re-export (deleted in V38).
- "Your turn" uses `yourTurnPosts(campaigns, me)` backed by `unassistedPostsFor(campaign, handle)`, newest first across my campaigns. Empty-state copy: `"No new posts to assist."` (never "owed", never a ledger).
- Live campaign / ring cards show latest activity (`latestActivity`) and ring roster size, never a window or posted/total meter.
- "Start a campaign" creates open-ended rings (`window: null`) across all 8 platforms.

## Cross-lane bridge note
- `src/campaign-page.mjs` and `src/home.mjs` import `./campaign.mjs` via namespace (`import * as campaignModel from './campaign.mjs'`) so they seamlessly call V38's exports (`addPost`, `markContributed`, `parsePostUrl`, `unassistedPostsFor`, `latestActivity`, `latestPost`, `postAssists`) once V38 is merged while also running cleanly pre-merge with spec-faithful fallbacks.

## Manual check note (DOM behaviour)
Serve the repo (`python3 -m http.server 8000`) and verify in a browser:
1. Open Home with demo data: "Latest activity" shows the most recently active ring without a window; "Your turn" lists unassisted posts newest first (or `"No new posts to assist."` when none).
2. Open a multi-post campaign (e.g. ToonSouls): posts appear newest first; founding post is a normal feed card; comments (`Handle: <receipt>`) appear directly under their post with `View quote` (X/Bluesky) or `View share` (other platforms).
3. On an unassisted X/Bluesky post, verify the inline composer appears, live gate warns without blocking intent links, and "I posted it" records the assist as a comment.
4. On an unassisted Reddit/Instagram post, verify the generic "I contributed" control appears with "What did you do?" (optional, max 280 chars) and optional share-URL input, and submitting records the assist as a comment.
5. In "Add a post", paste an X or Reddit URL -> verify platform/author/title prefill and remain hand-editable; paste an unknown URL -> fill by hand and submit -> verify the new post appears at the top of the feed.
6. Verify the `#Ring` pass-it-on nudge appears only under the newest post that has a contribution link.
7. Open a per-post checklist: verify 7 items (`postLink` present, `anchorLink`/`ownWordsEveryMember` absent), independent persistence across two posts in the same campaign, and `onReadyChange` firing with `{ campaignId, postId }`.
