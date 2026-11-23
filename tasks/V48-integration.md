# V48 — Rings/Campaigns split integration

Status: done
Coordinator-owned integration (no lane branch). Merges V45 + V46 + V47
and wires the shell: routes, preselected-format creation, popularity
into discovery, the V47 sync-panel patch, and the format tag on Nostr
events (without which V46 counting could never see anything).

## Merges (all verified green in isolated worktrees before merging)

- V45 `task/V45-rings-campaigns-split` (`eff5a4a`) → v0.2.18, 372/372.
  Note: V45's commit swept in `tests/v47-bip340-vectors.test.mjs`
  (V47's worker created it in the shared tree first; identical content
  to V47's own copy, so V47's merge was clean).
- V46 `task/V46-template-popularity` (`0aeb2ce`) → v0.2.19, 345/345
  on its own branch (389 claimed on its mixed tree).
- V47 `task/V47-browser-flags` (`44bedcf`) → v0.2.20, 368/368 on its
  own branch (378 claimed on its mixed tree).
- Shared-tree hazard, for the next round: all three lanes worked in the
  one repo tree and left it on V45's branch with each other's files
  uncommitted. Verified every tree copy matched its pushed commit by
  blob hash before `checkout -f main` + `clean -fd`. Also fixed
  `.git/index` ownership (root-owned 660 after coordinator git commands;
  `chown builder:builder .git/index` + `.git/objects`).

## What V48 wired

- **Routes** (`app.js`): `#/rings[/<formatId>]` (home dashboard, "My
  Rings"; with a format id the create view opens preselected),
  `#/campaigns` (Campaigns view), `#/format/<id>` (format detail).
  `#/discover` stays as the legacy route to the Campaigns view.
  `parseHash`/`navItemForView` extended; the nav markup is unchanged
  (Discover still points at `#/discover`, which renders the same view).
- **Preselected-format creation** (`src/home.mjs`): `ctx.formatId`
  opens the create view, shows a "Running the format: <tagline>" line,
  and sets `campaign.formatId` after `createCampaign` (which builds a
  fresh object and drops unknown fields). app.js validates the id
  against the loaded formats before passing it. `normalizeCampaign`
  keeps the field (clone-through; pinned in test).
- **Popularity into discovery** (`app.js`): `#/campaigns` and
  `#/format/<id>` mount immediately with local data, then re-mount
  with usage counts when `queryFormatUsage` resolves (only if still on
  that route). `usageRingCounts` (exported, tested) converts the V46
  shape (Map id -> {rings:Set, assists:n}) to the V45 shape (Map id ->
  distinct-ring count) — V45's `toUsageMap` drops non-numeric values,
  so the conversion is required, not optional. The honest-limits line
  (`popularityNote()` or the couldn't-reach line) renders with any
  count via `ctx.usageNote` (`src/discovery.mjs`,
  `src/campaign-formats.mjs`).
- **V47 sync-panel patch** (`app.js`): `renderSyncPanel` now takes the
  resolved campaign (static listed campaigns get a panel too — read-only
  without a key) and `onMerged` merges by id via `mergeSyncedIntoStore`
  instead of replacing the whole stored list (the Fetch data-loss bug).
- **Format tag on Nostr events** (`src/nostr.mjs`): `formatTagFor` +
  the tag `["t", "cabal:format:<id>"]` on `campaignEvent`,
  `postEvent`, `encryptionEvent` when the campaign carries a valid
  `formatId`. Without this, V46 counting could never see kind 1 events
  (their content carries no formatId). The id also rides in the
  campaign JSON content (V46's fallback). Tag shape matches
  `FORMAT_ID_RE` in `src/campaign-formats.mjs` (regex duplicated with
  a comment; nostr.mjs stays dependency-free).
- **Styles** (`style.css`): minimal `.format-*` rules on existing
  tokens (gold/muted/display serif).
- **Version**: 0.2.21.

## Verification

- `npm test`: 398/398 green (389 merged + 9 new
  `tests/v48-integration.test.mjs`: routes, nav mapping, usageRingCounts
  seam, event tagging with/without formatId, formatId lifecycle).
- BIP-340: 19/19 official vectors pass (V47, unchanged by V48).
- Manual check (DOM) — Playwright headless shell, local server (see
  coordinator smoke notes in the round report): home renders "My
  Rings"; `#/campaigns` lists the 3 demo formats + ring sections;
  `#/format/fmt_algoigno` renders tagline/guidance/examples/rings +
  "Start a ring" → `#/rings/fmt_algoigno` opens the create view with
  the format line; `#/campaign/cmp_toon001` shows the Sync panel;
  console errors recorded in the report.

## Left open

- Relay query runs once per page load; no refresh button for usage
  counts (a re-query control is a small follow-up if wanted).
- `relaysAnswered === 0` shows the couldn't-reach line; no retry UI.
- The removed-member forgery limit (spec §17c) is unchanged: removal
  is client-enforced filtering, not cryptographic revocation.
- Standing items: APP_VERSION updater race fix (unruled); Threads
  click-test or drop; V35 streaks/roles/badges ruling + AGENTS.md
  amendment.
