# V42 — Sustained-ring integration (coordinator)

Status: done. Merges V38 + V39 + V40 (V41 HELD for the shared-campaign-key
rework, see below). Wires the shell to the v2 model. No lane files touched
except the wiring points listed here.

## Merges (all on main, tests green after each)
- V38 sustained-ring campaign model — merge b5d30c8, version 0.2.10.
  Branch repaired first: the lane's commit 381247a had landed on the
  local V41 branch (shared-tree race); cherry-picked onto a rebuilt
  `task/V38-campaign-model` as d445fbf, pushed.
- V39 sustained-ring feed UI — merge 5eacf32, version 0.2.11. Branch
  was clean (8a77388, own files only).
- V40 sustained-ring journal + intro — merge a4f511a, version 0.2.12.
  Branch was clean (a1a1e76).

## V42 wiring (this task, direct commits on main)
- `tests/v26-migration.test.mjs`: updated to the 7-item per-post
  checklist (postLink replaces anchorLink/ownWordsEveryMember; per-post
  keys `cabal.v2.checklist.<campaignId>.<postId>`; legacy key kept for
  read-only compat). Was the 3-failure tail on V39's run.
- `app.js`:
  - `markPosted` caller in the standalone composer route replaced with
    `markContributed` on the target post (posts[0], the composer's
    default). The old roster `member.quoteText` mutation is gone —
    assists carry quoteText now.
  - `firstPostIdsFor(campaigns)` (exported, tested in t01): composite
    `<campaignId>:<postId>` keys of each ring's founding post.
  - `trackRevision` now per post: the campaign page hooks every
    `[data-composer-post]` slot textarea with its own post's text and
    draft id `${campaignId}:${postId}` + firstPostIds. The old single
    `#campaign-composer textarea` hook was dead (no such id exists
    anymore) and is removed.
  - Standalone composer route: trackRevision + checklist both take the
    target post id; `record('rest', { campaignId, postId })`.
  - `renderHomeExtras` passes firstPostIds to `gamify.mount` so
    Second Wind can fire.
  - Campaign page gets `onPassOn: ({ campaignId, postId }) => record('passon', …)`.
- `src/campaign-page.mjs`: "I passed it on" button under the newest
  quotable post (only for ringmates' posts, never your own). Tap calls
  `ctx.onPassOn`, disables itself, says "Passed on — noted." No count,
  no state display — the receipt is private.
- `src/campaign.mjs`: `pendingMembers` shim DELETED (spec §3b; no
  callers left, no tests referenced it). `markPosted` stays as a
  deprecated wrapper (tested in v21/v28/v38; harmless).
- `.claude/` (untracked junk from the one-shot runners) removed;
  added to `.gitignore` so it never shows again.
- `tasks/INDEX.md`: V38/V39/V40 done; V41 held; V42 done.

## Held: V41 Nostr sync (per-user keys) — DO NOT MERGE AS-IS
Cade's ruling (Nov 23): the keypair belongs to the CAMPAIGN, not the
user. V41 as built (per-user key generation, vault, onboarding) is
superseded. The branch `task/V41-nostr-sync` (rebuilt clean: 04ddf89 +
fde05a8 schnorr rescue) stays unmerged pending the V43 rework:
shared campaign keypair, invisible to the user, link-carried; removal
as a relay-published membership update with the link unchanged. See
spec sections 16–17.

## Open / decisions taken here
- Atom relative time goes stale in the static file until regenerated:
  KEPT (spec asked for it; regeneration refreshes it).
- `unassistedPostsFor` skips the author's own posts (V38's reading,
  matched by V39's fallback): kept.
- V41's Nostr panel is NOT wired into the shell yet — its internals
  change in the V43 rework; wiring lands with the rework.
- Live-browser check NOT done by the coordinator (no browser in this
  lane) — needs a main-agent live check: load the app, open ToonSouls,
  confirm the 3-post feed + comments render with zero console errors.

## Tests
`npm test`: 283/283 green on main at 0.2.12 (before the 0.2.13 bump).
