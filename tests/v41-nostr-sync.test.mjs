import { test } from "node:test";
import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import * as S from "../src/nostr-schnorr.mjs";
import * as N from "../src/nostr.mjs";

const Z = "00".repeat(32);
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };

// ---- Schnorr -------------------------------------------------------------
test("BIP-340 vector 0 (sk=3, zero msg/aux) matches exactly", async () => {
  const sk = "00".repeat(31) + "03";
  assert.equal(S.getPublicKey(sk), "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9");
  const sig = await S.sign(Z, sk, Z);
  assert.equal(sig, "e907831f80848d1069a5371b402410364bdf1c5f8307b0084c55f1ce2dca821525f66a4a85ea8b71e482a74f382d2ce5ebeee8fdb2172f477df4900d310536c0");
  assert.equal(await S.verify(sig, Z, S.getPublicKey(sk)), true);
});
test("pubkey derivation cross-checked against node:crypto secp256k1", () => {
  for (let i = 0; i < 3; i++) {
    const sk = S.generateSecretKey();
    const ecdh = createECDH("secp256k1"); ecdh.setPrivateKey(Buffer.from(sk, "hex"));
    assert.equal(S.getPublicKey(sk), ecdh.getPublicKey("hex", "compressed").slice(2));
  }
});
test("sign/verify round-trip; tamper + wrong key + junk rejected", async () => {
  const sk = S.generateSecretKey(), pk = S.getPublicKey(sk);
  const msg = (await S.sha256("hello")).reduce((a, b) => a + b.toString(16).padStart(2, "0"), "");
  const sig = await S.sign(msg, sk);
  assert.equal(await S.verify(sig, msg, pk), true);
  assert.equal(await S.verify(sig, msg.replace(/^./, (c) => (c === "0" ? "1" : "0")), pk), false);
  assert.equal(await S.verify(sig, msg, S.getPublicKey(S.generateSecretKey())), false);
  assert.equal(await S.verify("zz", msg, pk), false);
  assert.equal(S.isValidSecretKey("00".repeat(32)), false);
});

// ---- bech32 / keys -------------------------------------------------------
test("npub known vector round-trips; bad checksum rejected", () => {
  const npub = "npub1sg6plzptd64u62a878hep2kev88swjh3tw00gjsfl8f237lmu63q0uf63m";
  const hex = "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2";
  assert.equal(N.npubDecode(npub), hex);
  assert.equal(N.npubEncode(hex), npub);
  assert.equal(N.npubDecode(npub.slice(0, -1) + "q"), null);
});
test("key generate / import / validate; bad nsec rejected", () => {
  const kp = N.generateKeypair();
  assert.match(kp.nsec, /^nsec1/); assert.match(kp.npub, /^npub1/);
  const back = N.importKey(kp.nsec);
  assert.equal(back.pk, kp.pk);
  assert.equal(N.importKey(kp.sk).pk, kp.pk); // hex also accepted
  for (const bad of ["", "nsec1abc", "hello", kp.npub, kp.nsec.slice(0, -2) + "qq", "00".repeat(32)]) assert.equal(N.importKey(bad), null, bad);
});
test("vault: unconfirmed key cannot sign; reveal is once; import ready; sk never in relays/urls", async () => {
  const st = memStore();
  const v = N.createKeyVault(st);
  assert.equal(v.status().state, "none");
  const { nsec } = v.generate();
  assert.equal(v.status().state, "pending");
  await assert.rejects(() => v.signEvent({ kind: 1, tags: [], content: "x" }));
  assert.equal(v.revealOnce(), nsec);
  v.confirmSaved();
  assert.equal(v.status().state, "ready");
  assert.equal(v.revealOnce(), null);
  assert.equal(JSON.stringify(v.status()).includes(N.importKey(nsec).sk), false);
  const ev = await v.signEvent({ kind: 1, tags: [], content: "x" });
  assert.equal(JSON.stringify(ev).includes(N.importKey(nsec).sk), false);
  assert.equal(await N.verifyEvent(ev), true);
  assert.equal((v.import("bogus")).ok, false);
  const other = N.generateKeypair();
  assert.equal(N.createKeyVault(memStore()).import(other.nsec).ok, true);
});
test("naddr round-trip", () => {
  const pk = S.getPublicKey(S.generateSecretKey());
  const n = N.naddrEncode({ identifier: "cabal:cmp_abc12345", pubkey: pk, relays: ["wss://nos.lol"] });
  assert.deepEqual(N.naddrDecode(n), { identifier: "cabal:cmp_abc12345", pubkey: pk, kind: 30078, relays: ["wss://nos.lol"] });
});

// ---- events + merge ------------------------------------------------------
const T = "2026-11-23T10:00:00.000Z";
const mkCampaign = () => ({
  id: "cmp_ring00001", game: "ToonSouls", title: "Ring", members: [{ name: "A", handle: "@a" }, { name: "B", handle: "@b" }],
  window: null, createdAt: T,
  posts: [{ id: "pst_aaaa0001", author: "@a", platform: "x", url: "https://x.com/a/status/1", text: "hi", createdAt: T, assists: [] }],
  anchorPost: { author: "@a", platform: "x", url: "https://x.com/a/status/1" },
});
const keyA = S.generateSecretKey(), keyB = S.generateSecretKey();
const pkA = S.getPublicKey(keyA), pkB = S.getPublicKey(keyB);

test("event encode/decode round-trip for campaign, post, enscryption", async () => {
  const c = mkCampaign();
  const ce = await N.signEvent(N.campaignEvent(c, { createdAt: 1000 }), keyA);
  assert.equal(ce.kind, 30078);
  assert.deepEqual(ce.tags[0], ["d", "cabal:cmp_ring00001"]);
  const dc = N.decodeEvent(ce);
  assert.equal(dc.type, "campaign"); assert.equal(dc.data.posts[0].id, "pst_aaaa0001");
  const pe = await N.signEvent(N.postEvent(c, c.posts[0], { campaignPubkey: pkA, createdAt: 1001 }), keyA);
  assert.equal(pe.tags.find((t) => t[0] === "a")[1], `30078:${pkA}:cabal:cmp_ring00001`);
  assert.equal(N.decodeEvent(pe).type, "post");
  const a = { handle: "@b", status: "contributed", contributedAt: T, note: "Liked. Shared." };
  const ee = await N.signEvent(N.encryptionEvent(c, c.posts[0], a, { campaignPubkey: pkA, postEventId: pe.id, createdAt: 1002 }), keyB);
  assert.deepEqual(ee.tags.find((t) => t[0] === "e"), ["e", pe.id]);
  const d = N.decodeEvent(ee);
  assert.equal(d.type, "assist"); assert.equal(d.data.note, "Liked. Shared.");
  for (const e of [ce, pe, ee]) assert.equal(await N.verifyEvent(e), true);
  assert.equal(await N.verifyEvent({ ...ee, content: ee.content + " " }), false);
});

async function ringEvents() {
  const c = mkCampaign();
  const ce = await N.signEvent(N.campaignEvent(c, { createdAt: 1000 }), keyA);
  const p2 = { id: "pst_bbbb0002", author: "@b", platform: "reddit", url: "https://reddit.com/r/x/1", createdAt: "2026-11-24T10:00:00.000Z" };
  const pe = await N.signEvent(N.postEvent(c, p2, { campaignPubkey: pkA, createdAt: 1100 }), keyB);
  const ee = await N.signEvent(N.encryptionEvent(c, c.posts[0], { handle: "@b", contributedAt: T, note: "Commented." }, { campaignPubkey: pkA, createdAt: 1200 }), keyB);
  return { ce, pe, ee };
}

test("merge: adopts campaign, posts, assists; idempotent; dedupes by id; order-independent", async () => {
  const { ce, pe, ee } = await ringEvents();
  const r1 = N.applyRelayEvents([], [ee, pe, ce, ce, pe], { wantIds: ["cmp_ring00001"] });
  const c = r1.campaigns[0];
  assert.equal(c.posts.length, 2);
  assert.equal(c.posts[0].assists[0].note, "Commented.");
  assert.equal(c.nostr.pubkey, pkA);
  const r2 = N.applyRelayEvents(r1.campaigns, [ce, pe, ee, ee]);
  assert.deepEqual(r2.campaigns, r1.campaigns);
  const r3 = N.applyRelayEvents([], [ce, pe, ee]);
  assert.deepEqual(r3.campaigns, r1.campaigns);
});
test("merge: stale campaign event never clobbers; newer replaces metadata but keeps local posts", async () => {
  const c = mkCampaign();
  const newer = await N.signEvent(N.campaignEvent({ ...c, title: "Newer" }, { createdAt: 2000 }), keyA);
  const older = await N.signEvent(N.campaignEvent({ ...c, title: "Older" }, { createdAt: 500 }), keyA);
  let s = N.applyRelayEvents([c], [newer]).campaigns;
  assert.equal(s[0].title, "Newer");
  const r = N.applyRelayEvents(s, [older]);
  assert.equal(r.campaigns[0].title, "Newer");
  assert.equal(r.rejected[0].reason, "stale");
  // local-only post survives a newer campaign event
  const local = N.applyRelayEvents([c], [older]).campaigns;
  local[0].posts.push({ id: "pst_local001", author: "@a", platform: "other", url: "https://e.com/1", createdAt: T, assists: [] });
  const merged = N.applyRelayEvents(local, [newer]).campaigns[0];
  assert.ok(merged.posts.some((p) => p.id === "pst_local001"));
});
test("merge: hostile input rejected (wrong author, bad url, orphan, handle squatting)", async () => {
  const { ce, pe, ee } = await ringEvents();
  const base = N.applyRelayEvents([], [ce, pe, ee]).campaigns;
  const c = mkCampaign();
  const evil = await N.signEvent(N.campaignEvent({ ...c, title: "Hijack" }, { createdAt: 9999 }), keyB);
  assert.equal(N.applyRelayEvents(base, [evil]).rejected[0].reason, "wrong-author");
  const bad = await N.signEvent(N.postEvent(c, { id: "pst_cccc0003", author: "@x", platform: "x", url: "javascript:alert(1)", createdAt: T }, { campaignPubkey: pkA }), keyB);
  assert.equal(N.applyRelayEvents(base, [bad]).rejected[0].reason, "bad-post");
  const orphan = await N.signEvent(N.postEvent({ id: "cmp_nope0000" }, c.posts[0], { campaignPubkey: pkA }), keyB);
  assert.equal(N.applyRelayEvents(base, [orphan]).rejected[0].reason, "orphan");
  const squat = await N.signEvent(N.encryptionEvent(c, c.posts[0], { handle: "@B", contributedAt: T, note: "fake" }, { campaignPubkey: pkA, createdAt: 5000 }), keyA);
  const r = N.applyRelayEvents(base, [squat]);
  assert.equal(r.rejected[0].reason, "handle-owned");
  assert.equal(r.campaigns[0].posts[0].assists[0].note, "Commented.");
});
test("offline fallback: link snapshot loads with no relay; relays merge on top later", async () => {
  const snap = mkCampaign();
  const list = N.loadSnapshot([], snap);
  assert.equal(list[0].id, snap.id);
  assert.equal(N.loadSnapshot(list, snap).length, 1);
  const client = N.createRelayClient({ relays: ["wss://down.example"], WebSocketImpl: FailingWS, timeoutMs: 50 });
  const r = await N.syncCampaign(client, list, snap.id);
  assert.deepEqual(r.campaigns, list);
  assert.equal(client.status()["wss://down.example"], "unreachable");
  const { ce } = await ringEvents();
  assert.equal(N.applyRelayEvents(list, [ce]).campaigns[0].posts[0].id, "pst_aaaa0001");
});

// ---- relay client with fake WebSocket ------------------------------------
class FailingWS { constructor() { setTimeout(() => this.onerror?.(), 0); } send() {} close() {} }
function fakeRelayClass(events, log) {
  return class FakeWS {
    constructor(url) { this.url = url; setTimeout(() => this.onopen?.(), 0); }
    send(raw) {
      const m = JSON.parse(raw); log.push([this.url, m[0]]);
      if (m[0] === "EVENT") setTimeout(() => this.onmessage?.({ data: JSON.stringify(["OK", m[1].id, true, ""]) }), 0);
      if (m[0] === "REQ") setTimeout(() => {
        for (const e of events) this.onmessage?.({ data: JSON.stringify(["EVENT", m[1], e]) });
        this.onmessage?.({ data: JSON.stringify(["EOSE", m[1]]) });
      }, 0);
    }
    close() {}
  };
}
test("relay client: publish to all, fetch dedupes across relays, drops forged events, one relay down is fine", async () => {
  const { ce, pe } = await ringEvents();
  const forged = { ...pe, content: JSON.stringify({ ...JSON.parse(pe.content), url: "https://evil.example" }) };
  const log = [];
  const WS = fakeRelayClass([ce, ce, pe, forged], log);
  const Mixed = class extends WS { constructor(u) { if (u.includes("down")) return new FailingWS(); super(u); } };
  const client = N.createRelayClient({ relays: ["wss://a.example", "wss://b.example", "wss://down.example"], WebSocketImpl: Mixed, timeoutMs: 200 });
  const res = await client.publish(ce);
  assert.equal(res["wss://a.example"].ok, true);
  assert.equal(res["wss://down.example"].ok, false);
  const got = await client.fetch(N.filtersForCampaign("cmp_ring00001", pkA));
  assert.deepEqual(got.map((e) => e.id).sort(), [ce.id, pe.id].sort());
  const st = client.status();
  assert.equal(st["wss://down.example"], "unreachable");
  assert.equal(N.relayStatus(true, Object.keys(st), st).kind, "ok");
  const synced = await N.syncCampaign(client, [], "cmp_ring00001");
  assert.equal(synced.campaigns[0].posts.length, 2);
});
test("relay list: never-configured is distinct; add/remove; rejects non-wss", () => {
  const st = memStore();
  assert.deepEqual(N.loadRelays(st), { configured: false, relays: [] });
  assert.equal(N.relayStatus(false, [], {}).label, "Never configured");
  assert.equal(N.addRelay("http://x.com", st).ok, false);
  assert.equal(N.addRelay("ws://evil.example", st).ok, false);
  assert.equal(N.addRelay("wss://nos.lol/", st).ok, true);
  assert.deepEqual(N.loadRelays(st).relays, ["wss://nos.lol"]);
  N.removeRelay("wss://nos.lol", st);
  assert.deepEqual(N.loadRelays(st), { configured: true, relays: [] });
  assert.equal(N.relayStatus(true, [], {}).kind, "none");
  assert.equal(N.relayStatus(true, ["wss://a"], { "wss://a": "unreachable" }).kind, "down");
});
test("publishCampaign signs only my own entries and never leaks the key", async () => {
  const st = memStore();
  const v = N.createKeyVault(st); v.generate(); v.confirmSaved();
  const sk = N.importKey(v.revealOnce() ?? JSON.parse(st.getItem(N.STORAGE_KEYS.key)).sk).sk;
  const published = [];
  const client = { publish: async (e) => { published.push(e); return { "wss://a": { ok: true } }; } };
  const c = mkCampaign(); c.posts[0].assists = [{ handle: "@a", status: "contributed", contributedAt: T }, { handle: "@b", status: "contributed", contributedAt: T }];
  await N.publishCampaign(client, v, c, { handle: "@a" });
  assert.equal(published.filter((e) => e.kind === 30078).length, 1);
  assert.equal(published.filter((e) => e.kind === 1).length, 2); // my post + my assist, not @b's
  assert.equal(JSON.stringify(published).includes(JSON.parse(st.getItem(N.STORAGE_KEYS.key)).sk), false);
  void sk;
});
