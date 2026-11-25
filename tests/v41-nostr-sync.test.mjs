import { test } from "node:test";
import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import * as S from "../src/nostr-schnorr.mjs";
import * as N from "../src/nostr.mjs";

const Z = "00".repeat(32);
const memStore = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _m: m,
  };
};

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

// ---- bech32 / naddr / shared campaign keypair ----------------------------
test("npub known vector round-trips; bad checksum rejected", () => {
  const npub = "npub1sg6plzptd64u62a878hep2kev88swjh3tw00gjsfl8f237lmu63q0uf63m";
  const hex = "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2";
  assert.equal(N.npubDecode(npub), hex);
  assert.equal(N.npubEncode(hex), npub);
  assert.equal(N.npubDecode(npub.slice(0, -1) + "q"), null);
});
test("naddr round-trip", () => {
  const pk = S.getPublicKey(S.generateSecretKey());
  const n = N.naddrEncode({ identifier: "cabal:cmp_abc12345", pubkey: pk, relays: ["wss://nos.lol"] });
  assert.deepEqual(N.naddrDecode(n), { identifier: "cabal:cmp_abc12345", pubkey: pk, kind: 30078, relays: ["wss://nos.lol"] });
});
test("per-user key vault, nsec, import, and onboarding copy are completely removed", () => {
  for (const removed of ["createKeyVault", "generateKeypair", "importKey", "nsecEncode", "nsecDecode"]) {
    assert.equal(N[removed], undefined, `${removed} must not be exported`);
  }
  assert.equal(N.STORAGE_KEYS.key, undefined);
  assert.equal("warn" in N.COPY, false);
  assert.equal("intro" in N.COPY, false);
  assert.equal(N.COPY.privacy, N.PRIVACY_LINE);
});
test("campaign keypair: generateCampaignKey and campaignKeypair derive or generate without mutating", () => {
  const kp = N.generateCampaignKey();
  assert.match(kp.key, /^[0-9a-f]{64}$/);
  assert.match(kp.pubkey, /^[0-9a-f]{64}$/);
  assert.equal(kp.pubkey, S.getPublicKey(kp.key));
  assert.equal(N.isValidCampaignKey(kp.key), true);
  assert.equal(N.isValidCampaignKey("00".repeat(32)), false);
  assert.equal(N.isValidCampaignKey("not-a-key"), false);

  const withKey = { id: "cmp_1", key: kp.key };
  assert.deepEqual(N.campaignKeypair(withKey), kp);
  assert.equal(N.hasCampaignKey(withKey), true);

  const withoutKey = { id: "cmp_2" };
  assert.equal(N.hasCampaignKey(withoutKey), false);
  const derived = N.campaignKeypair(withoutKey);
  assert.match(derived.key, /^[0-9a-f]{64}$/);
  assert.equal(derived.pubkey, S.getPublicKey(derived.key));
  assert.equal(withoutKey.key, undefined, "campaignKeypair must not mutate the campaign");
});
test("campaign key travels in URL fragment ONLY, never in a URL query string", () => {
  const { key, pubkey } = N.generateCampaignKey();
  const c = { id: "cmp_frag0001", key };
  const frag = N.campaignLinkFragment(c, ["wss://nos.lol"]);
  const fullUrl = new URL(`https://cabal.example/${frag}`);
  assert.equal(fullUrl.search, "", "query string must be empty");
  assert.equal(fullUrl.search.includes(key), false, "key must never appear in query");
  assert.equal(fullUrl.hash.includes(key), true, "key lives in URL fragment");

  const parsed = N.parseCampaignLinkFragment(fullUrl.href);
  assert.equal(parsed.campaignId, "cmp_frag0001");
  assert.equal(parsed.pubkey, pubkey);
  assert.equal(parsed.key, key);
  assert.deepEqual(parsed.relays, ["wss://nos.lol"]);

  // A key placed in a query string (?k=...) must be ignored by the fragment parser.
  const queryLeakUrl = `https://cabal.example/?k=${key}#c=${parsed.naddr}`;
  assert.equal(N.parseCampaignLinkFragment(queryLeakUrl).key, null);

  // Read-only campaign (no key) produces fragment without &k=
  const roFrag = N.campaignLinkFragment({ id: "cmp_frag0001", nostr: { pubkey } });
  assert.equal(roFrag.includes("&k="), false);
  assert.equal(N.parseCampaignLinkFragment(roFrag).key, null);
});

// ---- events + merge (shared campaign key) --------------------------------
const T = "2026-11-23T10:00:00.000Z";
const campKP = N.generateCampaignKey();
const rogueKP = N.generateCampaignKey();

const mkCampaign = (overrides = {}) => ({
  id: "cmp_ring00001",
  game: "ToonSouls",
  title: "Ring",
  createdBy: "@a",
  members: [{ name: "A", handle: "@a" }, { name: "B", handle: "@b" }],
  removedMembers: [],
  window: null,
  createdAt: T,
  key: campKP.key,
  posts: [{ id: "pst_aaaa0001", author: "@a", platform: "x", url: "https://x.com/a/status/1", text: "hi", createdAt: T, assists: [] }],
  anchorPost: { author: "@a", platform: "x", url: "https://x.com/a/status/1" },
  ...overrides,
});

test("event builders strip campaign key; signing with campaign key verifies", async () => {
  const c = mkCampaign();
  const ce = await N.signEvent(N.campaignEvent(c, { createdAt: 1000 }), c.key);
  assert.equal(ce.kind, 30078);
  assert.equal(ce.pubkey, campKP.pubkey);
  assert.deepEqual(ce.tags[0], ["d", "cabal:cmp_ring00001"]);
  assert.equal(JSON.stringify(ce).includes(c.key), false, "campaign key must never appear in campaign event");
  const dc = N.decodeEvent(ce);
  assert.equal(dc.type, "campaign");
  assert.equal(dc.data.key, undefined);
  assert.equal(dc.data.posts[0].id, "pst_aaaa0001");

  const pe = await N.signEvent(N.postEvent(c, { ...c.posts[0], key: c.key }, { createdAt: 1001 }), c.key);
  assert.equal(pe.pubkey, campKP.pubkey);
  assert.equal(pe.tags.find((t) => t[0] === "a")[1], `30078:${campKP.pubkey}:cabal:cmp_ring00001`);
  assert.equal(JSON.stringify(pe).includes(c.key), false, "campaign key must never appear in post event");
  assert.equal(N.decodeEvent(pe).type, "post");

  const a = { handle: "@b", status: "contributed", contributedAt: T, note: "Liked. Shared." };
  const ee = await N.signEvent(N.encryptionEvent(c, c.posts[0], a, { postEventId: pe.id, createdAt: 1002 }), c.key);
  assert.equal(ee.pubkey, campKP.pubkey);
  assert.deepEqual(ee.tags.find((t) => t[0] === "e"), ["e", pe.id]);
  assert.equal(JSON.stringify(ee).includes(c.key), false, "campaign key must never appear in enscryption event");
  const d = N.decodeEvent(ee);
  assert.equal(d.type, "assist");
  assert.equal(d.data.note, "Liked. Shared.");

  for (const e of [ce, pe, ee]) assert.equal(await N.verifyEvent(e), true);
  assert.equal(await N.verifyEvent({ ...ee, content: ee.content + " " }), false);
});

async function ringEvents() {
  const c = mkCampaign();
  const ce = await N.signEvent(N.campaignEvent(c, { createdAt: 1000 }), c.key);
  const p2 = { id: "pst_bbbb0002", author: "@b", platform: "reddit", url: "https://reddit.com/r/x/1", createdAt: "2026-11-24T10:00:00.000Z" };
  const pe = await N.signEvent(N.postEvent(c, p2, { createdAt: 1100 }), c.key);
  const ee = await N.signEvent(N.encryptionEvent(c, c.posts[0], { handle: "@b", contributedAt: T, note: "Commented." }, { createdAt: 1200 }), c.key);
  return { ce, pe, ee };
}

test("merge: adopts campaign, posts, assists; idempotent; dedupes by id; order-independent", async () => {
  const { ce, pe, ee } = await ringEvents();
  const r1 = N.applyRelayEvents([], [ee, pe, ce, ce, pe], { wantIds: ["cmp_ring00001"] });
  const c = r1.campaigns[0];
  assert.equal(c.posts.length, 2);
  assert.equal(c.posts[0].assists[0].note, "Commented.");
  assert.equal(c.nostr.pubkey, campKP.pubkey);
  const r2 = N.applyRelayEvents(r1.campaigns, [ce, pe, ee, ee]);
  assert.deepEqual(r2.campaigns, r1.campaigns);
  const r3 = N.applyRelayEvents([], [ce, pe, ee]);
  assert.deepEqual(r3.campaigns, r1.campaigns);
});

test("merge: never overwrites local campaign key and never adopts a key from relay content", async () => {
  const c = mkCampaign();
  const forgedContent = JSON.stringify({ ...JSON.parse(N.campaignEvent(c).content), title: "Updated", key: rogueKP.key });
  const evWithKey = await N.signEvent({
    kind: 30078,
    created_at: 2000,
    tags: [["d", `cabal:${c.id}`], ["t", "cabal"]],
    content: forgedContent,
  }, c.key);

  // Local campaign keeps its original key even when relay event tries to smuggle one
  const updated = N.applyRelayEvents([c], [evWithKey]).campaigns[0];
  assert.equal(updated.title, "Updated");
  assert.equal(updated.key, c.key);

  // Newly adopted campaign from relay never adopts a key from relay content
  const adopted = N.applyRelayEvents([], [evWithKey]).campaigns[0];
  assert.equal(adopted.key, undefined);
});

test("merge: stale campaign event never clobbers; newer replaces metadata but keeps local posts", async () => {
  const c = mkCampaign();
  const newer = await N.signEvent(N.campaignEvent({ ...c, title: "Newer" }, { createdAt: 2000 }), c.key);
  const older = await N.signEvent(N.campaignEvent({ ...c, title: "Older" }, { createdAt: 500 }), c.key);
  const s = N.applyRelayEvents([c], [newer]).campaigns;
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

test("merge: hostile input rejected (wrong campaign key, bad url, orphan)", async () => {
  const { ce, pe, ee } = await ringEvents();
  const base = N.applyRelayEvents([], [ce, pe, ee]).campaigns;
  const c = mkCampaign();
  const evilCampaign = await N.signEvent(N.campaignEvent({ ...c, title: "Hijack" }, { createdAt: 9999 }), rogueKP.key);
  assert.equal(N.applyRelayEvents(base, [evilCampaign]).rejected[0].reason, "wrong-author");

  const evilPost = await N.signEvent(N.postEvent(c, { id: "pst_evil0001", author: "@b", platform: "x", url: "https://x.com/b/status/9", createdAt: T }, { campaignPubkey: campKP.pubkey, createdAt: 1300 }), rogueKP.key);
  assert.equal(N.applyRelayEvents(base, [evilPost]).rejected[0].reason, "wrong-author");

  const bad = await N.signEvent(N.postEvent(c, { id: "pst_cccc0003", author: "@x", platform: "x", url: "javascript:alert(1)", createdAt: T }, { createdAt: 1300 }), c.key);
  assert.equal(N.applyRelayEvents(base, [bad]).rejected[0].reason, "bad-post");

  const orphan = await N.signEvent(N.postEvent({ id: "cmp_nope0000", key: c.key }, c.posts[0], { createdAt: 1300 }), c.key);
  assert.equal(N.applyRelayEvents(base, [orphan]).rejected[0].reason, "orphan");
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
  const merged = N.applyRelayEvents(list, [ce]).campaigns[0];
  assert.equal(merged.posts[0].id, "pst_aaaa0001");
  assert.equal(merged.key, snap.key);
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
  const got = await client.fetch(N.filtersForCampaign("cmp_ring00001", campKP.pubkey));
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

test("publishCampaign signs with campaign key, filters by handle when given, and never leaks key", async () => {
  const published = [];
  const client = { publish: async (e) => { published.push(e); return { "wss://a": { ok: true } }; } };
  const c = mkCampaign();
  c.posts[0].assists = [
    { handle: "@a", status: "contributed", contributedAt: T },
    { handle: "@b", status: "contributed", contributedAt: T },
  ];
  await N.publishCampaign(client, c, { handle: "@a" });
  assert.equal(published.filter((e) => e.kind === 30078).length, 1);
  assert.equal(published.filter((e) => e.kind === 78).length, 2); // @a's post + @a's assist (V79: kind 78, was kind 1)
  for (const e of published) {
    assert.equal(e.pubkey, campKP.pubkey);
    assert.equal(await N.verifyEvent(e), true);
  }
  assert.equal(JSON.stringify(published).includes(c.key), false, "campaign key must never leak in published events");

  // Read-only campaign (no key) cannot publish
  const { key: _ignored, ...readOnly } = c;
  await assert.rejects(() => N.publishCampaign(client, readOnly, { handle: "@a" }));
});

test("applyRelayEvents adopts a valid formatId and re-tags on republish; invalid formatId ignored", async () => {
  const c = mkCampaign({ formatId: "fmt_algoigno" });
  const ce = await N.signEvent(N.campaignEvent(c, { createdAt: 1000 }), c.key);
  assert.deepEqual(ce.tags.find((t) => t[0] === "t" && t[1].startsWith("cabal:format:")), ["t", "cabal:format:fmt_algoigno"]);
  const out = N.applyRelayEvents([], [ce]);
  assert.equal(out.applied, 1);
  assert.deepEqual(out.campaigns[0].formatIds, ["fmt_algoigno"]);
  assert.equal(out.campaigns[0].formatId, undefined);
  // Round-trip: republishing the synced ring keeps the format tag.
  const re = N.campaignEvent(out.campaigns[0], { createdAt: 2000 });
  assert.deepEqual(re.tags.find((t) => t[0] === "t" && t[1].startsWith("cabal:format:")), ["t", "cabal:format:fmt_algoigno"]);
  // Invalid formatId is ignored, not adopted.
  const bad = mkCampaign({ formatId: "bogus" });
  const badEv = await N.signEvent(N.campaignEvent(bad, { createdAt: 1000 }), bad.key);
  const out2 = N.applyRelayEvents([], [badEv]);
  assert.deepEqual(out2.campaigns[0].formatIds, []);
  assert.equal(out2.campaigns[0].formatId, undefined);
});
