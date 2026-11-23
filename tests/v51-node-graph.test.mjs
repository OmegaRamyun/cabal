import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGraph, radiusForWeight, layoutGraph } from "../src/graph.mjs";
import { ringsRunningFormat } from "../src/campaign-formats.mjs";

const link = { steam: "https://store.steampowered.com/app/1/x/" };
const ring = (id, handles, tags = [], extra = {}) => ({
  id,
  game: { name: id.toUpperCase(), links: link, tags },
  members: handles.map((h) => ({ name: h, handle: h })),
  ...extra,
});
const fmt = (id) => ({ id, tagline: `tag ${id}`, description: "d", howTo: "h", tags: [] });

const rings = [
  ring("cmp_a", ["@wren", "@moss"], ["souls-like", "cartoon"], { formatId: "fmt_aaaaaaaa" }),
  ring("cmp_b", ["@MOSS", "@kit"], ["souls-like"], { formatId: "fmt_aaaaaaaa" }),
  ring("cmp_c", ["@zed", "@yu"], ["cartoon"]),
  ring("cmp_d", ["@solo"], ["cartoon"]), // 1 member
  { id: "cmp_e", game: { name: "E", links: {}, tags: [] }, members: [{ handle: "@a" }, { handle: "@b" }] }, // no page
];
const formats = [fmt("fmt_aaaaaaaa"), fmt("fmt_bbbbbbbb"), fmt("fmt_cccccccc")];

test("only listable rings become nodes", () => {
  const g = buildGraph({ rings, formats });
  const ids = g.nodes.filter((n) => n.kind === "ring").map((n) => n.ref).sort();
  assert.deepEqual(ids, ["cmp_a", "cmp_b", "cmp_c"]);
});

test("format nodes need a using ring (local or relay)", () => {
  let g = buildGraph({ rings, formats });
  const fmts = (gr) => gr.nodes.filter((n) => n.kind === "format").map((n) => n.ref);
  assert.deepEqual(fmts(g), ["fmt_aaaaaaaa"]);
  assert.equal(g.nodes.find((n) => n.ref === "fmt_aaaaaaaa").weight, 2);
  g = buildGraph({ rings, formats, usage: new Map([["fmt_bbbbbbbb", { rings: new Set(["pk1"]), assists: 0 }]]) });
  assert.deepEqual(fmts(g).sort(), ["fmt_aaaaaaaa", "fmt_bbbbbbbb"]);
  // zero relay count does not admit
  g = buildGraph({ rings, formats, usage: new Map([["fmt_cccccccc", { rings: new Set(), assists: 4 }]]) });
  assert.ok(!fmts(g).includes("fmt_cccccccc"));
});

test("format weight prefers relay distinct-ring count, else local", () => {
  const usage = new Map([["fmt_aaaaaaaa", { rings: new Set(["p1", "p2", "p3"]), assists: 0 }]]);
  const g = buildGraph({ rings, formats, usage });
  assert.equal(g.nodes.find((n) => n.ref === "fmt_aaaaaaaa").weight, 3);
});

test("runs edges match ringsRunningFormat exactly", () => {
  const g = buildGraph({ rings, formats });
  const runs = g.edges.filter((e) => e.kind === "runs");
  const expected = ringsRunningFormat("fmt_aaaaaaaa", rings).filter((r) => r.id !== "cmp_d" && r.id !== "cmp_e");
  assert.deepEqual(
    runs.map((e) => e.from).sort(),
    expected.map((r) => `ring:${r.id}`).sort(),
  );
  assert.ok(runs.every((e) => e.to === "format:fmt_aaaaaaaa"));
});

test("shares-member dedupes per pair; shares-tag never doubles a pair", () => {
  const rs = [
    ring("cmp_a", ["@x", "@y"], ["t"]),
    ring("cmp_b", ["@X", "y"], ["t"]), // two handles match, tag matches too
    ring("cmp_c", ["@q", "@r"], ["t"]),
  ];
  const g = buildGraph({ rings: rs, formats: [] });
  const key = (e) => `${e.from}|${e.to}`;
  const member = g.edges.filter((e) => e.kind === "shares-member");
  assert.deepEqual(member.map(key), ["ring:cmp_a|ring:cmp_b"]);
  const tag = g.edges.filter((e) => e.kind === "shares-tag").map(key).sort();
  assert.deepEqual(tag, ["ring:cmp_a|ring:cmp_c", "ring:cmp_b|ring:cmp_c"]);
  const all = g.edges.map((e) => [e.from, e.to].sort().join("|"));
  assert.equal(new Set(all).size, all.length);
  assert.ok(g.edges.every((e) => e.from !== e.to));
});

test("no format-format edges; edges only reference real nodes", () => {
  const g = buildGraph({ rings, formats });
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  for (const e of g.edges) {
    assert.ok(byId.has(e.from) && byId.has(e.to));
    assert.ok(!(byId.get(e.from).kind === "format" && byId.get(e.to).kind === "format"));
  }
});

test("radiusForWeight monotonic, capped, positive", () => {
  for (const kind of ["ring", "format"]) {
    let prev = 0;
    for (let w = 1; w <= 5000; w = w < 50 ? w + 1 : w * 2) {
      const r = radiusForWeight(w, kind);
      assert.ok(r > 0 && r >= prev);
      prev = r;
    }
    assert.equal(radiusForWeight(1e9, kind), radiusForWeight(1e12, kind));
    assert.ok(radiusForWeight(1e9, kind) <= 44);
  }
  assert.ok(radiusForWeight(0, "ring") > 0);
  assert.ok(radiusForWeight(NaN, "format") > 0);
});

test("layout deterministic, in-bounds, no severe overlap", () => {
  const g = buildGraph({ rings, formats });
  const size = { width: 800, height: 600 };
  const a = layoutGraph(g, size);
  const b = layoutGraph(g, size);
  assert.deepEqual([...a], [...b]);
  assert.equal(a.size, g.nodes.length);
  const r = (n) => radiusForWeight(n.weight, n.kind);
  for (const n of g.nodes) {
    const p = a.get(n.id);
    assert.ok(p.x >= r(n) - 1e-6 && p.x <= 800 - r(n) + 1e-6);
    assert.ok(p.y >= r(n) - 1e-6 && p.y <= 600 - r(n) + 1e-6);
  }
  for (let i = 0; i < g.nodes.length; i++)
    for (let j = i + 1; j < g.nodes.length; j++) {
      const p = a.get(g.nodes[i].id), q = a.get(g.nodes[j].id);
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      assert.ok(d >= 0.8 * (r(g.nodes[i]) + r(g.nodes[j])));
    }
});

test("layout handles a larger graph deterministically and in-bounds", () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    ring(`cmp_${String(i).padStart(2, "0")}`, [`@a${i % 7}`, `@b${i}`], [`t${i % 4}`]));
  const g = buildGraph({ rings: many, formats: [] });
  const a = layoutGraph(g, { width: 1000, height: 700 });
  assert.deepEqual([...a], [...layoutGraph(g, { width: 1000, height: 700 })]);
  for (const p of a.values()) {
    assert.ok(p.x >= 0 && p.x <= 1000 && p.y >= 0 && p.y <= 700);
  }
});

test("empty graph -> empty positions", () => {
  assert.equal(layoutGraph({ nodes: [], edges: [] }, { width: 100, height: 100 }).size, 0);
  assert.equal(layoutGraph(buildGraph({}), { width: 100, height: 100 }).size, 0);
});

test("malformed inputs never throw", () => {
  const junk = [undefined, null, 5, "x", [], {}, { rings: 5, formats: "x", usage: 7 },
    { rings: [null, 1, "a", {}, { id: 3 }, { id: "r", members: null, game: null }], formats: [null, {}, { id: 4 }, { id: "f" }], usage: [["f", "bad"], null] },
    { rings: [ring("dup", ["@a", "@b"]), ring("dup", ["@c", "@d"])], formats: [fmt("fmt_aaaaaaaa"), fmt("FMT_AAAAAAAA")] }];
  for (const j of junk) {
    const g = buildGraph(j);
    assert.ok(Array.isArray(g.nodes) && Array.isArray(g.edges));
    layoutGraph(g, undefined);
    layoutGraph(g, { width: NaN, height: -1 });
  }
  layoutGraph(null);
  layoutGraph({ nodes: [null, { id: 1 }, { id: "a" }, { id: "a" }], edges: [null, { from: "a", to: "a" }, { from: "a", to: "zz" }] }, { width: 50, height: 50 });
  assert.equal(buildGraph(junk[8]).nodes.filter((n) => n.ref === "dup").length, 1);
});
