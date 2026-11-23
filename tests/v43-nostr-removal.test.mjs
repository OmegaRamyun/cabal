import { test } from "node:test";
import assert from "node:assert/strict";
import * as N from "../src/nostr.mjs";

const kp = N.generateCampaignKey();
const T0 = "2026-11-23T10:00:00.000Z"; // 1795428000
const T0_SEC = Math.floor(Date.parse(T0) / 1000);
const T_REMOVE = "2026-11-23T12:00:00.000Z";
const T_REMOVE_SEC = Math.floor(Date.parse(T_REMOVE) / 1000);
const T_AFTER = "2026-11-23T12:05:00.000Z";
const T_AFTER_SEC = Math.floor(Date.parse(T_AFTER) / 1000);
const T_BEFORE = "2026-11-23T11:00:00.000Z";
const T_BEFORE_SEC = Math.floor(Date.parse(T_BEFORE) / 1000);

function baseCampaign() {
  return {
    id: "cmp_rem00001",
    game: "ToonSouls",
    title: "Sustained Ring",
    createdBy: "@alice",
    members: [
      { name: "Alice", handle: "@alice" },
      { name: "Bob", handle: "@bob" },
      { name: "Cara", handle: "@cara" },
    ],
    removedMembers: [],
    window: null,
    createdAt: T0,
    key: kp.key,
    posts: [
      {
        id: "pst_aaaa0001",
        author: "@alice",
        platform: "x",
        url: "https://x.com/alice/status/1",
        text: "Launch post",
        createdAt: T0,
        assists: [],
      },
    ],
    anchorPost: { author: "@alice", platform: "x", url: "https://x.com/alice/status/1" },
  };
}

function removedCampaign(c) {
  return {
    ...c,
    members: c.members.filter((m) => m.handle.toLowerCase() !== "@bob"),
    removedMembers: [{ handle: "@bob", removedAt: T_REMOVE, removedBy: "@alice" }],
  };
}

function fakeRelayClass(store) {
  return class FakeWS {
    constructor(url) { this.url = url; setTimeout(() => this.onopen?.(), 0); }
    send(raw) {
      const m = JSON.parse(raw);
      if (m[0] === "EVENT") {
        store.push(m[1]);
        setTimeout(() => this.onmessage?.({ data: JSON.stringify(["OK", m[1].id, true, ""]) }), 0);
      }
      if (m[0] === "REQ") {
        setTimeout(() => {
          for (const e of store) this.onmessage?.({ data: JSON.stringify(["EVENT", m[1], e]) });
          this.onmessage?.({ data: JSON.stringify(["EOSE", m[1]]) });
        }, 0);
      }
    }
    close() {}
  };
}

test("removal event round-trip via relay client: kind 30078, newer created_at, no key leaked", async () => {
  const store = [];
  const client = N.createRelayClient({ relays: ["wss://relay.example"], WebSocketImpl: fakeRelayClass(store), timeoutMs: 200 });

  const initial = baseCampaign();
  const initialEv = await N.signEvent(N.campaignEvent(initial, { createdAt: T0_SEC }), initial.key);
  await client.publish(initialEv);

  // Simulate local state after initial sync + creator removing @bob
  const syncedBefore = N.applyRelayEvents([initial], [initialEv]).campaigns[0];
  assert.equal(syncedBefore.nostr.createdAt, T0_SEC);

  const afterRemove = removedCampaign(syncedBefore);
  const res = await N.publishRemoval(client, afterRemove, { by: "@alice", createdAt: T_REMOVE_SEC });
  assert.equal(res.kind, 30078);
  assert.equal(res.relays["wss://relay.example"].ok, true);
  assert.equal(await N.verifyEvent(res.event), true);
  assert.ok(res.event.created_at > syncedBefore.nostr.createdAt);
  assert.equal(JSON.stringify(res.event).includes(initial.key), false, "campaign key must never appear in removal event");

  // Another ring member syncs from the relay and receives the updated membership
  const peerSynced = await N.syncCampaign(client, [syncedBefore], initial.id);
  const updated = peerSynced.campaigns[0];
  assert.deepEqual(updated.members.map((m) => m.handle), ["@alice", "@cara"]);
  assert.equal(updated.removedMembers.length, 1);
  assert.equal(updated.removedMembers[0].handle, "@bob");
  assert.equal(updated.removedMembers[0].removedAt, T_REMOVE);
  assert.equal(updated.key, initial.key, "local campaign key preserved across removal sync");
});

test("removalEvent defaults to strictly newer created_at than previous campaign event", () => {
  const c = removedCampaign({ ...baseCampaign(), nostr: { pubkey: kp.pubkey, eventId: "a".repeat(64), createdAt: 9999999999 } });
  const ev = N.removalEvent(c);
  assert.equal(ev.created_at, 10000000000);
});

test("future writes from removed handle are dropped; past writes stay", async () => {
  const c0 = baseCampaign();
  const cRemoved = removedCampaign(c0);

  const remEv = await N.signEvent(N.campaignEvent(cRemoved, { createdAt: T_REMOVE_SEC }), c0.key);

  // Past post and past assist from @bob (created BEFORE removedAt) -> MUST STAY
  const pastPost = {
    id: "pst_bobpast1", author: "@bob", platform: "reddit",
    url: "https://reddit.com/r/indiedev/comments/1/past/", createdAt: T_BEFORE,
  };
  const pastPostEv = await N.signEvent(N.postEvent(c0, pastPost, { createdAt: T_BEFORE_SEC }), c0.key);
  const pastAssistEv = await N.signEvent(
    N.encryptionEvent(c0, c0.posts[0], { handle: "@bob", status: "contributed", contributedAt: T_BEFORE, note: "Shared earlier." }, { createdAt: T_BEFORE_SEC }),
    c0.key,
  );

  // Future post and future assist from @Bob (case-insensitive, created AFTER removedAt) -> MUST BE DROPPED
  const futurePost = {
    id: "pst_bobfut01", author: "@Bob", platform: "reddit",
    url: "https://reddit.com/r/indiedev/comments/2/future/", createdAt: T_AFTER,
  };
  const futurePostEv = await N.signEvent(N.postEvent(c0, futurePost, { createdAt: T_AFTER_SEC }), c0.key);
  const futureAssistEv = await N.signEvent(
    N.encryptionEvent(c0, c0.posts[0], { handle: "@BOB", status: "contributed", contributedAt: T_AFTER, note: "Trying after removal." }, { createdAt: T_AFTER_SEC }),
    c0.key,
  );

  // Non-removed member @cara can still post and assist after removedAt
  const caraPost = {
    id: "pst_cara0001", author: "@cara", platform: "instagram",
    url: "https://instagram.com/p/CARA1/", createdAt: T_AFTER,
  };
  const caraPostEv = await N.signEvent(N.postEvent(c0, caraPost, { createdAt: T_AFTER_SEC }), c0.key);

  const merged = N.applyRelayEvents([c0], [remEv, pastPostEv, pastAssistEv, futurePostEv, futureAssistEv, caraPostEv]);
  const out = merged.campaigns[0];

  // Past content from @bob stays
  assert.ok(out.posts.some((p) => p.id === "pst_bobpast1"), "past post from removed member stays");
  assert.ok(out.posts[0].assists.some((a) => a.handle === "@bob" && a.note === "Shared earlier."), "past assist from removed member stays");

  // Future content from @bob is dropped
  assert.equal(out.posts.some((p) => p.id === "pst_bobfut01"), false, "future post from removed member dropped");
  assert.equal(out.posts[0].assists.some((a) => a.note === "Trying after removal."), false, "future assist from removed member dropped");
  const removedRejections = merged.rejected.filter((r) => r.reason === "removed-member");
  assert.equal(removedRejections.length, 2);

  // Non-removed member @cara's future post stays
  assert.ok(out.posts.some((p) => p.id === "pst_cara0001"));
});

test("order independence: future post arriving before removal event is pruned when removal arrives", async () => {
  const c0 = baseCampaign();
  const initEv = await N.signEvent(N.campaignEvent(c0, { createdAt: T0_SEC }), c0.key);
  const pastPost = { id: "pst_bobpast2", author: "@bob", platform: "x", url: "https://x.com/bob/status/1", createdAt: T_BEFORE };
  const futurePost = { id: "pst_bobfut02", author: "@bob", platform: "x", url: "https://x.com/bob/status/2", createdAt: T_AFTER };
  const pastEv = await N.signEvent(N.postEvent(c0, pastPost, { createdAt: T_BEFORE_SEC }), c0.key);
  const futureEv = await N.signEvent(N.postEvent(c0, futurePost, { createdAt: T_AFTER_SEC }), c0.key);
  const remEv = await N.signEvent(N.campaignEvent(removedCampaign(c0), { createdAt: T_REMOVE_SEC }), c0.key);

  // First sync sees the posts before the removal event
  const step1 = N.applyRelayEvents([c0], [initEv, pastEv, futureEv]).campaigns;
  assert.equal(step1[0].posts.some((p) => p.id === "pst_bobfut02"), true);

  // Second sync receives the removal event
  const step2 = N.applyRelayEvents(step1, [remEv]).campaigns;
  assert.equal(step2[0].posts.some((p) => p.id === "pst_bobpast2"), true, "past post stays");
  assert.equal(step2[0].posts.some((p) => p.id === "pst_bobfut02"), false, "future post pruned once removal arrives");
});

test("stale membership update is ignored and cannot undo a removal", async () => {
  const c0 = baseCampaign();
  const staleEv = await N.signEvent(N.campaignEvent(c0, { createdAt: T0_SEC }), c0.key);
  const remEv = await N.signEvent(N.campaignEvent(removedCampaign(c0), { createdAt: T_REMOVE_SEC }), c0.key);

  const afterRemoval = N.applyRelayEvents([c0], [remEv]).campaigns;
  assert.equal(afterRemoval[0].removedMembers.length, 1);

  // Now a stale campaign event from before the removal arrives
  const res = N.applyRelayEvents(afterRemoval, [staleEv]);
  assert.equal(res.rejected[0].reason, "stale");
  assert.deepEqual(res.campaigns[0].members.map((m) => m.handle), ["@alice", "@cara"]);
  assert.equal(res.campaigns[0].removedMembers.length, 1);
  assert.equal(res.campaigns[0].removedMembers[0].handle, "@bob");
});

test("publishRemoval enforces campaign key presence and creator check when `by` is provided", async () => {
  const client = { publish: async () => ({ "wss://a": { ok: true } }) };
  const c = removedCampaign(baseCampaign());

  // Non-creator rejected when `by` is passed
  await assert.rejects(() => N.publishRemoval(client, c, { by: "@bob" }));

  // Read-only campaign (no key) rejected
  const { key: _ignored, ...readOnly } = c;
  await assert.rejects(() => N.publishRemoval(client, readOnly, { by: "@alice" }));
});
