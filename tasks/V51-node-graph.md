# V51 — Node graph model

Status: open
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

## Merges
- (coordinator fills in: commit, version, test count)
