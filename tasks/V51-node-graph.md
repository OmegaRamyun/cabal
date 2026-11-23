# V51 — Node graph model

Status: claimed
Branch: `task/V51-node-graph`
Files owned: `src/graph.mjs` (new), `tests/v51-node-graph.test.mjs` (new), `tasks/V51-node-graph.md`
Brief: `~/workspace/cabal-bench/brief-v51-node-graph.md`

## What
Pure data model for the unified 2D node view: `buildGraph({ rings, formats, usage })`
-> `{ nodes, edges }`, `radiusForWeight`, `layoutGraph` (deterministic).

Rules (binding): only `isListable` rings become nodes; only formats with
>= 1 ring using them (local `ringsRunningFormat` or V46 relay usage >= 1)
become nodes. Edges: `runs` (ring -> format), `shares-member` (one per
pair), `shares-tag` (only where no member edge). No format-format edges,
no self edges, no invented nodes/counts. Layout deterministic, in-bounds,
no severe overlap. Never throws on malformed input.

## API (`src/graph.mjs`)
- Node ids: `ring:<ringId>`, `format:<formatId>`. `ref` is the bare id.
- Ring label: game.name -> title -> id. Format label: tagline -> id.
- Ring weight = member count. Format weight = V46 distinct-ring count when
  usage has that id with count >= 1, else the local count of listable rings
  running it. Format admitted iff that count >= 1. "Local" counts only
  listable rings (a non-listable ring has no node, so no edge to show).
- Edges: `runs` (ring -> format, `formatIdForRing`, case-insensitive match),
  `shares-member` (handles compared trimmed, lowercased, leading `@`
  stripped), `shares-tag` (trimmed, lowercased; skipped when the pair
  already has a member edge). Ring-ring edges are emitted from the lower
  node id to the higher one. No format-format or self edges.
- `radiusForWeight(w, kind)`: `base + scale*sqrt(w)` capped. ring 10/4/max 36,
  format 12/5/max 44. Weight <= 0 or non-finite gets the minimum (base).
- `layoutGraph(graph, {width,height})` -> `Map id -> {x,y}`. Golden-angle
  spiral seed in id order, 150 relaxation passes (edge attraction +
  pairwise separation to 0.9*(r1+r2)), up to 100 separation-only passes,
  clamp to margin = radius. No randomness, no clock.
- Density: if the viewport is too small for the radii, nodes stay in bounds
  and may overlap closer than 0.8*(r1+r2); the layout spreads as far as it
  can rather than leaving the viewport. Callers should size the viewport
  to the node count.

## Tolerances (none throw)
Non-object input -> empty graph; non-array rings/formats -> []; non-object
entries dropped; rings or formats without a string id dropped; duplicate
ids (formats compared case-insensitively) keep the first; unusable usage ->
local counts only; members given as strings or objects; non-string tags
dropped; layout with NaN/<=0 size -> 800x600; edges referencing unknown or
identical nodes ignored; duplicate/malformed nodes ignored.

## Left out
No DOM, no view, no click handling (V52). No format-format edges. No
persistence of positions. Rings that are not listable never appear.

## Merges
- (coordinator fills in: commit, version, test count)
