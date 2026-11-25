import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isListable,
  tagSimilarity,
  similarCampaigns,
  popularCampaigns,
  mergeLists,
  postedCount,
  mount,
} from "../src/discovery.mjs";

const staticList = JSON.parse(
  readFileSync(new URL("../data/campaigns.json", import.meta.url)),
);

function makeCampaign(overrides = {}) {
  const base = {
    id: "cmp_test0001",
    game: {
      name: "Test Game",
      links: { steam: "https://store.steampowered.com/app/1/Test_Game/" },
      tags: ["cozy", "farming"],
    },
    title: "Test campaign",
    anchorPost: {
      platform: "x",
      url: "https://x.com/test/status/1",
      text: "Hello.",
      author: "@test",
    },
    window: null,
    members: [
      { name: "Creator", handle: "@creator", status: "posted" },
      { name: "Joiner", handle: "@joiner", status: "pending" },
    ],
    createdAt: "2026-11-22T09:00:00Z",
  };
  return { ...base, ...overrides };
}

// --- isListable ---

test("isListable: no game link -> false", () => {
  const c = makeCampaign({ game: { name: "No Links", links: {}, tags: [] } });
  assert.equal(isListable(c), false);
});

test("isListable: non-http(s) game link -> false", () => {
  const c = makeCampaign({
    game: { name: "Bad Link", links: { itch: "ftp://example.com/game" }, tags: [] },
  });
  assert.equal(isListable(c), false);
  const c2 = makeCampaign({
    game: { name: "Bad Link", links: { steam: "not a url" }, tags: [] },
  });
  assert.equal(isListable(c2), false);
});

test("isListable: 1 member -> false", () => {
  const c = makeCampaign({
    members: [{ name: "Solo", handle: "@solo", status: "pending" }],
  });
  assert.equal(isListable(c), false);
});

test("isListable: both filters met -> true (steam and itch-only)", () => {
  assert.equal(isListable(makeCampaign()), true);
  const itchOnly = makeCampaign({
    game: { name: "Itch Game", links: { itch: "https://dev.itch.io/game" }, tags: [] },
  });
  assert.equal(isListable(itchOnly), true);
});

// --- tagSimilarity (Jaccard, case-insensitive) ---

test("tagSimilarity: identical 1, disjoint 0, empty 0, case-insensitive", () => {
  assert.equal(tagSimilarity(["cozy", "farming"], ["cozy", "farming"]), 1);
  assert.equal(tagSimilarity(["cozy"], ["horror"]), 0);
  assert.equal(tagSimilarity([], []), 0);
  assert.equal(tagSimilarity(["Cozy", "FARMING"], ["cozy", "farming"]), 1);
});

test("tagSimilarity ordering: closer tag sets score higher", () => {
  const mine = ["cozy", "farming", "pixel"];
  const close = tagSimilarity(mine, ["cozy", "farming"]);
  const far = tagSimilarity(mine, ["cozy", "horror"]);
  const none = tagSimilarity(mine, ["horror", "shooter"]);
  assert.ok(close > far && far > none);
  assert.equal(close, 2 / 3);
  assert.equal(far, 1 / 4);
});

// --- similarCampaigns / popularCampaigns ---

test("similarCampaigns: listable only, similarity desc, ties by members desc", () => {
  const unlistable = makeCampaign({
    id: "cmp_hidden01",
    game: { name: "Hidden", links: {}, tags: ["cozy", "farming", "pixel"] },
  });
  const best = makeCampaign({
    id: "cmp_best0001",
    game: {
      name: "Best Match",
      links: { steam: "https://store.steampowered.com/app/2/Best/" },
      tags: ["cozy", "farming", "pixel"],
    },
  });
  const tiedSmall = makeCampaign({
    id: "cmp_tied0001",
    game: {
      name: "Tied Small",
      links: { steam: "https://store.steampowered.com/app/3/Tied_Small/" },
      tags: ["cozy", "farming"],
    },
  });
  const tiedBig = makeCampaign({
    id: "cmp_tied0002",
    game: {
      name: "Tied Big",
      links: { steam: "https://store.steampowered.com/app/4/Tied_Big/" },
      tags: ["cozy", "farming"],
    },
    members: [
      { name: "A", handle: "@a", status: "posted" },
      { name: "B", handle: "@b", status: "posted" },
      { name: "C", handle: "@c", status: "pending" },
    ],
  });
  const out = similarCampaigns(
    ["cozy", "farming", "pixel"],
    [tiedSmall, unlistable, tiedBig, best],
  );
  assert.deepEqual(
    out.map((c) => c.id),
    ["cmp_best0001", "cmp_tied0002", "cmp_tied0001"],
  );
});

test("popularCampaigns: listable only, members desc", () => {
  const small = makeCampaign({ id: "cmp_small001" });
  const big = makeCampaign({
    id: "cmp_big00001",
    members: [
      { name: "A", handle: "@a", status: "posted" },
      { name: "B", handle: "@b", status: "posted" },
      { name: "C", handle: "@c", status: "pending" },
      { name: "D", handle: "@d", status: "pending" },
    ],
  });
  const hidden = makeCampaign({
    id: "cmp_hidden02",
    members: Array.from({ length: 9 }, (_, i) => ({
      name: `M${i}`,
      handle: `@m${i}`,
      status: "pending",
    })),
    game: { name: "Hidden", links: {}, tags: [] },
  });
  assert.deepEqual(
    popularCampaigns([small, hidden, big]).map((c) => c.id),
    ["cmp_big00001", "cmp_small001"],
  );
});

test("postedCount counts distinct contributing handles (legacy posted members migrate to assists)", () => {
  assert.equal(postedCount(makeCampaign()), 1);
  assert.equal(postedCount(makeCampaign({ members: [] })), 0);
});

// --- mergeLists ---

test("mergeLists: dedupe by id, local wins, local-only appended", () => {
  const a = makeCampaign({ id: "cmp_a0000001", title: "Static A" });
  const b = makeCampaign({ id: "cmp_b0000001", title: "Static B" });
  const bLocal = makeCampaign({ id: "cmp_b0000001", title: "Local B" });
  const cLocal = makeCampaign({ id: "cmp_c0000001", title: "Local C" });
  const out = mergeLists([a, b], [bLocal, cLocal]);
  assert.deepEqual(out.map((c) => c.id), ["cmp_a0000001", "cmp_b0000001", "cmp_c0000001"]);
  assert.equal(out[1].title, "Local B");
});

// --- data/campaigns.json ---

test("data/campaigns.json: empty static list — no shipped campaign (V74 removed ToonSouls)", () => {
  assert.equal(staticList.version, 1);
  assert.equal(staticList.updated, "2026-11-24");
  assert.deepEqual(staticList.campaigns, []);
});

// --- mount (minimal fake DOM; real browser check is a manual note) ---

class FakeEl {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.className = "";
    this._text = "";
    this._listeners = {};
    this.ownerDocument = null;
  }
  get textContent() {
    return this._text + this.children.map((c) => c.textContent).join("");
  }
  set textContent(v) {
    this._text = v ?? "";
    this.children = [];
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  addEventListener(type, fn) {
    (this._listeners[type] ||= []).push(fn);
  }
  click() {
    for (const fn of this._listeners.click || []) fn();
  }
  querySelectorAll(sel) {
    const out = [];
    const walk = (n) => {
      for (const ch of n.children) {
        if (sel.startsWith(".") ? ch.className.split(" ").includes(sel.slice(1))
          : ch.tagName === sel.toUpperCase()) out.push(ch);
        walk(ch);
      }
    };
    walk(this);
    return out;
  }
}

test("mount: renders Similar + Popular sections, row detail, DEMO badge, click navigates", () => {
  const doc = { createElement: (tag) => new FakeEl(tag) };
  const root = new FakeEl("div");
  root.ownerDocument = doc;
  // Inline fixture (V74): the static list is empty now, so the mount test
  // builds its demo ring here instead of reading staticList.campaigns[0].
  const demo = makeCampaign({
    id: "cmp_inline01",
    demo: true,
    title: "Pixel Orchard launch week",
    game: {
      name: "Pixel Orchard",
      links: { steam: "https://store.steampowered.com/app/6/Pixel_Orchard/" },
      tags: ["cozy", "farming"],
    },
  });
  const plain = makeCampaign({ id: "cmp_plain001", game: { name: "Plain Game", links: { steam: "https://store.steampowered.com/app/5/Plain/" }, tags: ["cozy"] } });
  const navigated = [];
  mount(root, { myTags: ["cozy", "farming"], campaigns: [demo, plain], navigate: (c) => navigated.push(c.id) });

  const text = root.textContent;
  assert.ok(text.includes("Similar games"));
  assert.ok(text.includes("Popular"));
  assert.ok(text.includes("Pixel Orchard"));
  assert.ok(text.includes("Pixel Orchard launch week"));
  assert.ok(text.includes("2 members, 1 ringmate has contributed"));
  assert.ok(text.includes("cozy, farming"));
  assert.ok(text.includes("DEMO"));

  const buttons = root.querySelectorAll("button");
  assert.ok(buttons.length >= 2);
  buttons[0].click();
  assert.equal(navigated.length, 1);
  assert.ok(["cmp_inline01", "cmp_plain001"].includes(navigated[0]));
});
