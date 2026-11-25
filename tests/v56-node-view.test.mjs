// V56 acceptance: label-aware d3-force layout, zero bounding-box overlaps on
// the 4-node demo graph (V74: Starlight-only), >= 12px CSS px label font-size floor, view-layer ring
// title resolution, and mobile bottom-sheet state helpers.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildGraph, layoutGraph, radiusForWeight } from "../src/graph.mjs";
import { demoCampaigns } from "../src/demo.mjs";
import {
  MIN_LABEL_CSS_PX,
  MOBILE_SHEET_BREAKPOINT,
  SHEET_SWIPE_DISMISS_PX,
  EDGE_LEGEND,
  displayLabelFor,
  wrapCanvasLabel,
  labelFontSizeFor,
  labelBoxFor,
  nodeTotalBoxFor,
  boxesOverlap,
  countLabelOverlaps,
  layoutWithLabels,
  viewBoxFor,
  isMobileSheetViewport,
  sheetStateFor,
  shouldDismissSheetSwipe,
} from "../src/node-view.mjs";

function loadDemoGraphFixture() {
  // V74: Starlight-only — the static list is empty (ToonSouls removed), so
  // the demo graph is the 3 seeded Starlight rings + fmt_algoigno = 4 nodes.
  const formatsData = JSON.parse(
    fs.readFileSync(new URL("../data/formats.json", import.meta.url), "utf8"),
  );
  const rings = demoCampaigns(new Date("2026-11-23T12:00:00Z"));
  const g = buildGraph({ rings, formats: formatsData.formats, usage: null });
  const positions = layoutGraph(g, { width: 800, height: 520 });
  const ringTitles = new Map(rings.map((r) => [r.id, r.title]));
  return {
    graph: { ...g, positions },
    rings,
    ringTitles,
    radiusFor: (n) => radiusForWeight(n.weight, n.kind),
  };
}

describe("V56 label-aware layout (demo graph)", () => {
  test("4 demo nodes lay out with strictly 0 bounding-box overlaps on desktop and mobile", () => {
    const { graph, ringTitles, radiusFor } = loadDemoGraphFixture();
    assert.equal(graph.nodes.length, 4, "demo graph should have 4 nodes (3 rings + 1 format)");

    // Desktop layout
    const desktopPos = layoutWithLabels(graph, {
      width: 800,
      height: 520,
      radiusFor,
      ringTitles,
      fontSize: 13,
    });
    const desktopGraph = { ...graph, positions: desktopPos };
    assert.equal(
      countLabelOverlaps(desktopGraph, { radiusFor, ringTitles, fontSize: 13 }),
      0,
      "desktop layout must have zero label/node bounding-box overlaps",
    );

    // Mobile-scaled layout (larger SVG font units so rendered CSS px stays >= 12px on 360px)
    const mobileFontSize = labelFontSizeFor(2.2, { targetCssPx: 12.5 });
    const mobilePos = layoutWithLabels(graph, {
      width: 420,
      height: 380,
      radiusFor,
      ringTitles,
      fontSize: mobileFontSize,
      padX: mobileFontSize * 1.4,
      padY: mobileFontSize * 1.15,
    });
    const mobileGraph = { ...graph, positions: mobilePos };
    assert.equal(
      countLabelOverlaps(mobileGraph, { radiusFor, ringTitles, fontSize: mobileFontSize }),
      0,
      "mobile-scaled layout must have zero label/node bounding-box overlaps",
    );
  });

  test("layoutWithLabels is deterministic across repeated runs", () => {
    const { graph, ringTitles, radiusFor } = loadDemoGraphFixture();
    const run1 = layoutWithLabels(graph, { width: 800, height: 520, radiusFor, ringTitles });
    const run2 = layoutWithLabels(graph, { width: 800, height: 520, radiusFor, ringTitles });
    for (const node of graph.nodes) {
      assert.deepEqual(run1.get(node.id), run2.get(node.id), `deterministic position for ${node.id}`);
    }
  });

  test("viewBoxFor contains every node AND its full wrapped label box with margin", () => {
    const { graph, ringTitles, radiusFor } = loadDemoGraphFixture();
    const pos = layoutWithLabels(graph, { width: 800, height: 520, radiusFor, ringTitles, fontSize: 13 });
    const laidOut = { ...graph, positions: pos };
    const vb = viewBoxFor(laidOut, {
      width: 800,
      height: 520,
      margin: 56,
      topClearance: 54,
      radiusFor,
      ringTitles,
      fontSize: 13,
    });

    for (const node of laidOut.nodes) {
      const p = laidOut.positions.get(node.id);
      const box = nodeTotalBoxFor(node, p, { radiusFor, ringTitles, fontSize: 13 });
      assert.ok(box.minX >= vb.x, `${node.id} label left inside viewBox`);
      assert.ok(box.maxX <= vb.x + vb.w, `${node.id} label right inside viewBox`);
      assert.ok(box.minY >= vb.y, `${node.id} top inside viewBox`);
      assert.ok(box.maxY <= vb.y + vb.h, `${node.id} label bottom inside viewBox`);
    }
  });
});

describe("V56 label font-size floor & wrapping", () => {
  test("labelFontSizeFor guarantees >= 12px CSS px across all viewport scales and zooms", () => {
    assert.equal(MIN_LABEL_CSS_PX, 12);
    for (const upp of [0.5, 1, 1.5, 2.2, 3.0]) {
      const svgPx = labelFontSizeFor(upp);
      const renderedCssPx = svgPx / upp;
      assert.ok(renderedCssPx >= MIN_LABEL_CSS_PX, `rendered CSS px (${renderedCssPx}) >= 12 at upp=${upp}`);

      // Even if caller requests smaller targetCssPx, floor holds at 12px
      const clampedSvgPx = labelFontSizeFor(upp, { targetCssPx: 7 });
      assert.ok(clampedSvgPx / upp >= MIN_LABEL_CSS_PX, "floor enforces >= 12px CSS px");
    }
  });

  test("wrapCanvasLabel wraps long template taglines to <= 2 lines with ellipsis", () => {
    const longTag = "MY GAME IS GOOD THE ALGORITHM JUST IGNORES ME";
    const lines = wrapCanvasLabel(longTag);
    assert.ok(lines.length <= 2, "at most 2 lines");
    assert.ok(lines[lines.length - 1].endsWith("\u2026"), "truncated with ellipsis");
    for (const line of lines) {
      assert.ok(line.length <= 22, `line within max width: "${line}"`);
    }

    assert.deepEqual(wrapCanvasLabel("Launch week push"), ["Launch week push"]);
  });

  test("boxesOverlap detects intersecting and disjoint boxes", () => {
    const a = { minX: 0, maxX: 100, minY: 0, maxY: 40 };
    const b = { minX: 90, maxX: 180, minY: 20, maxY: 60 };
    const c = { minX: 120, maxX: 200, minY: 0, maxY: 40 };
    assert.equal(boxesOverlap(a, b), true);
    assert.equal(boxesOverlap(a, c), false);
    assert.equal(boxesOverlap(a, c, 25, 0), true);
  });
});

describe("V56 view-layer ring display labels & legend", () => {
  test("displayLabelFor resolves distinct titles for all three Starlight Salvage rings", () => {
    const { graph, ringTitles } = loadDemoGraphFixture();
    const ringNodes = graph.nodes.filter((n) => n.kind === "ring");
    const labels = ringNodes.map((n) => displayLabelFor(n, { ringTitles }));
    const unique = new Set(labels);
    assert.equal(unique.size, ringNodes.length, `expected unique ring labels, got: ${labels.join(", ")}`);
    assert.ok(labels.includes("Launch week push"));
    assert.ok(labels.includes("Demo day push"));
    assert.ok(labels.includes("Steam Next Fest push"));
  });

  test("displayLabelFor prefers node.title when present, falls back to node.label then node.id", () => {
    assert.equal(
      displayLabelFor({ id: "ring:1", kind: "ring", title: "Demo Week", label: "Starlight Salvage" }),
      "Demo Week",
    );
    assert.equal(
      displayLabelFor({ id: "ring:1", kind: "ring", label: "Starlight Salvage" }),
      "Starlight Salvage",
    );
    assert.equal(
      displayLabelFor({ id: "ring:1", kind: "ring" }),
      "ring:1",
    );
    assert.equal(
      displayLabelFor({ id: "format:f1", kind: "format", label: "ONE MOMENT, ONE LINE" }),
      "ONE MOMENT, ONE LINE",
    );
  });

  test("EDGE_LEGEND covers all three edge kinds", () => {
    const kinds = EDGE_LEGEND.map((e) => e.kind);
    assert.deepEqual(kinds, ["runs", "shares-member", "shares-tag"]);
  });
});

describe("V56 mobile bottom-sheet state helpers", () => {
  test("isMobileSheetViewport switches at 900px breakpoint", () => {
    assert.equal(MOBILE_SHEET_BREAKPOINT, 900);
    assert.equal(isMobileSheetViewport(360), true);
    assert.equal(isMobileSheetViewport(899), true);
    assert.equal(isMobileSheetViewport(900), false);
    assert.equal(isMobileSheetViewport(1280), false);
  });

  test("sheetStateFor opens sheet on mobile only when a node is selected, always open panel on desktop", () => {
    assert.deepEqual(sheetStateFor(null, 360), {
      mode: "sheet",
      open: false,
      hasSelection: false,
      selectedId: null,
    });
    assert.deepEqual(sheetStateFor("ring:cmp_demo_launch", 360), {
      mode: "sheet",
      open: true,
      hasSelection: true,
      selectedId: "ring:cmp_demo_launch",
    });
    assert.deepEqual(sheetStateFor(null, 1280), {
      mode: "panel",
      open: true,
      hasSelection: false,
      selectedId: null,
    });
    assert.deepEqual(sheetStateFor("format:fmt_oneclip1", 1280), {
      mode: "panel",
      open: true,
      hasSelection: true,
      selectedId: "format:fmt_oneclip1",
    });
  });

  test("shouldDismissSheetSwipe triggers at or above threshold", () => {
    assert.equal(shouldDismissSheetSwipe(0), false);
    assert.equal(shouldDismissSheetSwipe(-20), false);
    assert.equal(shouldDismissSheetSwipe(SHEET_SWIPE_DISMISS_PX - 1), false);
    assert.equal(shouldDismissSheetSwipe(SHEET_SWIPE_DISMISS_PX), true);
    assert.equal(shouldDismissSheetSwipe(120), true);
  });
});
