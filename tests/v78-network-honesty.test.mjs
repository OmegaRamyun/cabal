// V78 — Network honesty (F4) + DEMO sentence-case.
// (a) The ≥2-dev + real-game-page discovery gate is stated on the Network
// view itself (populated panel reuses EMPTY_STATE_COPY verbatim), and the
// Rings/Templates chips actually filter the visible "Nodes in view" list.
// The gate itself is NOT weakened: isListable still requires a Steam/itch
// http(s) game page AND >= 2 members.
// (b) Rendered demo badges read "Demo" / "Demo mode" (sentence case),
// never the old uppercase literals; the `demo-badge` CSS class is unchanged.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { isListable, mergeLists, mount as mountDiscovery } from "../src/discovery.mjs";
import { DEMO_BADGE, demoBadge, demoCampaigns, mount as mountDemo } from "../src/demo.mjs";
import {
  EMPTY_STATE_COPY,
  visibleNodesForFilter,
  mount as mountNodes,
} from "../src/node-view.mjs";
import { mount as mountFormat } from "../src/campaign-formats.mjs";
import { buildGraph, layoutGraph, radiusForWeight } from "../src/graph.mjs";

// --- Minimal DOM shim (same shape as the v24/v59 FakeEl) ---
class FakeEl {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this._text = "";
    this._listeners = {};
    this._attrs = {};
    this.style = {};
    this._classes = new Set();
    this.classList = {
      add: (...cs) => { for (const c of cs) this._classes.add(c); this._syncClass(); },
      remove: (...cs) => { for (const c of cs) this._classes.delete(c); this._syncClass(); },
      toggle: (c, force) => {
        const on = force === undefined ? !this._classes.has(c) : !!force;
        if (on) this._classes.add(c); else this._classes.delete(c);
        this._syncClass();
        return on;
      },
      contains: (c) => this._classes.has(c),
    };
  }
  _syncClass() { this._className = [...this._classes].join(" "); }
  get className() { return this._className || ""; }
  set className(v) {
    this._className = v || "";
    this._classes = new Set(String(v || "").split(" ").filter(Boolean));
  }
  get textContent() {
    return this._text + this.children.map((c) => c.textContent).join("");
  }
  set textContent(v) {
    this._text = v ?? "";
    this.children = [];
  }
  appendChild(child) {
    if (child.parentNode) {
      const i = child.parentNode.children.indexOf(child);
      if (i >= 0) child.parentNode.children.splice(i, 1);
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return this._attrs[k] ?? null; }
  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) {
    this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn);
  }
  click() { for (const fn of this._listeners.click || []) fn(); }
  getBoundingClientRect() { return { width: 800, height: 520, left: 0, top: 0 }; }
  remove() {
    if (this.parentNode) {
      const i = this.parentNode.children.indexOf(this);
      if (i >= 0) this.parentNode.children.splice(i, 1);
      this.parentNode = null;
    }
  }
  all(pred, out = []) {
    for (const c of this.children) {
      if (pred(c)) out.push(c);
      c.all(pred, out);
    }
    return out;
  }
}

function makeDoc() {
  const body = new FakeEl("body");
  const doc = {
    body,
    defaultView: null,
    createElement: (tag) => new FakeEl(tag),
    createElementNS: (_ns, tag) => new FakeEl(tag),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  body.ownerDocument = doc;
  return doc;
}

function makeRoot() {
  const doc = makeDoc();
  const root = new FakeEl("div");
  root.ownerDocument = doc;
  return root;
}

function makeCampaign(overrides = {}) {
  return {
    id: "cmp_v78_0001",
    game: {
      name: "V78 Game",
      links: { steam: "https://store.steampowered.com/app/1/V78_Game/" },
      tags: ["cozy"],
    },
    title: "V78 ring",
    members: [
      { name: "Creator", handle: "@creator", status: "posted" },
      { name: "Joiner", handle: "@joiner", status: "pending" },
    ],
    ...overrides,
  };
}

function loadNodeGraphFixture() {
  const staticData = JSON.parse(
    fs.readFileSync(new URL("../data/campaigns.json", import.meta.url), "utf8"),
  );
  const formatsData = JSON.parse(
    fs.readFileSync(new URL("../data/formats.json", import.meta.url), "utf8"),
  );
  const rings = mergeLists(
    staticData.campaigns,
    demoCampaigns(new Date("2026-11-23T12:00:00Z")),
  );
  const g = buildGraph({ rings, formats: formatsData.formats, usage: null });
  const positions = layoutGraph(g, { width: 800, height: 520 });
  return {
    graph: { ...g, positions },
    rings,
    radiusFor: (n) => radiusForWeight(n.weight, n.kind),
  };
}

// --- The gate, verified against isListable (src/discovery.mjs:32) ---

describe("V78 gate: isListable is unchanged (Steam/itch http(s) page + >= 2 members)", () => {
  test("1 member with a valid game page is NOT listable", () => {
    assert.equal(
      isListable(makeCampaign({ members: [{ name: "Solo", handle: "@solo", status: "pending" }] })),
      false,
    );
  });

  test("2 members with no game page is NOT listable", () => {
    assert.equal(
      isListable(makeCampaign({ game: { name: "No Links", links: {}, tags: [] } })),
      false,
    );
  });

  test("2 members + itch page IS listable", () => {
    assert.equal(
      isListable(makeCampaign({
        game: { name: "Itch Game", links: { itch: "https://dev.itch.io/game" }, tags: [] },
      })),
      true,
    );
  });

  test("gate copy states both halves of the gate", () => {
    assert.match(EMPTY_STATE_COPY, /two devs/);
    assert.match(EMPTY_STATE_COPY, /Steam or itch\.io/);
  });
});

// --- Rings/Templates tabs filter the visible list ---

describe("V78 visibleNodesForFilter (pure)", () => {
  const nodes = [
    { id: "r1", kind: "ring" },
    { id: "f1", kind: "format" },
    { id: "r2", kind: "ring" },
  ];

  test("'all' keeps rings and templates", () => {
    assert.deepEqual(visibleNodesForFilter(nodes, "all").map((n) => n.id), ["r1", "f1", "r2"]);
  });

  test("'ring' keeps rings only", () => {
    assert.deepEqual(visibleNodesForFilter(nodes, "ring").map((n) => n.id), ["r1", "r2"]);
  });

  test("'format' keeps templates only", () => {
    assert.deepEqual(visibleNodesForFilter(nodes, "format").map((n) => n.id), ["f1"]);
  });

  test("unknown filter falls back to all", () => {
    assert.equal(visibleNodesForFilter(nodes, "bogus").length, 3);
  });
});

describe("V78 node view: gate copy + chips filter the Nodes in view list", () => {
  function mounted() {
    const { graph, rings, radiusFor } = loadNodeGraphFixture();
    const root = makeRoot();
    mountNodes(root, { graph, positions: graph.positions, rings, radiusFor });
    return root;
  }

  function quicklistKinds(root) {
    const list = root.all((n) => n.className.split(" ").includes("node-panel-quicklist"))[0];
    assert.ok(list, "Nodes in view list exists");
    return list.all((n) => n.className.split(" ").includes("node-panel-conn-rel"))
      .map((n) => n.textContent);
  }

  function clickChip(root, label) {
    const chip = root.all(
      (n) => n.tagName === "BUTTON" && n.className.split(" ").includes("node-chip") && n.textContent === label,
    )[0];
    assert.ok(chip, `chip "${label}" exists`);
    chip.click();
  }

  test("populated panel states the gate (same copy as the empty state)", () => {
    const root = mounted();
    assert.ok(root.textContent.includes(EMPTY_STATE_COPY));
  });

  test("All lists rings + templates; Templates lists templates only; Rings lists rings only", () => {
    const root = mounted();
    const all = quicklistKinds(root);
    assert.ok(all.includes("Ring"), "All shows rings");
    assert.ok(all.includes("Template"), "All shows templates");

    clickChip(root, "Templates");
    const templates = quicklistKinds(root);
    assert.ok(templates.length > 0);
    assert.ok(templates.every((k) => k === "Template"), `Templates filter: ${templates.join(",")}`);

    clickChip(root, "Rings");
    const rings = quicklistKinds(root);
    assert.ok(rings.length > 0);
    assert.ok(rings.every((k) => k === "Ring"), `Rings filter: ${rings.join(",")}`);

    clickChip(root, "All");
    assert.deepEqual(quicklistKinds(root).sort(), all.sort());
  });
});

// --- Demo badge sentence-case, everywhere it renders in owned files ---

describe("V78 demo badge sentence-case", () => {
  test("DEMO_BADGE / demoBadge render 'Demo', never 'DEMO'", () => {
    assert.equal(DEMO_BADGE, "Demo");
    assert.equal(demoBadge(demoCampaigns(new Date("2026-11-23T12:00:00Z"))[0]), "Demo");
    assert.equal(demoBadge({ demo: false }), "");
  });

  test("demo banner reads 'Demo mode', not 'DEMO MODE'", () => {
    const root = makeRoot();
    mountDemo(root, {});
    assert.ok(root.textContent.includes("Demo mode"));
    assert.ok(!root.textContent.includes("DEMO MODE"));
  });

  test("discovery rows render 'Demo', not 'DEMO'", () => {
    // V74 removed the live static list (data/campaigns.json is now []), so
    // this test uses the Starlight demo rings instead of the shipped list.
    const root = makeRoot();
    mountDiscovery(root, {
      myTags: ["cozy"],
      campaigns: demoCampaigns(new Date("2026-11-23T12:00:00Z")),
      navigate: () => {},
    });
    assert.ok(root.textContent.includes("Demo"));
    assert.ok(!root.textContent.includes("DEMO"));
  });

  test("template detail renders 'Demo', not 'DEMO'", () => {
    const formatsData = JSON.parse(
      fs.readFileSync(new URL("../data/formats.json", import.meta.url), "utf8"),
    );
    const root = makeRoot();
    mountFormat(root, {
      format: { ...formatsData.formats[0], demo: true },
      rings: [],
    });
    assert.ok(root.textContent.includes("Demo"));
    assert.ok(!root.textContent.includes("DEMO"));
  });

  test("node panel for a demo ring renders 'Demo', not 'DEMO'", () => {
    const { graph, rings, radiusFor } = loadNodeGraphFixture();
    const root = makeRoot();
    mountNodes(root, { graph, positions: graph.positions, rings, radiusFor });
    // Open the first demo ring from the quicklist.
    const ringBtn = root.all(
      (n) => n.tagName === "BUTTON" && n.className.split(" ").includes("node-panel-conn-btn"),
    ).find((b) => b.textContent.includes("Launch week push"));
    assert.ok(ringBtn, "demo ring quicklist button exists");
    ringBtn.click();
    const panel = root.all((n) => n.className.split(" ").includes("node-panel"))[0];
    assert.ok(panel, "node panel exists");
    assert.ok(panel.textContent.includes("Demo"));
    assert.ok(!panel.textContent.includes("DEMO"));
  });
});
