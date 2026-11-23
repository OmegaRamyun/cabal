// V52 acceptance: pure geometry, hit-testing, viewBox, and usage helpers for src/node-view.mjs.
// DOM-only behaviour (SVG rendering, pointer/wheel/pinch/keyboard interaction) is in tasks/V52-node-view.md.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MIN_ZOOM,
  MAX_ZOOM,
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  HALO_MIN_RADIUS,
  EMPTY_STATE_COPY,
  START_RING_ACTION,
  NEW_TEMPLATE_ACTION,
  positionOf,
  defaultRadiusFor,
  haloRadiusFor,
  clampZoom,
  zoomAround,
  panBy,
  nodeAtPoint,
  visibleEdges,
  viewBoxFor,
  formatUsageLine,
} from "../src/node-view.mjs";

// ---- Fixtures: 2 connected rings, 1 format (weight 2), 1 isolated ring ----

const NODES = [
  {
    id: "ring_starlight_launch",
    kind: "ring",
    label: "Starlight Salvage — Launch",
    weight: 2,
    demo: true,
  },
  {
    id: "ring_toonsouls_demo",
    kind: "ring",
    label: "ToonSouls — Demo Week",
    weight: 3,
    demo: true,
  },
  {
    id: "fmt_devlog01",
    kind: "format",
    label: "Weekly Devlog Swap",
    weight: 2,
    demo: true,
  },
  {
    id: "ring_starlight_fest",
    kind: "ring",
    label: "Starlight Salvage — Next Fest",
    weight: 1,
    demo: true,
  },
];

const EDGES = [
  { from: "ring_starlight_launch", to: "fmt_devlog01", kind: "runs" },
  { from: "ring_toonsouls_demo", to: "fmt_devlog01", kind: "runs" },
  { from: "ring_starlight_launch", to: "ring_toonsouls_demo", kind: "shares-member" },
];

const POS_OBJ = {
  ring_starlight_launch: { x: 120, y: 140 },
  ring_toonsouls_demo: { x: 340, y: 160 },
  fmt_devlog01: { x: 230, y: 300 },
  ring_starlight_fest: { x: 560, y: 260 },
};

const POS_MAP = new Map(Object.entries(POS_OBJ));

function makeGraph(useMap = true) {
  return {
    nodes: NODES.map((n) => ({ ...n })),
    edges: EDGES.map((e) => ({ ...e })),
    positions: useMap ? new Map(POS_MAP) : { ...POS_OBJ },
  };
}

// ---- Constants ----

test("exported constants match contract values", () => {
  assert.equal(MIN_ZOOM, 0.4);
  assert.equal(MAX_ZOOM, 4);
  assert.equal(DEFAULT_WIDTH, 800);
  assert.equal(DEFAULT_HEIGHT, 520);
  assert.equal(HALO_MIN_RADIUS, 22);
  assert.ok(HALO_MIN_RADIUS * 2 >= 44, "tap halo diameter must be >= 44px");

  assert.equal(typeof EMPTY_STATE_COPY, "string");
  assert.ok(EMPTY_STATE_COPY.includes("two devs"));
  assert.ok(EMPTY_STATE_COPY.includes("Steam") && EMPTY_STATE_COPY.includes("itch.io"));

  assert.equal(Object.isFrozen(START_RING_ACTION), true);
  assert.equal(START_RING_ACTION.label, "Start a ring");
  assert.equal(START_RING_ACTION.route, "#/rings");
  assert.ok(START_RING_ACTION.help.length > 0);

  assert.equal(Object.isFrozen(NEW_TEMPLATE_ACTION), true);
  assert.equal(NEW_TEMPLATE_ACTION.label, "New campaign template");
  assert.equal(NEW_TEMPLATE_ACTION.route, "#/campaigns/new");
  assert.ok(NEW_TEMPLATE_ACTION.help.length > 0);
});

// ---- positionOf ----

test("positionOf supports both Map and plain object positions", () => {
  assert.deepEqual(positionOf(POS_MAP, "ring_starlight_launch"), { x: 120, y: 140 });
  assert.deepEqual(positionOf(POS_OBJ, "ring_starlight_launch"), { x: 120, y: 140 });
  assert.deepEqual(positionOf(POS_MAP, "ring_starlight_fest"), { x: 560, y: 260 });
  assert.deepEqual(positionOf(POS_OBJ, "ring_starlight_fest"), { x: 560, y: 260 });

  // Returns a fresh object rather than exposing internal reference
  const copy = positionOf(POS_OBJ, "fmt_devlog01");
  copy.x = 9999;
  assert.equal(POS_OBJ.fmt_devlog01.x, 230);
});

test("positionOf returns null for missing, prototype, or non-finite entries", () => {
  assert.equal(positionOf(null, "fmt_devlog01"), null);
  assert.equal(positionOf(POS_MAP, null), null);
  assert.equal(positionOf(POS_MAP, "missing_id"), null);
  assert.equal(positionOf(POS_OBJ, "missing_id"), null);
  assert.equal(positionOf(POS_OBJ, "toString"), null);

  const badObj = {
    a: { x: NaN, y: 10 },
    b: { x: 10, y: Infinity },
    c: { x: "10", y: 20 },
    d: null,
  };
  assert.equal(positionOf(badObj, "a"), null);
  assert.equal(positionOf(badObj, "b"), null);
  assert.equal(positionOf(badObj, "c"), null);
  assert.equal(positionOf(badObj, "d"), null);
});

// ---- defaultRadiusFor & haloRadiusFor ----

test("defaultRadiusFor is monotonic and capped within [14, 38]", () => {
  const rNeg = defaultRadiusFor({ weight: -5 });
  const rZero = defaultRadiusFor({ weight: 0 });
  const rOne = defaultRadiusFor({ weight: 1 });
  const rTwo = defaultRadiusFor({ weight: 2 });
  const rNine = defaultRadiusFor({ weight: 9 });
  const rHuge = defaultRadiusFor({ weight: 1000 });

  assert.equal(rNeg, 14);
  assert.equal(rZero, 14);
  assert.equal(defaultRadiusFor(null), 14);
  assert.equal(defaultRadiusFor({ weight: NaN }), 14);
  assert.ok(rZero < rOne && rOne < rTwo && rTwo < rNine);
  assert.equal(rHuge, 38);
  assert.ok(rNine >= 14 && rNine <= 38);
});

test("haloRadiusFor enforces >= 22px radius (44px tap diameter) and respects custom radiusFor", () => {
  assert.ok(haloRadiusFor({ weight: 0 }) >= HALO_MIN_RADIUS);
  assert.equal(haloRadiusFor({ weight: 0 }, () => 6), HALO_MIN_RADIUS);
  assert.equal(haloRadiusFor({ weight: 0 }, () => 30), 38);
  // Invalid custom radius falls back to defaultRadiusFor
  assert.equal(
    haloRadiusFor({ weight: 2 }, () => -10),
    haloRadiusFor({ weight: 2 }),
  );
  assert.equal(
    haloRadiusFor({ weight: 2 }, () => NaN),
    haloRadiusFor({ weight: 2 }),
  );
});

// ---- clampZoom ----

test("clampZoom clamps to [MIN_ZOOM, MAX_ZOOM], handles non-finite and custom bounds", () => {
  assert.equal(clampZoom(1), 1);
  assert.equal(clampZoom(2.5), 2.5);
  assert.equal(clampZoom(0.1), MIN_ZOOM);
  assert.equal(clampZoom(-3), MIN_ZOOM);
  assert.equal(clampZoom(10), MAX_ZOOM);

  // Non-finite falls back to 1 (clamped into range)
  assert.equal(clampZoom(NaN), 1);
  assert.equal(clampZoom(Infinity), 1);
  assert.equal(clampZoom(undefined), 1);
  assert.equal(clampZoom(NaN, { min: 1.5, max: 3 }), 1.5);
  assert.equal(clampZoom(NaN, { min: 0.2, max: 0.8 }), 0.8);

  // Custom bounds
  assert.equal(clampZoom(0.1, { min: 0.5, max: 2 }), 0.5);
  assert.equal(clampZoom(5, { min: 0.5, max: 2 }), 2);
});

// ---- zoomAround ----

test("zoomAround keeps focal point (cx, cy) fixed in normalized viewport coordinates", () => {
  const vb = { x: 100, y: 50, w: 800, h: 520 };
  const cx = 300;
  const cy = 180;
  const normXBefore = (cx - vb.x) / vb.w;
  const normYBefore = (cy - vb.y) / vb.h;

  const zoomedIn = zoomAround(vb, cx, cy, 2);
  assert.equal(zoomedIn.w, 400);
  assert.equal(zoomedIn.h, 260);
  assert.ok(Math.abs((cx - zoomedIn.x) / zoomedIn.w - normXBefore) < 1e-9);
  assert.ok(Math.abs((cy - zoomedIn.y) / zoomedIn.h - normYBefore) < 1e-9);

  const zoomedOut = zoomAround(vb, cx, cy, 0.5);
  assert.equal(zoomedOut.w, 1600);
  assert.equal(zoomedOut.h, 1040);
  assert.ok(Math.abs((cx - zoomedOut.x) / zoomedOut.w - normXBefore) < 1e-9);
  assert.ok(Math.abs((cy - zoomedOut.y) / zoomedOut.h - normYBefore) < 1e-9);
});

test("zoomAround clamps directly without baseViewBox and cumulatively with baseViewBox", () => {
  const base = { x: 0, y: 0, w: 800, h: 520 };

  // Direct clamping
  const maxDirect = zoomAround(base, 400, 260, 50);
  assert.ok(Math.abs(maxDirect.w - base.w / MAX_ZOOM) < 1e-9);
  const minDirect = zoomAround(base, 400, 260, 0.01);
  assert.ok(Math.abs(minDirect.w - base.w / MIN_ZOOM) < 1e-9);

  // Cumulative clamping against baseViewBox
  let cur = base;
  for (let i = 0; i < 10; i++) {
    cur = zoomAround(cur, 200, 150, 2, { baseViewBox: base });
  }
  assert.ok(Math.abs(cur.w - base.w / MAX_ZOOM) < 1e-9);
  assert.ok(Math.abs(cur.h - base.h / MAX_ZOOM) < 1e-9);

  for (let i = 0; i < 10; i++) {
    cur = zoomAround(cur, 200, 150, 0.25, { baseViewBox: base });
  }
  assert.ok(Math.abs(cur.w - base.w / MIN_ZOOM) < 1e-9);
  assert.ok(Math.abs(cur.h - base.h / MIN_ZOOM) < 1e-9);

  // Non-finite inputs never produce NaN
  const safe = zoomAround(null, NaN, NaN, -5);
  for (const k of ["x", "y", "w", "h"]) {
    assert.ok(Number.isFinite(safe[k]), `safe.${k} should be finite`);
  }
});

// ---- panBy ----

test("panBy shifts unbounded when bounds omitted and tolerates non-finite deltas", () => {
  const vb = { x: 10, y: 20, w: 800, h: 520 };
  assert.deepEqual(panBy(vb, 50, -30), { x: 60, y: -10, w: 800, h: 520 });
  assert.deepEqual(panBy(vb, NaN, Infinity), { x: 10, y: 20, w: 800, h: 520 });
});

test("panBy with graph, bbox, or viewBox bounds never pushes all content out of frame", () => {
  for (const useMap of [true, false]) {
    const graph = makeGraph(useMap);
    const vb = viewBoxFor(graph);

    const farRight = panBy(vb, 100000, 0, graph);
    const farLeft = panBy(vb, -100000, 0, graph);
    const farDown = panBy(vb, 0, 100000, graph);
    const farUp = panBy(vb, 0, -100000, graph);

    // Content spans roughly x in [100, 580], y in [120, 320]; viewport must still overlap it
    assert.ok(farRight.x < 580, "far right pan must keep right-most node in frame");
    assert.ok(farLeft.x + farLeft.w > 100, "far left pan must keep left-most node in frame");
    assert.ok(farDown.y < 320, "far down pan must keep bottom-most node in frame");
    assert.ok(farUp.y + farUp.h > 120, "far up pan must keep top-most node in frame");
  }

  // Explicit bbox bounds
  const bbox = { minX: 0, maxX: 200, minY: 0, maxY: 200 };
  const smallVb = { x: 0, y: 0, w: 100, h: 100 };
  const clampedBbox = panBy(smallVb, 5000, 5000, bbox);
  assert.ok(clampedBbox.x < bbox.maxX);
  assert.ok(clampedBbox.y < bbox.maxY);

  // Base viewBox bounds
  const baseVb = { x: -50, y: -50, w: 400, h: 300 };
  const clampedVb = panBy(smallVb, -5000, -5000, baseVb);
  assert.ok(clampedVb.x + clampedVb.w > baseVb.x);
  assert.ok(clampedVb.y + clampedVb.h > baseVb.y);
});

// ---- nodeAtPoint ----

test("nodeAtPoint hits nodes within halo for both Map and plain-object positions", () => {
  for (const useMap of [true, false]) {
    const graph = makeGraph(useMap);
    // Exact center of each node including the isolated ring
    assert.equal(nodeAtPoint(graph, 120, 140)?.id, "ring_starlight_launch");
    assert.equal(nodeAtPoint(graph, 340, 160)?.id, "ring_toonsouls_demo");
    assert.equal(nodeAtPoint(graph, 230, 300)?.id, "fmt_devlog01");
    assert.equal(nodeAtPoint(graph, 560, 260)?.id, "ring_starlight_fest");

    // Inside halo outside visible radius of ring_starlight_fest (weight 1 -> r=20, halo=28)
    assert.equal(nodeAtPoint(graph, 560 + 25, 260)?.id, "ring_starlight_fest");
    // Outside halo
    assert.equal(nodeAtPoint(graph, 560 + 35, 260), null);
    assert.equal(nodeAtPoint(graph, -500, -500), null);
  }

  // Edge cases
  assert.equal(nodeAtPoint(null, 0, 0), null);
  assert.equal(nodeAtPoint(makeGraph(true), NaN, 140), null);
});

test("nodeAtPoint tie-breaking: smallest visible radius, then closest center, then highest index", () => {
  // 1. Smallest visible radius wins even if larger node is closer or later in array
  const overlapSize = {
    nodes: [
      { id: "small", kind: "ring", weight: 0 }, // r = 14
      { id: "large", kind: "format", weight: 16 }, // r = 38
    ],
    edges: [],
    positions: { small: { x: 105, y: 100 }, large: { x: 100, y: 100 } },
  };
  assert.equal(nodeAtPoint(overlapSize, 100, 100)?.id, "small");

  // 2. Same visible radius -> closest center wins
  const overlapDist = {
    nodes: [
      { id: "near", kind: "ring", weight: 2 },
      { id: "far", kind: "ring", weight: 2 },
    ],
    edges: [],
    positions: new Map([
      ["near", { x: 102, y: 100 }],
      ["far", { x: 112, y: 100 }],
    ]),
  };
  assert.equal(nodeAtPoint(overlapDist, 100, 100)?.id, "near");

  // 3. Same visible radius and same center -> topmost (highest index) wins
  const overlapIndex = {
    nodes: [
      { id: "bottom", kind: "ring", weight: 2 },
      { id: "top", kind: "ring", weight: 2 },
    ],
    edges: [],
    positions: { bottom: { x: 100, y: 100 }, top: { x: 100, y: 100 } },
  };
  assert.equal(nodeAtPoint(overlapIndex, 100, 100)?.id, "top");

  // Custom radiusFor respected
  assert.equal(
    nodeAtPoint(overlapSize, 100, 100, { radiusFor: (n) => (n.id === "large" ? 10 : 30) })?.id,
    "large",
  );
});

// ---- visibleEdges ----

test("visibleEdges returns all valid edges when unselected and only touching edges when selected", () => {
  const graph = makeGraph(true);

  assert.equal(visibleEdges(graph, null).length, 3);
  assert.equal(visibleEdges(graph, undefined).length, 3);
  assert.equal(visibleEdges(graph, "").length, 3);

  // Format node has 2 incoming 'runs' edges
  const fmtEdges = visibleEdges(graph, "fmt_devlog01");
  assert.equal(fmtEdges.length, 2);
  assert.ok(fmtEdges.every((e) => e.kind === "runs" && e.to === "fmt_devlog01"));

  // Connected ring touches its 'runs' edge and the 'shares-member' edge
  const launchEdges = visibleEdges(graph, "ring_starlight_launch");
  assert.equal(launchEdges.length, 2);
  assert.deepEqual(
    launchEdges.map((e) => e.kind).sort(),
    ["runs", "shares-member"],
  );

  // Isolated ring touches no edges
  assert.deepEqual(visibleEdges(graph, "ring_starlight_fest"), []);

  // Filters malformed edges and handles null graph
  const messy = {
    edges: [
      null,
      { from: "a" },
      { to: "b" },
      { from: "a", to: "b", kind: "shares-tag" },
    ],
  };
  assert.equal(visibleEdges(messy, null).length, 1);
  assert.deepEqual(visibleEdges(null, "a"), []);
});

// ---- viewBoxFor ----

test("viewBoxFor contains all positioned nodes with margin and preserves aspect ratio", () => {
  for (const useMap of [true, false]) {
    const graph = makeGraph(useMap);
    const vb = viewBoxFor(graph, { width: 800, height: 500, margin: 64 });

    for (const k of ["x", "y", "w", "h"]) {
      assert.ok(Number.isFinite(vb[k]), `vb.${k} must be finite`);
    }
    assert.ok(Math.abs(vb.w / vb.h - 800 / 500) < 1e-9, "aspect ratio preserved");

    for (const node of graph.nodes) {
      const pos = positionOf(graph.positions, node.id);
      const r = defaultRadiusFor(node);
      assert.ok(vb.x <= pos.x - r, `${node.id} left edge inside viewBox`);
      assert.ok(vb.x + vb.w >= pos.x + r, `${node.id} right edge inside viewBox`);
      assert.ok(vb.y <= pos.y - r, `${node.id} top edge inside viewBox`);
      assert.ok(vb.y + vb.h >= pos.y + r, `${node.id} bottom edge inside viewBox`);
    }
  }
});

test("viewBoxFor handles empty, unpositioned, and single-node graphs safely", () => {
  // Empty graph -> sane default, never NaN
  const emptyVb = viewBoxFor({ nodes: [], edges: [], positions: new Map() });
  assert.deepEqual(emptyVb, { x: 0, y: 0, w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT });

  // Nodes without positions -> sane default with custom dimensions
  const unposVb = viewBoxFor(
    { nodes: [{ id: "ring_a", kind: "ring", weight: 1 }], edges: [], positions: {} },
    { width: 640, height: 480 },
  );
  assert.deepEqual(unposVb, { x: 0, y: 0, w: 640, h: 480 });

  // Single-node graph -> valid, non-degenerate box containing the node
  const single = {
    nodes: [NODES[3]], // isolated ring_starlight_fest
    edges: [],
    positions: new Map([["ring_starlight_fest", { x: 560, y: 260 }]]),
  };
  const singleVb = viewBoxFor(single);
  assert.ok(Number.isFinite(singleVb.x) && Number.isFinite(singleVb.y));
  assert.ok(singleVb.w >= 160 && singleVb.h >= 120);
  assert.ok(singleVb.x < 560 && singleVb.x + singleVb.w > 560);
  assert.ok(singleVb.y < 260 && singleVb.y + singleVb.h > 260);
});

// ---- formatUsageLine ----

test("formatUsageLine formats positive format weights and never outputs '0 rings'", () => {
  assert.equal(formatUsageLine({ kind: "format", weight: 1 }), "Used by 1 ring");
  assert.equal(formatUsageLine(NODES[2]), "Used by 2 rings"); // fmt_devlog01, weight 2
  assert.equal(formatUsageLine({ kind: "format", weight: 5 }), "Used by 5 rings");
  assert.equal(formatUsageLine({ kind: "format", weight: 2.9 }), "Used by 2 rings");

  // Never "0 rings"
  assert.equal(formatUsageLine({ kind: "format", weight: 0 }), "");
  assert.equal(formatUsageLine({ kind: "format", weight: -2 }), "");
  assert.equal(formatUsageLine({ kind: "format", weight: NaN }), "");
  assert.equal(formatUsageLine({ kind: "format", weight: Infinity }), "");
  assert.equal(formatUsageLine({ kind: "format" }), "");

  // Ring nodes and invalid inputs always return ""
  assert.equal(formatUsageLine(NODES[0]), "");
  assert.equal(formatUsageLine(NODES[1]), "");
  assert.equal(formatUsageLine(null), "");
  assert.equal(formatUsageLine(undefined), "");
});
