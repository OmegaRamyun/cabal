# V52 — Node view UI

Status: claimed
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

## Renderer choice
SVG over canvas — native DOM nodes give crisp real text labels, built-in keyboard focus (`tabindex`/`role="button"`), direct CSS token styling, and zero hit-buffer bookkeeping while staying lightweight with zero deps.

## Design note on unused formats
A format with no ring using it has no node, by design (stated here, not in the UI). When the graph is empty, the empty state states the share requirement honestly without softening it.

## Context (`ctx`) contract
`mount(rootEl, ctx)` accepts:
- `graph` — `{ nodes, edges, positions }` (V51 shape: `ring:`/`format:` prefixed `id`, bare `ref`, `Map` or plain-object `positions`).
- `radiusFor(node)` (optional, recommended at mount site) — returns the visible radius for `node`. When omitted, `defaultRadiusFor(node)` uses V51's kind-aware curve (`ring`: `min(36, 10 + 4 * sqrt(w))`; `format`: `min(44, 12 + 5 * sqrt(w))`). Pass `radiusFor: (n) => radiusForWeight(n.weight, n.kind)` at the mount site so layout and drawing stay locked together; both formulas agree.
- `onOpenNode(node)` — called when the user clicks the detail panel's Open button.
- `onStartRing()` / `onNewTemplate()` — create-bar handlers (fall back to `#/rings` and `#/campaigns/new` when omitted).
- `usageNote` (optional) — honest-limits line rendered with format usage counts and as the view footnote.
- `width`, `height` (optional, defaults `800` × `520`) — initial viewBox aspect ratio.
- `location` (optional) — override for hash fallback in non-browser tests.

## CSS you must supply (coordinator's `style.css`)
The module emits unstyled SVG and HTML elements; the coordinator's `style.css` MUST provide:
1. **Edge and shape `fill` / `stroke`**: Unstyled SVG `<line>` edges have no stroke (invisible) and `<circle>`/`<polygon>` shapes paint solid black by default. Supply explicit `stroke` / `stroke-width` / `opacity` for `.node-edge`, `.node-edge--runs`, `.node-edge--shares-member`, and `.node-edge--shares-tag`, explicit `fill` / `stroke` for `.node-shape`, `.node-shape--ring`, and `.node-shape--format`, and `fill` for `.node-label`.
2. **`.node-svg` aspect ratio**: Match the `width` / `height` passed to `mount()` (default `800 / 520`), e.g. `width: 100%; aspect-ratio: 800 / 520; height: auto;`. Do not set conflicting fixed `width` and `height` values — `preserveAspectRatio` letterboxing causes pointer-to-world and pan scaling drift.
3. **Reduced motion**: Under `@media (prefers-reduced-motion: reduce)`, set `transition: none; animation: none;` on all `.node-*` classes (no transitions or animations on hover, focus, selection, dimming, or panel state). The module itself performs instant viewBox and class updates with zero JS animation.

## CSS classes emitted (for coordinator's `style.css`)
Mapped to the existing Dark Souls tokens in `style.css` (`--cabal-ground`, `--cabal-panel`, `--cabal-hairline`, `--cabal-ember`, `--cabal-ember-deep`, `--cabal-gold`, `--cabal-bone`, `--cabal-muted`, `--cabal-ember-glow`, `--cabal-display`, `--cabal-serif-body`, `--cabal-radius`):

- **Root & layout**
  - `.node-view` — root section wrapper
  - `.node-view-grid` — 2-column grid on desktop (`1fr 320px`), 1-column stack on mobile
- **Create bar & filters**
  - `.node-view-actions` — top create bar (visible without scrolling on desktop, stacks on mobile)
  - `.node-action` — wrapper `<div>` around each create button and its `.node-action-help` line (the buttons themselves are `.node-action-start` and `.node-action-template`)
  - `.node-action-start` (+ `.primary`) — "Start a ring" primary CTA (`--cabal-ember` / `--cabal-ember-deep`, `--cabal-radius`)
  - `.node-action-template` — "New campaign template" secondary CTA (`--cabal-panel`, `--cabal-hairline`, `--cabal-bone`, `--cabal-radius`)
  - `.node-action-help` (+ `.view-lede`) — brief helper line (`--cabal-muted`, `--cabal-serif-body`)
  - `.node-view-filters` — filter chip row
  - `.node-chip` — filter toggle chip (`--cabal-panel`, `--cabal-hairline`, `--cabal-bone`, `--cabal-radius`); `[aria-pressed="true"]` highlighted with `--cabal-ember` / `--cabal-gold`
- **Graph stage & SVG**
  - `.node-stage` — stage container positioning canvas, zoom tools, and hint (`--cabal-radius`)
  - `.node-svg` — SVG viewport (`touch-action: none`, background `--cabal-ground`, border `1px solid var(--cabal-hairline)`)
  - `.node-edges` — SVG `<g>` edge layer
  - `.node-edge` — base edge line
  - `.node-edge--runs` — heaviest edge (`--cabal-gold`)
  - `.node-edge--shares-member` — medium edge (`--cabal-ember`)
  - `.node-edge--shares-tag` — thinner/dimmer edge (`--cabal-muted` at low opacity)
  - `.node-nodes` — SVG `<g>` node layer
  - `.node-item` — focusable `<g>` node wrapper (`tabindex="0"`, `role="button"`)
  - `.node-item--ring`, `.node-item--format` — kind modifiers on `.node-item`
  - `.node-halo` — transparent hit-target circle (`fill: transparent`, `>=44px` tap target)
  - `.node-shape` — visible node geometry base
  - `.node-shape--ring` — circle (`--cabal-panel` fill + `--cabal-ember` stroke)
  - `.node-shape--format` — hexagon (`--cabal-panel` fill + `--cabal-gold` double/heavier stroke — distinct shape + stroke, not color alone)
  - `.node-label` — SVG `<text>` label (`--cabal-bone` fill, `--cabal-serif-body` / `--cabal-display`)
- **Interactive state modifiers**
  - `.is-selected` — selected node (`--cabal-gold` stroke + `--cabal-ember-glow`)
  - `.is-neighbor` — connected neighbour node
  - `.is-active` — edge incident to the selected node
  - `.is-dim` — non-selected, non-neighbour nodes/edges (reduced opacity)
- **Stage controls, hint, empty & footnote**
  - `.node-tools` — zoom/reset control cluster
  - `.node-tool-btn` — zoom/reset button (min `44×44px`, `--cabal-panel`, `--cabal-hairline`, `--cabal-bone`, `--cabal-radius`)
  - `.node-hint` — interaction hint line (`--cabal-muted`)
  - `.node-empty` (+ `.empty-state`) — empty graph state (`--cabal-panel`, `--cabal-hairline`, `--cabal-muted`)
  - `.node-view-footnote` (+ `.view-lede`) — honest usage footnote below the stage (`--cabal-muted`)
- **Detail panel**
  - `.node-panel` — side detail panel (`--cabal-panel`, `--cabal-hairline`, `--cabal-radius`)
  - `.node-panel.is-empty` — idle/unselected panel state (`--cabal-muted`)
  - `.node-panel-head` — panel header row (kind badge + close button)
  - `.node-panel-kind` — uppercase kind label (`--cabal-muted`)
  - `.node-panel-close` — panel close button (`--cabal-bone`, `--cabal-hairline`)
  - `.node-panel-title` — selected node title (`--cabal-display`, `--cabal-gold`)
  - `.node-panel-usage` — honest usage count line (`--cabal-bone`, `--cabal-serif-body`)
  - `.node-panel-usage-note` — secondary usage clarification (`--cabal-muted`)
  - `.node-panel-open` (+ `.primary`) — open-node action button (`--cabal-ember` / `--cabal-ember-deep`)
  - `.node-panel-connections` — connected nodes list
  - `.node-panel-conn-btn` — connection jump button (`--cabal-ground` / `--cabal-panel`, `--cabal-hairline`, `--cabal-bone`)
  - `.node-panel-conn-rel` — relationship tag inside connection button (`--cabal-muted`)
- **Existing shared classes reused**: `.primary`, `.view-lede`, `.empty-state`, `.demo-badge`

## Manual DOM check notes
- **Populated graph render**: Mount with a populated graph; verify rings render as circles, formats as hexagons, node size scales with weight, and edge visual weight descends (`runs` > `shares-member` > `shares-tag`).
- **Node selection & detail panel**: Tap/click a node; verify it selects, emphasizes neighbours and incident edges, dims the rest, and opens the detail panel with label, kind, honest usage line (formats with `weight >= 1` only, never "0 rings"), connections list, and Open button invoking `ctx.onOpenNode(node)`.
- **Deselection**: Tap empty stage space, click `.node-panel-close`, or press `Escape`; verify selection and dimming clear.
- **Keyboard accessibility**: Press `Tab` to reach each node (`tabindex="0"`, `role="button"`), press `Enter` or `Space` to select, and `Escape` to deselect.
- **Pan & zoom**: Drag to pan (clamped so the graph cannot leave the viewport), wheel to zoom around cursor, pinch to zoom on touch, and click `+` / `−` / `↺` buttons to zoom/reset within bounds.
- **Reduced motion**: Enable `prefers-reduced-motion: reduce`; verify zero animations or transitions across all `.node-*` CSS rules, and that pan, zoom, and selection apply as instant jumps.
- **Tap target on mobile**: At ~360px viewport width (and when zoomed out), verify `.node-halo` `r` scales with `viewBox.w / svgRect.width` so every node keeps a `>= 44 CSS px` tap target, and tapping overlapping edges selects the smaller node consistently with `nodeAtPoint`.
- **Create actions**: Verify "Start a ring" and "New campaign template" are visible above the fold on desktop and reachable on mobile; verify they invoke `ctx.onStartRing` / `ctx.onNewTemplate` or fall back to `#/rings` / `#/campaigns/new`.
- **Empty graph**: Mount with an empty graph; verify it renders the honest share-requirement copy without softening it.

## Merges
- (coordinator fills in: commit, version, test count)
