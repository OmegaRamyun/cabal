// V73b acceptance: Modern Web Guidance mechanical swaps, part B.
// .toSorted() replaces copy-before-.sort() at three sites (atom,
// campaign-formats, node-view); first-run pitch line loses its em dash;
// format-detail tags join with ", " instead of " · ".
// Behaviour must equal the old sorted results, and no input is mutated.
import test from "node:test";
import assert from "node:assert/strict";

import { buildFeed } from "../src/atom.mjs";
import { formatsForDiscovery, mount as mountFormat } from "../src/campaign-formats.mjs";
import { layoutWithLabels } from "../src/node-view.mjs";
import { FIRST_RUN_COPY } from "../src/first-run.mjs";

// --- atom: buildFeed orders newest first, input untouched ---

const linkFor = (c) => `https://example.test/cabal/#c=${c.id}`;

const campaign = (id, createdAt) => ({
  id,
  title: `Campaign ${id}`,
  createdAt,
  demo: false,
  game: { name: `Game ${id}`, tags: ["cozy"] },
  anchorPost: { author: "@dev", platform: "x", text: "Hello." },
  members: [{ handle: "@dev", status: "posted" }],
  window: { start: "2026-11-20", end: "2026-11-27" },
});

test("atom buildFeed: newest first regardless of input order, input not mutated", () => {
  const older = campaign("cmp_old00001", "2026-11-20T09:00:00Z");
  const newer = campaign("cmp_new00001", "2026-11-23T10:00:00Z");
  const input = [older, newer];
  const snapshot = JSON.stringify(input);
  const xml = buildFeed(input, { linkFor });
  assert.equal(JSON.stringify(input), snapshot, "buildFeed must not mutate its input");
  assert.deepEqual([older, newer].map((c) => c.id), ["cmp_old00001", "cmp_new00001"]);
  // Newest entry first in the feed, same as the old .slice().sort() order.
  assert.ok(xml.indexOf("cmp_new00001") < xml.indexOf("cmp_old00001"));
  assert.match(xml, /<updated>2026-11-23T10:00:00Z<\/updated>/);
  // Same result when the input arrives in the opposite order.
  assert.equal(buildFeed([newer, older], { linkFor }), xml);
});

// --- campaign-formats: formatsForDiscovery ordering, input untouched ---

const format = (id) => ({ id, tagline: `Format ${id}`, description: "d", howTo: "h" });

test("formatsForDiscovery: id order without usage, input not mutated", () => {
  const a = format("fmt_aaaa0001");
  const b = format("fmt_bbbb0002");
  const c = format("fmt_cccc0003");
  const input = [c, a, b];
  const snapshot = JSON.stringify(input);
  const out = formatsForDiscovery(input);
  assert.equal(JSON.stringify(input), snapshot, "formatsForDiscovery must not mutate its input");
  assert.deepEqual(out.map((f) => f.id), ["fmt_aaaa0001", "fmt_bbbb0002", "fmt_cccc0003"]);
  assert.deepEqual(formatsForDiscovery([b, c, a]).map((f) => f.id), out.map((f) => f.id));
});

test("formatsForDiscovery: usage count still outranks id order", () => {
  const a = format("fmt_aaaa0001");
  const b = format("fmt_bbbb0002");
  const usage = new Map([["fmt_bbbb0002", 3], ["fmt_aaaa0001", 1]]);
  assert.deepEqual(
    formatsForDiscovery([a, b], { usage }).map((f) => f.id),
    ["fmt_bbbb0002", "fmt_aaaa0001"],
  );
});

// --- campaign-formats: tags join with ", " ---

class FakeEl {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.className = "";
    this._text = "";
    this._l = {};
    this.value = "";
    this.hidden = false;
  }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(" "); }
  set textContent(v) { this._text = v ?? ""; this.children = []; }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(t, f) { (this._l[t] ||= []).push(f); }
  setAttribute() {}
  findByClass(cls, out = []) {
    for (const c of this.children) {
      if (String(c.className || "").split(" ").includes(cls)) out.push(c);
      c.findByClass(cls, out);
    }
    return out;
  }
}

test("format detail: tags joined with ', ', no middle dot", () => {
  const root = new FakeEl("div");
  root.ownerDocument = { createElement: (t) => new FakeEl(t) };
  const f = {
    id: "fmt_tags0001",
    tagline: "Tagged format",
    description: "A format with tags.",
    howTo: "Post once.",
    tags: ["devlog", "clips", "cozy"],
  };
  mountFormat(root, { format: f, rings: [] });
  const tags = root.findByClass("format-tags");
  assert.equal(tags.length, 1);
  assert.equal(tags[0].textContent, "devlog, clips, cozy");
  assert.ok(!tags[0].textContent.includes("·"), "no middle-dot separator");
});

// --- node-view: layoutWithLabels order-independent, input untouched ---

test("layoutWithLabels: same positions regardless of input order, input not mutated", () => {
  const nodes = [
    { id: "n-b", label: "B" },
    { id: "n-a", label: "A" },
    { id: "n-c", label: "C" },
  ];
  const snapshot = JSON.stringify(nodes);
  const first = layoutWithLabels({ nodes });
  assert.equal(JSON.stringify(nodes), snapshot, "layoutWithLabels must not mutate its input");
  const swapped = layoutWithLabels({ nodes: [nodes[2], nodes[0], nodes[1]] });
  assert.deepEqual([...swapped.keys()].sort(), ["n-a", "n-b", "n-c"]);
  for (const [id, pos] of first) {
    assert.deepEqual(swapped.get(id), pos, `position of ${id} must not depend on input order`);
  }
});

// --- first-run: pitch line has no em dash ---

test("first-run pitch line: no em dash, still the same pitch", () => {
  const sentence = FIRST_RUN_COPY.sentence;
  assert.ok(!sentence.includes("—"), "pitch line must not contain an em dash");
  assert.match(sentence, /^Cabal:/);
  assert.match(sentence, /small rings of indie devs boost each other’s posts, in their own words/);
  assert.match(sentence, /No accounts\.$/);
});
