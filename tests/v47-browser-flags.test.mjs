import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as N from "../src/nostr.mjs";
import { mergeSyncedIntoStore } from "../src/sync-target.mjs";

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

// ---- (b) relay defaults ----------------------------------------------------
// Live check, Nov 23 2026: the browser saw damus + nos.lol answer and
// relay.nostr.band time out twice. (The build sandbox cannot open outbound
// websockets, so its own probe timed out on all three and proves nothing.)
// V76: damus DEMOTED Nov 24 2026 — live browser probe, unreachable in 4/4
// relay ops while nos.lol answered every time. A Nov 24 sandbox probe failed
// every endpoint including known-good nos.lol, so no replacement relay is
// verified yet; the single verified default stands until one is checked live.
test("defaults are unique wss:// relays and exclude every known-dead relay", () => {
  assert.ok(N.DEFAULT_RELAYS.length >= 1);
  assert.equal(new Set(N.DEFAULT_RELAYS).size, N.DEFAULT_RELAYS.length);
  for (const r of N.DEFAULT_RELAYS) { assert.match(r, /^wss:\/\//); assert.ok(!N.KNOWN_DEAD_RELAYS.includes(r), r); }
  assert.deepEqual([...N.DEFAULT_RELAYS], ["wss://nos.lol"]);
  assert.ok(!N.DEFAULT_RELAYS.includes("wss://relay.damus.io"), "damus demoted V76");
  assert.deepEqual([...N.DEMOTED_RELAYS], ["wss://relay.damus.io"]);
});
test("useDefaultRelays never configures a known-dead relay", () => {
  const st = mem();
  N.useDefaultRelays(st);
  const { relays } = N.loadRelays(st);
  for (const d of N.KNOWN_DEAD_RELAYS) assert.ok(!relays.includes(d));
  assert.deepEqual(relays, [...N.DEFAULT_RELAYS]);
});
test("no shipped source or UI copy names the dead relay as a default", () => {
  for (const f of ["src/nostr.mjs", "src/intro.mjs", "app.js", "index.html"]) {
    const txt = readFileSync(new URL("../" + f, import.meta.url), "utf8");
    const hits = txt.split("\n").filter((l) => l.includes("relay.nostr.band") && !/KNOWN_DEAD|dropped|Add it back/.test(l));
    assert.deepEqual(hits, [], f);
  }
});

// ---- (a) sync panel target -------------------------------------------------
const local = [{ id: "cmp_a", title: "A" }, { id: "cmp_b", title: "B" }];
const staticToon = { id: "cmp_toon001", title: "ToonSouls", demo: true };

test("mechanism: the old lookup is local-only, so a static campaign yields no panel", () => {
  // renderSyncPanel's current line: store.campaigns.find((c) => c.id === campaignId)
  assert.equal(local.find((c) => c.id === staticToon.id), undefined);
});
test("sync of one campaign never wipes the other stored campaigns", () => {
  const a2 = { ...local[0], title: "A2" };
  const out = mergeSyncedIntoStore(local, [a2], local[0]);
  assert.deepEqual(out.map((c) => c.id), ["cmp_a", "cmp_b"]);
  assert.equal(out[0].title, "A2");
});
test("unchanged static campaign is not promoted into storage; a changed one is", () => {
  assert.deepEqual(mergeSyncedIntoStore(local, [{ ...staticToon }], staticToon), local);
  const changed = { ...staticToon, posts: [1] };
  assert.deepEqual(mergeSyncedIntoStore(local, [changed], staticToon).map((c) => c.id), ["cmp_a", "cmp_b", "cmp_toon001"]);
});
