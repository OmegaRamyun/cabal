import test from "node:test";
import assert from "node:assert/strict";
import {
  FIRST_RUN_COPY,
  shouldShowFirstRun,
  shouldShowRinglessCta,
  extractInviteHash,
} from "../src/first-run.mjs";
import { optInDemo, demoCampaigns } from "../src/demo.mjs";

function memoryStore(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data,
  };
}
const NOW = new Date("2026-11-24T12:00:00.000Z");

test("cold user (no rings, no demo flag) sees first-run", () => {
  assert.equal(shouldShowFirstRun({ campaigns: [], demoFlag: null }), true);
  assert.equal(shouldShowFirstRun({}), true);
});
test("returning user with rings skips first-run", () => {
  assert.equal(shouldShowFirstRun({ campaigns: [{ id: "a" }], demoFlag: null }), false);
});
test("demo opt-in skips first-run; cleared demo ('off') shows it again", () => {
  assert.equal(shouldShowFirstRun({ campaigns: demoCampaigns(NOW), demoFlag: "on" }), false);
  assert.equal(shouldShowFirstRun({ campaigns: [], demoFlag: "off" }), true);
});
test("sticky CTA: shown while ringless (incl. demo), hidden with a real ring", () => {
  assert.equal(shouldShowRinglessCta({ campaigns: [] }), true);
  assert.equal(shouldShowRinglessCta({ campaigns: demoCampaigns(NOW) }), true);
  assert.equal(shouldShowRinglessCta({ campaigns: [{ id: "r1" }] }), false);
});
test("copy is verbatim", () => {
  assert.equal(
    FIRST_RUN_COPY.sentence,
    "Cabal — small rings of indie devs boost each other’s posts, in their own words. No accounts.",
  );
  assert.equal(FIRST_RUN_COPY.startRing, "Start a ring");
  assert.equal(FIRST_RUN_COPY.haveInvite, "I have an invite link");
  assert.equal(FIRST_RUN_COPY.seeDemo, "See a demo ring");
});
test("extractInviteHash accepts URL, fragment, bare c=; rejects junk", () => {
  assert.equal(extractInviteHash("https://x.example/cabal/#c=abc123"), "#c=abc123");
  assert.equal(extractInviteHash("  #c=naddr1xyz&k=key "), "#c=naddr1xyz&k=key");
  assert.equal(extractInviteHash("c=abc"), "#c=abc");
  assert.equal(extractInviteHash("hello"), null);
  assert.equal(extractInviteHash("#c="), null);
  assert.equal(extractInviteHash(""), null);
  assert.equal(extractInviteHash(null), null);
});
test("optInDemo seeds only on explicit call and sets flag on", () => {
  const store = memoryStore();
  assert.equal(store._data["cabal.v2.demo"], undefined);
  assert.equal(optInDemo(store, NOW), true);
  assert.equal(store._data["cabal.v2.demo"], "on");
  assert.equal(JSON.parse(store._data["cabal.v2.campaigns"]).length, 3);
  assert.equal(optInDemo(store, NOW), false);
});
test("optInDemo works after clear (flag off) but never overwrites real rings", () => {
  const off = memoryStore({ "cabal.v2.demo": "off", "cabal.v2.campaigns": "[]" });
  assert.equal(optInDemo(off, NOW), true);
  const real = memoryStore({ "cabal.v2.campaigns": JSON.stringify([{ id: "mine" }]) });
  assert.equal(optInDemo(real, NOW), false);
  assert.equal(real._data["cabal.v2.demo"], undefined);
  const corrupt = memoryStore({ "cabal.v2.campaigns": "{nope" });
  assert.equal(optInDemo(corrupt, NOW), false);
});
