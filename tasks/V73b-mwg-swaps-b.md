# V73b — Modern Web Guidance Mechanical Swaps, Part B

Status: claimed
Branch: `task/V73b-mwg-swaps-b`
Base: `0223f53` (v0.2.39)

## Summary
- **M3 — copy-before-`.sort()` → `.toSorted()`, 3 sites** (same comparators, no behaviour change; arrays are dense object lists, no sparse-hole concern):
  - `src/atom.mjs` (`buildFeed`): `.map((c) => normalizeCampaign(c)).slice().sort(...)` → `.map((c) => normalizeCampaign(c)).toSorted(...)`. The `.map()` already returns a fresh array, so the `.slice()` was redundant and is dropped with the swap.
  - `src/campaign-formats.mjs` (`formatsForDiscovery`): `[...list].sort(...)` → `list.toSorted(...)`, comparator identical (usage count, assists, member total, id).
  - `src/node-view.mjs` (`layoutWithLabels`): `[...nodes].sort(...)` → `nodes.toSorted(...)`, comparator identical (id order). Layout is now order-independent by construction: the same node set in any input order yields identical positions.
- **Trailing copy fixes:**
  - `src/first-run.mjs`: first-run pitch line reworded without the em dash (house-style tell): `"Cabal — small rings of indie devs boost each other’s posts, in their own words. No accounts."` → `"Cabal: small rings of indie devs boost each other’s posts, in their own words. No accounts."` No other em dashes introduced by this task.
  - `src/campaign-formats.mjs` (format detail `mount`): tags join `f.tags.join(" · ")` → `f.tags.join(", ")`. Everything else identical.

## Files changed
- `src/atom.mjs`
- `src/campaign-formats.mjs`
- `src/node-view.mjs`
- `src/first-run.mjs`
- `tests/v73b-mwg-swaps.test.mjs` (new)
- `tests/v61-first-run.test.mjs` (one stale assertion — see deviation note below)
- `tests/v65-content-mobile.test.mjs` (one stale assertion — see deviation note below)
- `tasks/V73b-mwg-swaps-b.md` (new)

## Acceptance test
`tests/v73b-mwg-swaps.test.mjs` (6 tests):
- `buildFeed`: newest first regardless of input order, identical output for both input orders, input array not mutated.
- `formatsForDiscovery`: id order without usage, identical output for shuffled input, input not mutated; usage count still outranks id order.
- Format detail `mount` (fake DOM): tags render as `"devlog, clips, cozy"`, no middle dot.
- `layoutWithLabels`: identical position map regardless of input order, input not mutated.
- First-run pitch line: no em dash, still starts `"Cabal:"` and ends `"No accounts."`.

`npm test`: **578/578 green** (572 baseline + 6 new).

## Deviation note (stale assertions in other tasks' test files)
Two pre-existing tests asserted the exact old strings this task was ordered to change, so the suite went red (verified: both pass on clean `0223f53`, fail with the ordered changes applied). Minimal one-line updates, assertion strings only, no other edits:
- `tests/v61-first-run.test.mjs` ("copy is verbatim"): expected pitch line updated to the new `"Cabal: ..."` wording.
- `tests/v65-content-mobile.test.mjs:284` ("mountCreate ... ships creator edits"): expected detail text updated from `"screenshots · cozy"` to `"screenshots, cozy"`.
Coordinator: revert or re-own these two lines at merge if the ownership rule should win over the green suite; the changes are confined to those two assertion strings.

## Manual-check notes (DOM-only behaviour)
- Open the first-run screen on a fresh profile (cleared localStorage): verify the pitch line reads `"Cabal: small rings of indie devs boost each other’s posts, in their own words. No accounts."` with no em dash.
- Open a format detail page for a tagged template: verify the tags line reads like `"devlog, clips, cozy"` (comma-separated, no middle dot).
- No visual change expected anywhere else: sort orders, feed entries, and node-view layout are identical to before.
