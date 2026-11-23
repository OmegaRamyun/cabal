# V53 — Node view integration

Status: open
Coordinator-owned integration (no lane branch). Merges V51 + V52 and wires
the shell: the `#/campaigns` (+ `#/discover` alias) route mounts ONE node
view instead of the split Campaigns/Similar/Popular lists.

## What changed
- `app.js`: imports `src/graph.mjs` + `src/node-view.mjs`; exports pure
  `openNodeTarget(node)` and `nodeViewGraph({ rings, formats, usage },
  { width, height })`; `renderCampaigns` builds the graph from the merged
  ring + format lists and mounts the node view with the radius adapter
  `radiusFor: (n) => graph.radiusForWeight(n.weight, n.kind)` (the V51
  verifier's required wiring — layout and drawing share one radius
  function). Node taps route via `openNodeTarget` (ring -> campaign page,
  format -> template page). Create actions fall back to `#/rings` and
  `#/campaigns/new`. Relay usage re-mount keeps the exact-route guard.
- `style.css`: V53 `.node-*` rules on Souls tokens (edges by kind, ring
  circle vs format hexagon, selection/dim states, panel, tools, hint) +
  `@media (prefers-reduced-motion: reduce)` with no transitions/animations
  on `.node-*`.
- Demo data runs formats so the live net shows template nodes:
  `data/campaigns.json` ToonSouls `formatId: fmt_oneclip1` (the Instagram
  clip post is one moment + one line); `src/demo.mjs` launch-week push
  `formatId: fmt_algoigno` (the launch announcement states the game
  flatly). No Atom regen needed (the generator does not read formatId).
- `src/discovery.mjs` `mount()` is now legacy (nothing mounts it); its
  pure helpers (`isListable`, `mergeLists`, `similarCampaigns`,
  `popularCampaigns`) are still used. Left in place, not deleted.

## Merges
- V51 `task/V51-node-graph` (`002bea8` + fix `ce163b9`) -> v0.2.25, 423/423.
- V52 `task/V52-node-view` (`4a4bd0c` + fix `f4c7eb7`) -> v0.2.26, 428/428.
- V53 integration -> v0.2.27 (this doc).

## Manual DOM check notes (Playwright smoke, local server)
- `#/campaigns` renders the net: ring nodes (circles) + format nodes
  (hexagons) from demo data, edges visible, node size scales with weight.
- Tap a ring node -> detail panel -> Open -> ring page. Tap a format
  node -> Open -> template page.
- "Start a ring" + "New campaign template" visible on the view; cold
  first-run creation under 60s each (V49 requirement survives).
- Drag pan, wheel/pinch zoom, keyboard (Tab/Enter/Escape), reduced
  motion (no animation), ~44px tap targets at 360px width.
- Zero console errors, zero failed requests.
