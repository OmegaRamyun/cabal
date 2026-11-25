// V76 — sync truth + relay health.
// 1. Publish stamps local nostr.createdAt (only on relay acceptance), which
//    is exactly what the membership line and the share-link upgrade read.
// 2. damus demoted from the defaults (live probe Nov 24: 4/4 unreachable
//    while nos.lol answered every time); a dead relay is not re-dialled
//    inside the cooldown, so one dead default costs one timeout, not one
//    per sync op.
// 3. Sync discoverability: syncNudgeFor (panel banner) + syncAttention
//    (Sync-tab badge signal for app.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as N from "../src/nostr.mjs";
import { mergeSyncedIntoStore, syncAttention } from "../src/sync-target.mjs";

const T = "2026-11-24T10:00:00.000Z";
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mkCampaign(over = {}) {
  const { key } = N.generateCampaignKey();
  return {
    id: "cmp_v76sync01", title: "V76 Ring", game: "Test Game", key,
    members: [{ handle: "@alice" }], posts: [{
      id: "pst_aaaa0001", author: "@alice", platform: "x",
      url: "https://x.com/alice/status/1", createdAt: T, assists: [],
    }],
    createdAt: T, ...over,
  };
}
const acceptClient = { publish: async () => ({ "wss://nos.lol": { ok: true, message: "" } }) };
const deadClient = { publish: async () => ({ "wss://nos.lol": { ok: false, message: "unreachable" } }) };

// ---- (1) createdAt stamping -------------------------------------------------
test("stampPublished sets nostr.{pubkey,eventId,createdAt}, preserves key, never mutates input", () => {
  const c = mkCampaign();
  const ev = { id: "a".repeat(64), pubkey: N.campaignPubkey(c), created_at: 1763971200 };
  const stamped = N.stampPublished(c, ev);
  assert.equal(stamped.nostr.createdAt, 1763971200);
  assert.equal(stamped.nostr.eventId, ev.id);
  assert.equal(stamped.nostr.pubkey, ev.pubkey);
  assert.equal(stamped.key, c.key, "key preserved — the stamp must never strip it");
  assert.equal(c.nostr, undefined, "input not mutated");
  assert.equal(stamped.id, c.id);
});

test("isPublished / shortLinkReady mirror the share-link upgrade condition", () => {
  const fresh = mkCampaign();
  assert.equal(N.isPublished(fresh), false);
  assert.equal(N.shortLinkReady(fresh), false);
  const stamped = N.stampPublished(fresh, { id: "b".repeat(64), pubkey: N.campaignPubkey(fresh), created_at: 1763971200 });
  assert.equal(N.isPublished(stamped), true);
  assert.equal(N.shortLinkReady(stamped), true, "published + key => naddr upgrade condition met");
  const { key: _k, ...readOnly } = stamped;
  assert.equal(N.isPublished(readOnly), true, "fetch can stamp a read-only ring");
  assert.equal(N.shortLinkReady(readOnly), false, "but no key => no short join link");
  assert.equal(N.isPublished({ nostr: { createdAt: 0 } }), false);
  assert.equal(N.isPublished({ nostr: { createdAt: "1763971200" } }), false);
});

test("publishCampaign stamps only when a relay accepts the campaign event", async () => {
  const c = mkCampaign();
  const res = await N.publishCampaign(acceptClient, c);
  assert.ok(res.campaign, "accepted publish stamps");
  assert.ok(Number.isInteger(res.campaign.nostr.createdAt) && res.campaign.nostr.createdAt > 0);
  assert.equal(res.campaign.nostr.eventId, res[0].id);
  assert.equal(res.campaign.key, c.key);
  assert.equal(c.nostr, undefined, "input campaign untouched — caller persists res.campaign");

  const c2 = mkCampaign();
  const res2 = await N.publishCampaign(deadClient, c2);
  assert.equal(res2.campaign, undefined, "all relays down => no stamp, no lying upgrade");

  // includeCampaignEvent:false publishes no campaign event => nothing to stamp.
  const res3 = await N.publishCampaign(acceptClient, mkCampaign(), { includeCampaignEvent: false });
  assert.equal(res3.campaign, undefined);
});

test("publishRemoval / publishAdoption return the stamped campaign on acceptance, null when down", async () => {
  const c = mkCampaign();
  const rem = await N.publishRemoval(acceptClient, c, { createdAt: 1763971300 });
  assert.equal(rem.campaign.nostr.createdAt, 1763971300);
  assert.equal(rem.campaign.nostr.eventId, rem.id);
  assert.equal(rem.campaign.key, c.key);
  const remDown = await N.publishRemoval(deadClient, c, { createdAt: 1763971300 });
  assert.equal(remDown.campaign, null);

  const ad = await N.publishAdoption(acceptClient, c, { createdAt: 1763971400 });
  assert.equal(ad.campaign.nostr.createdAt, 1763971400);
  const adDown = await N.publishAdoption(deadClient, c, { createdAt: 1763971400 });
  assert.equal(adDown.campaign, null);
});

test("stamped campaign merges into the store by id without touching other rings", () => {
  const c = mkCampaign();
  const stamped = N.stampPublished(c, { id: "c".repeat(64), pubkey: N.campaignPubkey(c), created_at: 1763971200 });
  const other = mkCampaign({ id: "cmp_other0001", title: "Other" });
  const merged = mergeSyncedIntoStore([c, other], [stamped], c);
  assert.equal(merged.find((x) => x.id === c.id).nostr.createdAt, 1763971200);
  assert.equal(merged.find((x) => x.id === "cmp_other0001").nostr, undefined);
});

// ---- (2) relay defaults + dead-relay cooldown -------------------------------
test("damus is demoted from the defaults; nos.lol is the verified default", () => {
  assert.deepEqual([...N.DEFAULT_RELAYS], ["wss://nos.lol"]);
  assert.ok(N.DEMOTED_RELAYS.includes("wss://relay.damus.io"));
  assert.ok(!N.DEFAULT_RELAYS.some((r) => N.KNOWN_DEAD_RELAYS.includes(r)));
  const st = mem();
  N.useDefaultRelays(st);
  assert.deepEqual(N.loadRelays(st).relays, ["wss://nos.lol"]);
});

class CountingFailingWS {
  static count = 0;
  constructor() { CountingFailingWS.count++; setTimeout(() => this.onerror?.(), 0); }
  send() {} close() {}
}

test("relay client does not re-dial a dead relay inside the cooldown, retries after it", async () => {
  CountingFailingWS.count = 0;
  const client = N.createRelayClient({
    relays: ["wss://down.example"], WebSocketImpl: CountingFailingWS,
    timeoutMs: 200, deadCooldownMs: 60,
  });
  const ev = { id: "d".repeat(64), kind: 1, pubkey: "e".repeat(64), created_at: 1, tags: [], content: "{}" };
  const r1 = await client.publish(ev);
  assert.equal(r1["wss://down.example"].ok, false);
  assert.equal(CountingFailingWS.count, 1, "first op dials once");
  const r2 = await client.publish(ev);
  assert.equal(r2["wss://down.example"].ok, false);
  assert.equal(CountingFailingWS.count, 1, "second op inside cooldown does not re-dial");
  assert.equal(client.status()["wss://down.example"], "unreachable");
  await sleep(80);
  await client.publish(ev);
  assert.equal(CountingFailingWS.count, 2, "after the cooldown the relay is retried");
});

// ---- (3) discoverability ----------------------------------------------------
test("syncNudgeFor: setup nudge when relays unconfigured, publish nudge when configured, none when published or read-only", () => {
  const fresh = mkCampaign();
  assert.deepEqual(syncNudgeForKind(fresh, { configured: false, relays: [] }), "setup");
  assert.deepEqual(syncNudgeForKind(fresh, { configured: true, relays: ["wss://nos.lol"] }), "publish");
  const stamped = N.stampPublished(fresh, { id: "f".repeat(64), pubkey: N.campaignPubkey(fresh), created_at: 1763971200 });
  assert.equal(N.syncNudgeFor(stamped, { configured: true, relays: ["wss://nos.lol"] }), null);
  const { key: _k, ...readOnly } = fresh;
  assert.equal(N.syncNudgeFor(readOnly, { configured: false, relays: [] }), null);
  assert.equal(N.syncNudgeFor(null, {}), null);
});
function syncNudgeForKind(c, info) { return N.syncNudgeFor(c, info)?.kind; }

test("syncAttention: flags unpublished writable rings, never read-only or published rings", () => {
  const fresh = mkCampaign();
  const { key: _k, ...readOnly } = mkCampaign({ id: "cmp_readonly1" });
  const published = N.stampPublished(mkCampaign({ id: "cmp_pub00001" }), { id: "0".repeat(64), pubkey: "0".repeat(64), created_at: 1763971200 });
  assert.deepEqual(syncAttention([], {}), { needsAttention: false, reason: null });
  assert.deepEqual(syncAttention([readOnly], { configured: false, relays: [] }), { needsAttention: false, reason: null });
  assert.deepEqual(syncAttention([fresh], { configured: false, relays: [] }), { needsAttention: true, reason: "relays-unconfigured" });
  assert.deepEqual(syncAttention([fresh], { configured: true, relays: ["wss://nos.lol"] }), { needsAttention: true, reason: "unpublished" });
  assert.deepEqual(syncAttention([published], { configured: true, relays: ["wss://nos.lol"] }), { needsAttention: false, reason: null });
  assert.deepEqual(syncAttention([published, fresh], { configured: true, relays: ["wss://nos.lol"] }), { needsAttention: true, reason: "unpublished" });
});
