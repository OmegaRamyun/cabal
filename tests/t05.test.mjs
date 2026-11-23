import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchScore, rotationWarnings, windowOverlapDays } from "../src/match.mjs";

const schema = JSON.parse(readFileSync(new URL("../schemas/directory.schema.json", import.meta.url)));
const idx = JSON.parse(readFileSync(new URL("../directory/index.json", import.meta.url)));
const seeds = idx.profiles.map((f) => JSON.parse(readFileSync(new URL("../directory/" + f, import.meta.url))));

// Minimal hand-rolled validator covering the constructs this schema uses.
function validate(v, s, path = "$") {
  const errs = [];
  if (s.enum && !s.enum.includes(v)) errs.push(`${path}: not in enum`);
  if (s.type === "string") {
    if (typeof v !== "string") return [`${path}: not string`];
    if (s.minLength != null && v.length < s.minLength) errs.push(`${path}: too short`);
    if (s.maxLength != null && v.length > s.maxLength) errs.push(`${path}: too long`);
    if (s.pattern && !new RegExp(s.pattern).test(v)) errs.push(`${path}: pattern`);
    if (s.format === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) errs.push(`${path}: date`);
    if (s.format === "uri" && !/^https?:\/\//.test(v)) errs.push(`${path}: uri`);
  } else if (s.type === "array") {
    if (!Array.isArray(v)) return [`${path}: not array`];
    if (s.minItems != null && v.length < s.minItems) errs.push(`${path}: too few`);
    if (s.maxItems != null && v.length > s.maxItems) errs.push(`${path}: too many`);
    v.forEach((x, i) => errs.push(...validate(x, s.items, `${path}[${i}]`)));
  } else if (s.type === "object") {
    if (typeof v !== "object" || v === null) return [`${path}: not object`];
    for (const r of s.required || []) if (!(r in v)) errs.push(`${path}.${r}: missing`);
    for (const k of Object.keys(v)) {
      if (!s.properties[k]) { if (s.additionalProperties === false) errs.push(`${path}.${k}: extra`); }
      else errs.push(...validate(v[k], s.properties[k], `${path}.${k}`));
    }
  }
  return errs;
}

test("three seed profiles validate against the schema", () => {
  assert.equal(seeds.length, 3);
  for (const p of seeds) assert.deepEqual(validate(p, schema), [], p.id);
  assert.equal(new Set(seeds.map((p) => p.id)).size, 3);
  for (const p of seeds) assert.match(p.display_name, /^Example /);
});

test("validator rejects a bad profile (sanity)", () => {
  assert.ok(validate({ ...seeds[0], audience_scale: "5000" }, schema).length > 0);
  assert.ok(validate({ ...seeds[0], email: "a@b.c" }, schema).length > 0);
});

test("seed profiles carry no email-like or exact-count data", () => {
  for (const p of seeds) assert.ok(!/@/.test(JSON.stringify(p)), p.id);
});

const base = seeds[0];
const withP = (o) => ({ ...base, ...o });

test("identical profiles score 1.0 everywhere", () => {
  const p = withP({ launch_window: { type: "live", start: "2026-03-01", end: "2026-03-30" } }); // 30 days
  const s = matchScore(p, p);
  assert.deepEqual(s.components, { genre_tag: 1, audience: 1, window: 1 });
  assert.equal(s.total, 1);
  // spec: window = overlapping days / 30, so a 28-day window vs itself is 28/30
  assert.equal(matchScore(base, base).components.window, 0.933);
  assert.equal(s.multiplier, 1.0);
});

test("score is symmetric and deterministic", () => {
  assert.deepEqual(matchScore(seeds[0], seeds[1]), matchScore(seeds[1], seeds[0]));
  assert.deepEqual(matchScore(seeds[0], seeds[1]), matchScore(seeds[0], seeds[1]));
});

test("audience: adjacent 1.0, two apart 0.5, three apart 0.25", () => {
  assert.equal(matchScore(base, withP({ audience_scale: "1k-10k" })).components.audience, 1);
  assert.equal(matchScore(base, withP({ audience_scale: "10k+" })).components.audience, 0.5);
  assert.equal(matchScore(withP({ audience_scale: "<100" }), withP({ audience_scale: "10k+" })).components.audience, 0.25);
});

test("non-overlapping windows score 0; partial overlap is days/30", () => {
  const far = withP({ launch_window: { type: "live", start: "2027-01-01", end: "2027-01-10" } });
  assert.equal(matchScore(base, far).components.window, 0);
  assert.equal(windowOverlapDays({ start: "2026-03-01", end: "2026-03-10" }, { start: "2026-03-06", end: "2026-03-20" }), 5);
  const half = withP({ launch_window: { type: "live", start: "2026-03-14", end: "2026-04-30" } });
  assert.equal(matchScore(base, half).components.window, 0.5); // 15 days
});

test("genre/tag Jaccard: shared roguelike+roguelite of 8 distinct", () => {
  const s = matchScore(seeds[0], seeds[1]);
  assert.equal(s.components.genre_tag, 0.25); // 2 shared / 8 union
  assert.equal(matchScore(seeds[0], seeds[2]).components.genre_tag, 0);
});

test("breakdown explains every component", () => {
  const s = matchScore(seeds[0], seeds[1]);
  for (const k of ["genre_tag", "audience", "window", "multiplier", "total"]) assert.ok(s.explain[k]);
});

const ring = ["a", "b", "c", "d"];
const ev = (from, to, date, campaign = "c1") => ({ from, to, date, campaign });

test("rotation: no warnings for a sparse history", () => {
  assert.deepEqual(rotationWarnings(ring, [ev("a", "b", "2026-03-01"), ev("a", "b", "2026-04-01")]), []);
});

test("rotation: same partner twice within 14 days", () => {
  const w = rotationWarnings(ring, [ev("a", "b", "2026-03-01"), ev("a", "b", "2026-03-10", "c2")]);
  assert.deepEqual(w.map((x) => x.rule), ["pair-14d"]);
});

test("rotation: more than 2x per campaign", () => {
  const h = [ev("a", "b", "2026-03-01"), ev("a", "b", "2026-04-01"), ev("a", "b", "2026-05-01")];
  assert.deepEqual(rotationWarnings(ring, h).map((x) => x.rule), ["pair-campaign"]);
  assert.deepEqual(rotationWarnings(ring, h.slice(0, 2)), []);
});

test("rotation: >50% of ring features same member in one week", () => {
  const h = [ev("a", "d", "2026-03-01"), ev("b", "d", "2026-03-03"), ev("c", "d", "2026-03-05")];
  assert.deepEqual(rotationWarnings(ring, h).map((x) => x.rule), ["member-week"]);
  // exactly 50% (2 of 4) does not warn
  assert.deepEqual(rotationWarnings(ring, h.slice(0, 2)), []);
  // spread over more than a week does not warn
  assert.deepEqual(rotationWarnings(ring, [ev("a", "d", "2026-03-01"), ev("b", "d", "2026-03-09"), ev("c", "d", "2026-03-17")]), []);
});

test("rotationWarnings is advisory: returns data, does not throw or mutate", () => {
  const h = [ev("a", "b", "2026-03-01"), ev("a", "b", "2026-03-02")];
  const copy = JSON.stringify(h);
  rotationWarnings(ring, h);
  assert.equal(JSON.stringify(h), copy);
});
