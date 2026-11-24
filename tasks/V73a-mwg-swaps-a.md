# V73a — Modern Web Guidance Mechanical Swaps, Part A

Status: done
Branch: `task/V73a-mwg-swaps-a`
Base: `0223f53` (v0.2.39)

## Summary
Mechanical swaps from the Modern Web Guidance pass — no behavior change
intended. Three mechanical items, all verified on `origin/main` `0223f53`:

- **M1 (`src/templates.mjs`):** `innerHTML = ''` → `replaceChildren()` at
  3 sites — `mount` (rootEl clear), `render` (picker clear), `render`
  (detail clear). Each is a standalone clear followed by `appendChild`
  calls, so the swap is direct.
- **M2 (`structuredClone`):** `JSON.parse(JSON.stringify(x))` →
  `structuredClone(x)` in three files. `app.js:290` is coordinator-owned
  and was NOT touched. All cloned values are plain JSON data (ISO date
  strings, never Date objects; no functions/Symbols/DOM nodes).
  `package.json` declares `engines.node >= 20`, so `structuredClone` is
  available.
  - `src/campaign-page.mjs:84` — `clone(v)` helper; existing `undefined`
    guard kept verbatim (`v === undefined ? undefined : ...`).
  - `src/campaign.mjs:35` — `clone(v)` helper; same guard kept.
  - `src/nostr.mjs:401` — `cloneCampaign`.
- **Trailing copy fix (`src/nostr.mjs:874`):** removed the middle-dot
  prefix in the removed-members segment — now `` `. Removed: ${...}` ``
  as its own sentence segment; surrounding logic identical.

## Files changed
- `src/templates.mjs`
- `src/campaign-page.mjs`
- `src/campaign.mjs`
- `src/nostr.mjs`
- `tests/v73a-mwg-swaps.test.mjs` (new)
- `tasks/V73a-mwg-swaps-a.md` (new)

## Acceptance test
`tests/v73a-mwg-swaps.test.mjs` — 8 tests, all green (`npm test`:
580/580, baseline 572/572 + 8 new):

- `clone()` helpers via their public callers (the helpers are
  module-private, not exported):
  - `campaign.mjs` via `normalizeCampaign` / `addMember` / `addPost` /
    `removeMember`: deep-copies plain JSON (mutating nested
    `game.links`, `members`, `posts` on the result leaves the source
    untouched), returns `undefined` for `undefined` input (and `null`
    for `null`), keeps ISO date strings as strings.
  - `nostr.mjs` `cloneCampaign` via `loadSnapshot`: deep-copies the
    snapshot (mutating the returned campaign leaves the snapshot
    untouched), keeps ISO date strings as strings.
- `campaign-page.mjs` `clone(v)` is NOT reachable via any public API:
  every call site sits in a fallback branch behind a
  `typeof campaignModel.X === 'function'` check that is always true
  (`campaignModel` is `./campaign.mjs`). Its swap is identical to the
  `campaign.mjs` one and is verified by inspection; the `undefined`
  guard is preserved verbatim.

## Manual-check notes (DOM-only behavior)
- Open the Steam URL builder view (which mounts the campaign template
  picker via `src/steam.mjs`): verify the picker tabs render, switching
  tabs re-renders the detail panel, and no stale content survives a
  re-render — `replaceChildren()` clears exactly like the old
  `innerHTML = ''` did.
- Open a ring's Sync tab with a removed member: verify the campaign
  line reads `… Members: … . Removed: @handle` (period-separated
  segment, no leading middle dot) and the rest of the line is unchanged.

## Notes for the coordinator
- `app.js:290` still uses `JSON.parse(JSON.stringify(campaign))` —
  deliberately left for the coordinator lane that owns `app.js`.
- No `innerHTML = ''` remains in `src/templates.mjs`; no
  `JSON.parse(JSON.stringify(...))` remains in `src/` (verified by grep).
