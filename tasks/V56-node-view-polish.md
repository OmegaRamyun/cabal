# V56 — Node view rework: labels, toolbar, legend, bottom sheet

- Status: `done`
- Branch: `task/V56-node-view-polish`
- Base: `49a9a9a`
- Owner: Gemini lane (V56)

## Library Choice Evidence

**Decision: Vendor `d3-force` (v3.0.1, ISC) + its 3 pure-JS dependencies (`d3-dispatch`, `d3-quadtree`, `d3-timer`, all ISC) into `vendor/d3-force/` with relative ESM imports, and keep our existing SVG renderer and viewBox pan/zoom/pinch engine.**

We evaluated **d3-force (+ d3-zoom)** against **Cytoscape.js** on one deciding question: *which keeps the current SVG renderer and the existing `buildGraph` `{ nodes, edges, positions }` data contract with the least rewrite?* Cytoscape.js (5.8 MB unpacked, MIT) replaces the SVG renderer with its own `<canvas>` pipeline, forcing a full rewrite of node/edge rendering, breaking all SVG CSS selectors (`.node-svg`, `.node-shape--format`, `.node-edge--runs`, `.node-item.is-selected`), discarding DOM/ARIA keyboard accessibility on node `<g>` elements, and invalidating V52's tested pure viewBox/hit-test helpers (`viewBoxFor`, `zoomAround`, `panBy`, `nodeAtPoint`, `haloRadiusFor`). By contrast, **the deciding fact** is that `d3-force` (54 KB unpacked, ~150 KB total with its 3 zero-DOM deps) operates purely on `{ id, x, y }` coordinates and `{ source, target }` links, running synchronously (`simulation.stop(); simulation.tick(N)`) in both Node (`node --test`) and the browser. That lets us plug in a custom rectangular bounding-box collision force and longer link rest lengths directly inside `src/node-view.mjs`, keep 100% of the SVG renderer, ARIA semantics, and V52's tested viewBox pan/zoom/pinch controls intact (avoiding `d3-zoom`'s 8-package DOM/transition tree and `<g transform>` mismatch), and vendor the 4 tiny ISC packages with rewritten relative `./` imports so zero `index.html` edits or import maps are needed.

## Files Changed

- `vendor/d3-force/d3-force.mjs` (3 bare imports rewritten to `./d3-quadtree.mjs`, `./d3-dispatch.mjs`, `./d3-timer.mjs`)
- `vendor/d3-force/d3-quadtree.mjs`
- `vendor/d3-force/d3-dispatch.mjs`
- `vendor/d3-force/d3-timer.mjs`
- `vendor/d3-force/LICENSE` (ISC, Mike Bostock)
- `vendor/README.md` (documented vendored `d3-force@3.0.1`)
- `src/node-view.mjs`
- `tests/v56-node-view.test.mjs`
- `tasks/V56-node-view-polish.md`
- CSS seam (outside repo, for coordinator merge into `style.css`): `~/workspace/cabal-bench/v56-node-styles.css`

## Recommended `src/graph.mjs` Patch (not edited by V56)

`src/graph.mjs` is read-only for this lane. Currently line 114 sets:
```js
label: str(r.game?.name) || str(r.title) || str(r.id),
```
and omits `title` / `gameName` on ring nodes. Recommended coordinator patch:
```js
label: str(r.title) || str(r.game?.name) || str(r.id),
title: str(r.title) || undefined,
gameName: str(r.game?.name) || undefined,
```
Until applied, `src/node-view.mjs` resolves ring titles at the view layer via `node.title`, `ctx.rings`, or a read-only `localStorage` lookup of `cabal.v2.campaigns` by `node.ref`.

## Acceptance Evidence

### Unit tests (`npm test`)
- **463 / 463 passing** (451 baseline + 12 new V56 tests in `tests/v56-node-view.test.mjs`).
- Covers: 0 bounding-box overlaps on the 6-node demo graph (desktop & mobile), deterministic layout, viewBox containment of wrapped label bounds, `>= 12px` CSS px label floor across scales/zooms, multi-line label wrapping with ellipsis, view-layer ring title resolution (distinct titles for all 3 Starlight Salvage rings), all 3 edge legend kinds, and mobile bottom-sheet viewport/state/swipe helpers.

### Localhost Playwright smoke (`chrome-headless-shell`, CSS injected via `addStyleTag` from `~/workspace/cabal-bench/v56-node-styles.css`)
- **Desktop (`1280×900`)**:
  - 6 demo nodes rendered (`ToonSouls`, `Launch week push`, `Demo day push`, `Steam Next Fest push`, `MY GAME IS GOOD THE ALGORITHM JUST…`, `ONE MOMENT, ONE LINE`).
  - Min rendered label size: **13 CSS px** (`>= 12px`).
  - Label-box overlaps: **0**; clipped labels: **0**.
  - Corner zoom toolbar overlaps any node/label: **false**.
  - Legend chips present: `Ring`, `Template`, `Runs template`, `Shared dev`, `Similar tags`.
  - Side panel height matches stage height: **661px === 661px**; empty state shows Network Overview (counts + quick-jump node list).
  - Page errors: **0** (only expected offline Nostr relay WebSocket refusal).
- **Mobile (`360×800`)**:
  - 6 demo nodes rendered.
  - Min rendered label size: **12.5 CSS px** (`>= 12px`).
  - Label-box overlaps: **0**; clipped labels: **0**.
  - Corner zoom toolbar overlaps any node/label: **false**.
  - Tapping a node opens fixed bottom sheet (`top: 432, bottom: 800, height: 368, width: 360`), `visibleInViewport: true`, `openBtnVisible: true`, with swipe handle, backdrop dismiss, and `×` close button — visible immediately without scrolling.
  - Console errors: **0**; page errors: **0**.

### Screenshots (`~/workspace/cabal-bench/`)
- `polish-v56-net-desktop.png`
- `polish-v56-panel-desktop.png`
- `polish-v56-net-mobile.png`
- `polish-v56-sheet-mobile.png`
