# V46 — Template popularity detection via Nostr

Status: claimed
Branch: `task/V46-template-popularity`
Files owned: `src/popularity.mjs`, `tests/v46-popularity.test.mjs`, `tasks/V46-template-popularity.md`

## Why Nostr (answering Cade's question)

X deep links alone cannot measure which campaign templates are popular — a link is opaque, with no clicks, no counts, no server, and no X API without paying them. Nostr can: every time a ring runs a template and syncs to a relay, its signed campaign event (kind 30078) and its post/Enscryption events (kind 1) carry the tag:

```json
["t", "cabal:format:<formatId>"]
```

Popularity is simply the aggregate count of public relay events referencing a template: distinct rings using it (deduped by campaign pubkey) plus assists (kind 1 events carrying the tag, used only as a tiebreaker and never displayed).

## What shipped

- `src/popularity.mjs` (pure functions + best-effort relay query helper; imports `KIND_CAMPAIGN` and `KIND_NOTE` from `src/nostr.mjs` without modifying it):
  - `FORMAT_TAG_PREFIX` (`"cabal:format:"`) and `formatTag(formatId)` (`["t", "cabal:format:<id>"]`).
  - `countFormatUsage(events)` -> `Map<formatId, { rings: Set<pubkey>, assists: number }>`.
    - Kind 30078 campaign events: reads `formatId` from parsed JSON `content.formatId` when present, falling back to `["t", "cabal:format:<id>"]`. Dedupes rings by `pubkey` so republishing a campaign event still counts as one ring. Ignores malformed non-empty content.
    - Kind 1 post/assist events: reads `["t", "cabal:format:<id>"]` tags only. Increments `assists` and never adds to `rings`. Dedupes duplicate event IDs across relays.
    - Ignores unknown kinds, missing format references, and malformed inputs; never throws.
  - `sortFormatsByUsage(formats, usageMap)` -> NEW array. Sorts formats with usage first: distinct ring count (desc), assist count (desc), format `id` (asc, deterministic). Formats with no usage (0 rings and 0 assists, or absent) sort last in their original order. Accepts either a `Map` or a plain object.
  - `usageLabel(usage)` -> `"Used by 1 ring"` / `"Used by N rings"` / `""`. Zero or unknown returns `""`. Never renders `"0 rings"`, assist totals, or rank numbers.
  - `popularityNote()` -> one-line honest-limits copy for V48 to display alongside usage counts.
  - `filtersForFormat(formatId)` -> `{ kinds: [1, 30078], "#t": ["cabal:format:<formatId>"] }` (or `null` for empty/invalid id).
  - `queryFormatUsage(client, formatIds, { timeoutMs })` -> `{ usage, relaysAnswered, relaysTotal }`. Sends one `REQ` carrying `filtersForFormat(id)` for each unique format id, collects events until `EOSE` or timeout, counts usage, and reports how many relays answered out of total. Best-effort: never throws, yields partial results when some relays fail.
- `tests/v46-popularity.test.mjs`: unit and fake-relay integration tests covering all exports and edge cases.

## Exact relay query shape (for V48 integration)

For each format id in `formatIds`, `filtersForFormat(formatId)` produces:

```js
{ kinds: [1, 30078], "#t": ["cabal:format:<formatId>"] }
```

`queryFormatUsage(client, formatIds, { timeoutMs })` passes the array of these filter objects to `client.fetch(filters, { waitMs: timeoutMs })`, which sends a single NIP-01 `REQ` per relay with all format filters OR'd together:

```json
["REQ", "<subId>", { "kinds": [1, 30078], "#t": ["cabal:format:fmt_a"] }, { "kinds": [1, 30078], "#t": ["cabal:format:fmt_b"] }]
```

## Notes for V48 integration

1. **Client lifecycle:** Pass an instance of `createRelayClient({ relays, timeoutMs })` from `src/nostr.mjs` into `queryFormatUsage(client, formats.map(f => f.id), { timeoutMs })`. Close the client if you created a one-off instance, or reuse the app's existing client.
2. **Partial / empty results:** Inspect `{ usage, relaysAnswered, relaysTotal }`. When `relaysAnswered === 0`, treat as "no relay data available" rather than "0 rings use these templates". When `0 < relaysAnswered < relaysTotal`, counts are partial from the answering relays.
3. **Display rules:** Render `usageLabel(usage.get(format.id))` only when non-empty, and display `popularityNote()` wherever usage counts appear. Never display `usage.get(id).assists`, never display `"0 rings"`, and never display a rank number.
4. **No DOM in V46:** `src/popularity.mjs` is pure logic + relay query; no DOM/mount function is needed.

## Honest limits

- Popularity counts **only Nostr-synced usage**. A ring running a template purely through X deep links with nothing published to a relay is invisible to the count.
- Counts depend on which relays are queried. Different relays hold different subsets of events; the count is a signal, not a census.
- No fake counts from X, click tracking, localStorage guesses, or seed numbers. No relay data means no usage label shown.
