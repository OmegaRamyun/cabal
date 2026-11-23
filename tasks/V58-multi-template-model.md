# V58 — Multi-template rings model (`formatId` -> `formatIds`)

Status: claimed
Branch: `task/V58-multi-template-model`
Brief: `~/workspace/cabal-bench/brief-multi-template.md`
Files owned: `src/campaign-formats.mjs`, `src/campaign.mjs`, `src/graph.mjs` (unchanged; verified via `ringsRunningFormat`), `src/popularity.mjs`, `src/nostr.mjs`, `tests/v58-multi-template-model.test.mjs`, `tasks/V58-multi-template-model.md`

## What changed

- **`src/campaign-formats.mjs`**:
  - `formatIdsForRing(ring)` -> normalized array of valid `fmt_[a-z0-9]{8}` ids (trimmed, lowercased, deduped, order-preserved, invalid dropped). Reads legacy `ring.formatId` first when present, followed by `ring.formatIds`.
  - `formatIdForRing(ring)` -> legacy alias returning `formatIdsForRing(ring)[0] ?? null`.
  - `adoptTemplate(ring, formatId)` -> immutable new ring with `formatId` appended to `formatIds` (legacy `formatId` key dropped). Idempotent on repeat; invalid id or non-object ring returns input unchanged without throwing.
  - `removeTemplate(ring, formatId)` -> immutable new ring with `formatId` removed from `formatIds` (legacy `formatId` key dropped). No-op when not running or invalid.
  - `ringsRunningFormat(formatId, rings)` -> membership test via `formatIdsForRing`.
- **`src/campaign.mjs`**:
  - `normalizeCampaign` migrates legacy `formatId` to the first entry of `formatIds`, defaults rings without formats to `formatIds: []`, and drops the legacy `formatId` key.
  - `createCampaign` forwards `formatId`/`formatIds` into `normalizeCampaign`.
  - `validateCampaign` checks `formatIds` is an array when present.
- **`src/graph.mjs`**:
  - No code edit needed: `buildGraph` already computes local format admission and `runs` edges via `ringsRunningFormat`, so a ring running multiple templates automatically emits one `runs` edge per running template.
- **`src/popularity.mjs`**:
  - Proven needed: `countFormatUsage` previously read only a single `parsed.formatId` or `tagIds[0]`, missing additional templates on multi-template rings. Updated kind-30078 counting to read `parsed.formatId` + `parsed.formatIds` (falling back to all `cabal:format:*` tags when content has none) and add `pubkey` once per template (`Set<pubkey>`).
- **`src/nostr.mjs`**:
  - `formatTagsFor(campaign)` emits one `["t", "cabal:format:<id>"]` tag per running format; `formatTagFor(campaign)` stays as a legacy alias returning the first tag or `null`.
  - `campaignEvent`, `postEvent`, `encryptionEvent` tag with all running formats.
  - `adoptionEvent(campaign, { createdAt }?)` and `publishAdoption(client, campaign, opts?)`: kind-30078 republish signed with the shared campaign keypair (no per-user keys, strips `key`/`nostr`, strictly newer `created_at`).
  - `applyRelayEvents` maps legacy `raw.formatId` and `raw.formatIds` into `c.formatIds` and deletes `c.formatId`.
- **Superseded legacy tests updated** (same discipline as V38):
  - `tests/v41-nostr-sync.test.mjs`, `tests/v48-integration.test.mjs`, `tests/v53-integration.test.mjs` updated where they explicitly asserted the dropped `formatId` key after normalization/relay decode.

## Manual check

None needed: pure model, graph, popularity, and Nostr event functions. DOM adoption UI is V59; demo data + live node-view check is V60.
