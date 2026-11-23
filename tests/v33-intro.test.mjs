import test from "node:test";
import assert from "node:assert/strict";
import { INTRO_PAGES, getIntroPage, introPageIds, introPageIdForRoute } from "../src/intro.mjs";

const allText = () =>
  INTRO_PAGES.map((p) =>
    [p.title, p.lede, ...p.sections.flatMap((s) => [s.heading, ...s.paragraphs])].join("\n")
  ).join("\n");

test("lookup by id", () => {
  assert.deepEqual(introPageIds(), ["intro", "how", "theory"]);
  assert.equal(getIntroPage("how").title, "How a campaign works");
  assert.equal(getIntroPage("nope"), null);
});

test("every page has title and sections with paragraphs", () => {
  for (const p of INTRO_PAGES) {
    assert.ok(p.title && p.lede);
    assert.ok(p.sections.length >= 1);
    for (const s of p.sections) {
      assert.ok(s.heading);
      assert.ok(s.paragraphs.length >= 1 && s.paragraphs.every((t) => t.trim()));
    }
  }
});

test("no do-not-cite string, no SCT codes, no unsupported promises", () => {
  const t = allText();
  for (const bad of [
    /47-campaign/i, /27%/, /26%/, /5,190/, /65%/, /84.99%/, /10 cross-promo/i,
    /mech-shooter/i, /curator bans/i, /\bSCT[-\s]?\d/i, /phoenix/i, /grok/i,
    /best time to post/i, /short link/i, /live sync/i,
  ]) assert.ok(!bad.test(t), `forbidden: ${bad}`);
});

test("verified anchors are as stated", () => {
  const t = allText();
  assert.match(t, /32%/);
  assert.match(t, /17%/);
  assert.match(t, /\$53,088/);
});

test("routes exist and resolve to their page ids", () => {
  const routes = ["#/intro", "#/intro/how", "#/intro/theory"];
  for (const r of routes) assert.ok(introPageIdForRoute(r), r);
  assert.deepEqual(routes.map(introPageIdForRoute), ["intro", "how", "theory"]);
  assert.equal(introPageIdForRoute("#/x"), null);
});

test("routes tolerate a trailing slash (verifier fix)", () => {
  assert.equal(introPageIdForRoute("#/intro/"), "intro");
  assert.equal(introPageIdForRoute("#/intro/how/"), "how");
  assert.equal(introPageIdForRoute("#/intro/theory/"), "theory");
  assert.equal(introPageIdForRoute("#/x/"), null);
});

test("mount renders one page via textContent", () => {
  const made = [];
  const mk = (tag) => {
    const n = { tag, children: [], attrs: {}, className: "", textContent: "",
      appendChild(c) { this.children.push(c); }, setAttribute(k, v) { this.attrs[k] = v; } };
    made.push(n); return n;
  };
  const doc = { createElement: mk };
  const root = { ownerDocument: doc, children: [], appendChild(c) { this.children.push(c); }, textContent: "x" };
  return import("../src/intro.mjs").then(({ mount }) => {
    mount(root, "theory");
    assert.equal(root.children.length, 1);
    assert.match(root.children[0].className, /cabal-intro/);
    assert.equal(made.filter((n) => n.tag === "section").length, getIntroPage("theory").sections.length);
  });
});
