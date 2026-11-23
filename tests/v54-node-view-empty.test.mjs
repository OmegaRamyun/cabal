// V54 acceptance: the live node view rendered EMPTY (0 nodes, 0 edges)
// on the deployed site while Home showed the 3 demo rings.
//
// Root cause (proven, see tasks/V54-node-view-empty.md): NOT the data —
// every historical demo seed is listable and the deployed bundle is
// byte-identical to main. It was a STALE v0.2.27 bundle replayed from the
// browser HTTP cache (GitHub Pages `Cache-Control: max-age=600`): v0.2.27's
// nodeViewGraph built the graph WITHOUT positions attached (fixed in
// app.js by c681594), yet still passed positions as a separate mount
// argument — and node-view.mount read ONLY graph.positions, so it rendered
// the empty state with nodes in hand. Reproduced end-to-end in Playwright:
// v0.2.27 -> current build, same profile, cache on -> 0 nodes + the exact
// live empty-state copy; version.json read stale (0.2.27) from the page
// while the server served 0.2.28.
//
// Fix (this lane): mount falls back to ctx.positions when graph.positions
// is missing/empty (resolvePositions). graph.positions still wins when
// present. The durable cache-busting fix lives in the coordinator-owned
// shell (index.html / app.js) and is reported in the task doc, not here.
//
// Tests:
//  - resolvePositions: FAILS on main (no such export), PASSES with the fix.
//  - Live data path: seedDemo round-trip + aged v0.2.24 store shape through
//    the real buildGraph -> 6 / 5 nodes. These pass on main too: they pin
//    the data path sound, i.e. the bug was never in the data.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildGraph, layoutGraph } from "../src/graph.mjs";
import { isListable, mergeLists } from "../src/discovery.mjs";
import { seedDemo } from "../src/demo.mjs";
import { createStore } from "../src/store.mjs";

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8"));
}

// ---- V54 fallback: graph without positions + ctx.positions ----------

test("V54: mount input without graph.positions falls back to ctx.positions", async () => {
  const nv = await import("../src/node-view.mjs");
  assert.equal(
    typeof nv.resolvePositions,
    "function",
    "resolvePositions must exist (V54: stale shell passes positions beside the graph)",
  );
  const ctxPos = new Map([
    ["ring:a", { x: 100, y: 100 }],
    ["format:f", { x: 300, y: 100 }],
  ]);
  // Stale-shell shape: graph has nodes/edges but NO positions key at all.
  const bare = { nodes: [{ id: "ring:a" }], edges: [] };
  assert.equal(nv.resolvePositions(bare, ctxPos), ctxPos);
  // Empty-Map positions also fall back (layout of 0 nodes yields none).
  assert.equal(nv.resolvePositions({ ...bare, positions: new Map() }, ctxPos), ctxPos);
  // Plain-object ctx positions work too (positionOf accepts both).
  const objPos = { "ring:a": { x: 100, y: 100 } };
  assert.equal(nv.resolvePositions(bare, objPos), objPos);
  // Present graph.positions is NEVER overridden by ctx.positions.
  const graphPos = new Map([["ring:a", { x: 1, y: 1 }]]);
  assert.equal(nv.resolvePositions({ ...bare, positions: graphPos }, ctxPos), graphPos);
  // Neither present: empty Map, never a throw (mount renders empty state).
  const none = nv.resolvePositions(bare, undefined);
  assert.ok(none instanceof Map && none.size === 0);
});

test("V54: a positions-less graph still lays out from ctx.positions", async () => {
  const nv = await import("../src/node-view.mjs");
  assert.equal(typeof nv.resolvePositions, "function");
  const { graph, positions } = staleShellGraph();
  assert.equal(graph.positions, undefined);
  const resolved = nv.resolvePositions(graph, positions);
  assert.equal(resolved, positions);
  // Every node resolves to a finite position through the fallback.
  for (const n of graph.nodes) {
    const p = nv.positionOf(resolved, n.id);
    assert.ok(p && Number.isFinite(p.x) && Number.isFinite(p.y), `no position for ${n.id}`);
  }
});

// The stale v0.2.27 shell shape, built from the CURRENT graph code:
// nodeViewGraph returned { graph: g, positions } with positions NOT
// attached to g — exactly what c681594 fixed in app.js.
function staleShellGraph() {
  const rings = liveMergedRings();
  const formats = loadJson("data/formats.json").formats;
  const g = buildGraph({ rings, formats, usage: null });
  const positions = layoutGraph(g, { width: 800, height: 520 });
  delete g.positions;
  return { graph: g, positions };
}

// ---- Live data path: seeded demo store round-trip -------------------

function liveMergedRings() {
  const storage = memoryStorage();
  assert.equal(seedDemo(storage), true);
  const store = createStore(storage);
  const loaded = store.loadCampaigns();
  assert.equal(loaded.length, 3);
  const statics = loadJson("data/campaigns.json").campaigns;
  return mergeLists(statics, loaded);
}

test("V54: live data path — seeded demo store round-trips to 6 nodes / 5 edges", () => {
  const rings = liveMergedRings();
  // Per-ring verdict: which filter would drop it, if any (none may).
  for (const r of rings) {
    assert.equal(isListable(r), true, `${r.id} must be listable (links + >=2 members)`);
  }
  const formats = loadJson("data/formats.json").formats;
  const { nodes, edges } = buildGraph({ rings, formats, usage: null });
  assert.deepEqual(
    nodes.map((n) => n.id).sort(),
    [
      "format:fmt_algoigno",
      "format:fmt_oneclip1",
      "ring:cmp_demo_demoday",
      "ring:cmp_demo_launch",
      "ring:cmp_demo_nextfest",
      "ring:cmp_toon001",
    ].sort(),
  );
  assert.equal(edges.length, 5);
  assert.equal(edges.filter((e) => e.kind === "runs").length, 2);
});

// ---- Aged v0.2.24 store shape (no formatId anywhere) ----------------
// Shape captured from the aged-profile repro: members are bare roster
// entries, game carries the itch link, posts are v2 (V38-normalized),
// and NO ring runs a format — the flagship template node is therefore
// absent, but every ring node must still render.
const AGED_RINGS = [
  {
    id: "cmp_demo_launch",
    game: {
      name: "Starlight Salvage",
      links: { itch: "https://starlight-salvage.itch.io/starlight-salvage" },
      tags: ["roguelite", "cozy", "space"],
    },
    title: "Launch week push",
    members: [
      { name: "Moss", handle: "@mossplays" },
      { name: "Pip", handle: "@pipdraws" },
      { name: "June", handle: "@junebakes" },
      { name: "Rook", handle: "@rookdev" },
    ],
    posts: [{ id: "pst_aged001", author: "Wren", platform: "x", url: "https://x.com/wrenmakesgames/status/1", text: "Out now!", kind: "announcement", createdAt: "2026-11-20T18:00:00Z", assists: [] }],
    createdAt: "2026-11-20T18:00:00Z",
    demo: true,
  },
  {
    id: "cmp_demo_demoday",
    game: {
      name: "Starlight Salvage",
      links: { itch: "https://starlight-salvage.itch.io/starlight-salvage" },
      tags: ["roguelite", "cozy", "space"],
    },
    title: "Demo day push",
    members: [
      { name: "Sable", handle: "@sablepixels" },
      { name: "Fern", handle: "@fernfolk" },
      { name: "Rook", handle: "@rookdev" },
    ],
    posts: [{ id: "pst_aged002", author: "Wren", platform: "x", url: "https://x.com/wrenmakesgames/status/2", text: "Demo day!", kind: "announcement", createdAt: "2026-11-23T12:00:00Z", assists: [] }],
    createdAt: "2026-11-23T12:00:00Z",
    demo: true,
  },
  {
    id: "cmp_demo_nextfest",
    game: {
      name: "Starlight Salvage",
      links: { itch: "https://starlight-salvage.itch.io/starlight-salvage" },
      tags: ["roguelite", "cozy", "space"],
    },
    title: "Steam Next Fest push",
    members: [
      { name: "Moss", handle: "@mossplays" },
      { name: "Pip", handle: "@pipdraws" },
      { name: "June", handle: "@junebakes" },
      { name: "Rook", handle: "@rookdev" },
      { name: "Sable", handle: "@sablepixels" },
      { name: "Fern", handle: "@fernfolk" },
    ],
    posts: [{ id: "pst_aged003", author: "Wren", platform: "x", url: "https://x.com/wrenmakesgames/status/3", text: "Next Fest!", kind: "announcement", createdAt: "2026-11-21T18:00:00Z", assists: [] }],
    createdAt: "2026-11-21T18:00:00Z",
    demo: true,
  },
];

test("V54: aged v0.2.24 store shape still renders 5 nodes (no flagship, no empty state)", () => {
  const statics = loadJson("data/campaigns.json").campaigns;
  const merged = mergeLists(statics, AGED_RINGS);
  for (const r of merged) {
    assert.equal(isListable(r), true, `${r.id} must be listable`);
  }
  const formats = loadJson("data/formats.json").formats;
  const { nodes, edges } = buildGraph({ rings: merged, formats, usage: null });
  assert.deepEqual(
    nodes.map((n) => n.id).sort(),
    [
      "format:fmt_oneclip1",
      "ring:cmp_demo_demoday",
      "ring:cmp_demo_launch",
      "ring:cmp_demo_nextfest",
      "ring:cmp_toon001",
    ].sort(),
  );
  assert.equal(edges.length, 4);
});
