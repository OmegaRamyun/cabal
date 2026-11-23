# V52 — Node view UI

Status: open
Branch: `task/V52-node-view`
Files owned: `src/node-view.mjs` (new), `tests/v52-node-view.test.mjs` (new), `tasks/V52-node-view.md`
Brief: `~/workspace/cabal-bench/brief-v52-node-view.md`
Reference: Idra's Net interaction model — `/home/hatch/workspace/ts-spaces/idra-s-net/index.html`

## What
2D node view `mount(rootEl, ctx)` rendering a graph object
`{ nodes, edges, positions }` (contract in the brief; do NOT import
`src/graph.mjs`). SVG preferred (justify in one line), tap node -> detail
panel, drag pan, wheel/pinch zoom + buttons, keyboard accessible,
prefers-reduced-motion respected (no animation), 44px tap halos, create
actions ("Start a ring" + "New campaign template") on the view, honest
usage note, empty state states the share requirement without softening it.

Class names emitted (for the coordinator's `style.css`): list here on
completion.

## Merges
- (coordinator fills in: commit, version, test count)
