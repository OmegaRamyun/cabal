# V38 — Sustained-ring campaign model

Status: claimed (implemented, tests green on this branch — awaiting coordinator merge)
Branch: `task/V38-campaign-model`
Spec: `cabal-bench/redesign-sustained-ring.md` sections 1–7, 14–15
Files owned: `src/campaign.mjs`, `src/discovery.mjs`, `src/demo.mjs`, `src/atom.mjs`,
`scripts/generate-atom.mjs`, `data/campaigns.json`, `campaigns.atom`,
`tests/v38-sustained-model.test.mjs`, `tasks/V38-campaign-model.md`

## What shipped
- **Model (campaign.mjs):** posts array + per-post assists. `normalizeCampaign`
  (old anchor-only -> v2, deterministic `pst_` id for the migrated anchor so
  re-migrating is stable; member `posted` state -> assists on posts[0]; roster
  stripped of status/quoteUrl/postedAt/quoteText; idempotent; never throws),
  `validateCampaign` (both shapes), `validatePost`, `addPost`,
  `markContributed` (upsert per handle, case-insensitive; `note` = the
  Enscryption receipt, clipped to 280), `markPosted` (deprecated wrapper on
  posts[0]), `latestPost`, `latestActivity`, `unassistedPostsFor`,
  `postAssists`, `createCampaign` with optional `posts`.
- **`postedCount`** now = DISTINCT handles with at least one assist anywhere in
  the ring. Not an assist count (that would be a ledger).
- **URL recognition:** `detectPlatform`, `parsePostUrl` — hostname/path only,
  no network, never throws. X author from `/<handle>/status/<id>`; Reddit title
  from the slug (`-`/`_` -> spaces, <= 120 chars); everything else platform only.
- **`decodeCampaignLink`** normalizes before validating, so old links decode to v2.
- **Discovery:** rows show "N ringmate(s) has/have contributed" + "active <relative>"
  from `latestActivity`. `isListable`, sorts, `mergeLists` untouched.
- **Demo:** the 3 Starlight campaigns are v2 via `normalizeCampaign`; Next Fest
  gains a Reddit post by Wren with one assist. Campaign `createdAt` moved into the
  past so assists never predate their post.
- **ToonSouls** (`cmp_toon001`): 3 posts (X anchor, Reddit devlog, Instagram clip),
  window null, demo true. `campaigns.atom` regenerated; entry summary = latest post.

## Decisions / spec ambiguities
- `pendingMembers` is kept as a **deprecated shim** (not deleted): `src/home.mjs`
  imports it and is outside this lane, so deletion would break that module's load
  and the suite. V39 removes the caller; delete the shim then.
- `unassistedPostsFor` also **excludes the handle's own posts** (spec text says only
  "no assist from that handle"); an author owes their own post nothing.
- Post `text` is required for x/bluesky only when **adding new** posts (`addPost`,
  `createCampaign`); decoding stays lenient (spec's validation list omits it).
- `markContributed` merges: omitted opts keep the old value, `''` clears one.
- Atom summary embeds relative time vs generation time (spec asks for it), so the
  static file ages until regenerated; `campaignToEntry` takes `now` for tests.
- Existing tests in v21/v22/v24/v25/v28/v31 updated where the model change forces it
  (member status gone, postedCount semantics, atom summary wording).

## Manual check
None needed: pure functions + static data. DOM wiring for the new model is V39.
