// V45 acceptance: formats model + Rings/Campaigns split. DOM (home heading,
// format detail, Campaigns list) is a manual check, see tasks/V45 doc.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createFormat, validateFormat, normalizeFormat, formatIdForRing,
  ringsRunningFormat, formatsForDiscovery, usageLabel, mount as mountFormat,
} from "../src/campaign-formats.mjs";
import { mount as mountDiscovery } from "../src/discovery.mjs";
import { INTRO_PAGES } from "../src/intro.mjs";

const seed = JSON.parse(readFileSync(new URL("../data/formats.json", import.meta.url), "utf8")).formats;
const valid = {
  id: "fmt_abcd1234", tagline: "A TAGLINE", description: "What it is.",
  howTo: "Shape, in your own words.",
  examples: [{ url: "https://example.com/a", platform: "x", note: "n" }], tags: ["meme"],
};

test("createFormat: valid input gets a fmt_ id; invalid throws listing errors", () => {
  const f = createFormat({ tagline: "T", description: "d", howTo: "h" });
  assert.match(f.id, /^fmt_[a-z0-9]{8}$/);
  assert.deepEqual(f.examples, []);
  assert.throws(() => createFormat({ tagline: "", description: "d" }), /Invalid format:.*tagline.*howTo/);
  assert.throws(() => createFormat({ id: "bad", tagline: "T", description: "d", howTo: "h" }), /id:/);
});

test("validateFormat: valid, and each failure class", () => {
  assert.deepEqual(validateFormat(valid), []);
  assert.ok(validateFormat(null).length);
  assert.ok(validateFormat({ ...valid, examples: [{ url: "javascript:1", platform: "x" }] }).some((e) => /url/.test(e)));
  assert.ok(validateFormat({ ...valid, tags: ["Upper"] }).some((e) => /tags/.test(e)));
  assert.ok(validateFormat({ ...valid, examples: "no" }).some((e) => /examples/.test(e)));
});

test("seed formats: three, valid, demo-flagged, flagship first", () => {
  assert.equal(seed.length, 3);
  for (const f of seed) {
    assert.deepEqual(validateFormat(f), [], f.id);
    assert.equal(f.demo, true);
  }
  assert.equal(seed[0].tagline, "MY GAME IS GOOD THE ALGORITHM JUST IGNORES ME");
});

test("normalizeFormat: tolerates missing and malformed input, never throws", () => {
  const n = normalizeFormat({ id: "fmt_abcd1234", tagline: " T " });
  assert.deepEqual([n.examples, n.tags, n.description], [[], [], ""]);
  assert.equal(n.tagline, "T");
  for (const bad of [null, undefined, 5, "x", [], { examples: "q", tags: 7, description: 3 }]) {
    const r = normalizeFormat(bad);
    assert.deepEqual([r.examples, r.tags, r.description], [[], [], ""]);
  }
  assert.deepEqual(normalizeFormat({ tags: [" Meme ", "meme", ""] }).tags, ["meme"]);
});

test("formatIdForRing + ringsRunningFormat: match, no-match, no formatId", () => {
  assert.equal(formatIdForRing({ formatId: " fmt_abcd1234 " }), "fmt_abcd1234");
  assert.equal(formatIdForRing({}), null);
  assert.equal(formatIdForRing({ formatId: null }), null);
  const rings = [{ id: "a", formatId: "fmt_abcd1234" }, { id: "b", formatId: "FMT_ABCD1234" },
    { id: "c" }, { id: "d", formatId: null }, { id: "e", formatId: "fmt_other000" }];
  assert.deepEqual(ringsRunningFormat("fmt_abcd1234", rings).map((r) => r.id), ["a", "b"]);
  assert.deepEqual(ringsRunningFormat("fmt_none0000", rings), []);
  assert.deepEqual(ringsRunningFormat("fmt_abcd1234", null), []);
  assert.deepEqual(ringsRunningFormat("", rings), []);
});

test("formatsForDiscovery: usage first, member-count tiebreak; fallback without usage", () => {
  const fs = [{ id: "fmt_aaaaaaaa" }, { id: "fmt_bbbbbbbb" }, { id: "fmt_cccccccc" }];
  const rings = [{ formatId: "fmt_cccccccc", members: [1, 2, 3] }, { formatId: "fmt_bbbbbbbb", members: [1] }];
  const usage = new Map([["fmt_aaaaaaaa", 2], ["fmt_bbbbbbbb", 2], ["fmt_cccccccc", 1]]);
  const ids = (l) => l.map((f) => f.id);
  // a and b tie on usage 2; b has more local members than a (1 vs 0) -> b first
  assert.deepEqual(ids(formatsForDiscovery(fs, { usage, rings })), ["fmt_bbbbbbbb", "fmt_aaaaaaaa", "fmt_cccccccc"]);
  // no usage: member-count order alone (c has 3, b has 1, a has 0)
  assert.deepEqual(ids(formatsForDiscovery(fs, { rings })), ["fmt_cccccccc", "fmt_bbbbbbbb", "fmt_aaaaaaaa"]);
  // no usage, no rings: stable id order
  assert.deepEqual(ids(formatsForDiscovery([fs[2], fs[0], fs[1]])), ["fmt_aaaaaaaa", "fmt_bbbbbbbb", "fmt_cccccccc"]);
  assert.deepEqual(formatsForDiscovery(null), []);
  // pair-array usage shape also accepted
  assert.equal(ids(formatsForDiscovery(fs, { usage: [["fmt_cccccccc", 9]] }))[0], "fmt_cccccccc");
});

test("usageLabel: never invents a count", () => {
  assert.equal(usageLabel("fmt_aaaaaaaa", undefined), null);
  assert.equal(usageLabel("fmt_aaaaaaaa", new Map()), null);
  assert.equal(usageLabel("fmt_aaaaaaaa", new Map([["fmt_aaaaaaaa", 1]])), "used by 1 ring");
  assert.equal(usageLabel("fmt_aaaaaaaa", new Map([["fmt_aaaaaaaa", 4]])), "used by 4 rings");
});

test("intro: What page names the Rings / Campaigns split", () => {
  const what = INTRO_PAGES.find((p) => p.id === "intro");
  assert.ok(what.sections.some((s) => s.heading === "Rings and Campaigns"));
});

// --- minimal fake DOM for mount ---
class FakeEl {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.className = ""; this._text = ""; this._l = {}; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(" "); }
  set textContent(v) { this._text = v ?? ""; this.children = []; }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(t, f) { (this._l[t] ||= []).push(f); }
  all(tag, out = []) { for (const c of this.children) { if (c.tagName === tag.toUpperCase()) out.push(c); c.all(tag, out); } return out; }
}
const fresh = () => { const r = new FakeEl("div"); r.ownerDocument = { createElement: (t) => new FakeEl(t) }; return r; };

test("format mount: renders sections, rings running it, drops unsafe example URLs", () => {
  const root = fresh();
  const f = { ...valid, demo: true, examples: [...valid.examples, { url: "javascript:alert(1)", platform: "x" }] };
  mountFormat(root, { format: f, rings: [{ id: "r1", title: "Ring One", formatId: valid.id }, { id: "r2", title: "Other" }] });
  const t = root.textContent;
  for (const s of ["A TAGLINE", "What it is.", "How to run it", "Example uses", "Ring One", "DEMO", "Start a ring"]) assert.ok(t.includes(s), s);
  assert.ok(!t.includes("Other"));
  assert.ok(!t.includes("used by"));
  assert.equal(root.all("a").filter((a) => a.href?.startsWith("javascript")).length, 0);
  mountFormat(root, { formats: [valid], formatId: "FMT_ABCD1234" });
  assert.ok(root.textContent.includes("No rings are running"));
  mountFormat(root, { format: null });
  assert.ok(root.textContent.includes("not found"));
});

test("discovery mount: Campaigns list renders formats, usage order, falls back without usage", () => {
  const fs = seed;
  const usage = new Map([[fs[2].id, 5], [fs[1].id, 1]]);
  const withUsage = fresh();
  mountDiscovery(withUsage, { campaigns: [], formats: fs, sortByUsage: usage });
  const t = withUsage.textContent;
  assert.ok(t.includes("Campaigns") && t.includes("used by 5 rings"));
  assert.ok(t.indexOf(fs[2].tagline) < t.indexOf(fs[1].tagline));
  const without = fresh();
  mountDiscovery(without, { campaigns: [], formats: fs });
  assert.ok(!without.textContent.includes("used by"));
  const legacy = fresh();
  mountDiscovery(legacy, { campaigns: [] });
  assert.ok(!legacy.textContent.includes("Campaigns") && legacy.textContent.includes("Similar games"));
});
