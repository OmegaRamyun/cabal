// V79 acceptance: Nostr protocol correctness — kind 78 (NIP-78 app record)
// replaces kind 1 for posts/assists, and NIP-42 AUTH in the relay client.
// (Brief: cabal-bench/nostr-auth-kind-migration-brief-2026-11-25.md.)
// Legacy kind 1 events are constructed ONLY as back-compat decode fixtures
// below — src/nostr.mjs never constructs one (grep-proof in tasks/V79...md).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as N from "../src/nostr.mjs";

const T = "2026-11-23T10:00:00.000Z";
const kp = N.generateCampaignKey();
const rogue = N.generateCampaignKey();

const mkCampaign = (overrides = {}) => ({
  id: "cmp_v79test01",
  game: "Test Game",
  title: "V79 Ring",
  createdBy: "@a",
  members: [{ name: "A", handle: "@a" }, { name: "B", handle: "@b" }],
  removedMembers: [],
  window: null,
  createdAt: T,
  key: kp.key,
  posts: [{
    id: "pst_v79test01", author: "@a", platform: "x",
    url: "https://x.com/a/status/1", text: "hello", createdAt: T, assists: [],
  }],
  anchorPost: { author: "@a", platform: "x", url: "https://x.com/a/status/1" },
  ...overrides,
});
const mkPost = (overrides = {}) => ({
  id: "pst_v79test01", author: "@a", platform: "x",
  url: "https://x.com/a/status/1", text: "hello", createdAt: T, ...overrides,
});
const mkAssist = (overrides = {}) => ({
  handle: "@b", status: "contributed", contributedAt: T, note: "Shared it.", ...overrides,
});

test("kinds: KIND_APP_RECORD is 78, KIND_AUTH is 22242, legacy kind 1 is decode-only, KIND_NOTE is gone", () => {
  assert.equal(N.KIND_APP_RECORD, 78);
  assert.equal(N.KIND_AUTH, 22242);
  assert.equal(N.KIND_LEGACY_NOTE, 1);
  assert.equal(N.KIND_CAMPAIGN, 30078);
  assert.equal(N.KIND_NOTE, undefined, "KIND_NOTE must not survive the migration — nothing may alias kind 1 for construction");
});

test("postEvent produces kind 78 with the same tags/content as before", async () => {
  const c = mkCampaign({ formatId: "fmt_v79test1" });
  const ev = N.postEvent(c, mkPost(), { createdAt: 1001 });
  assert.equal(ev.kind, 78);
  assert.equal(ev.created_at, 1001);
  assert.deepEqual(ev.tags.find((t) => t[0] === "a"), ["a", `30078:${kp.pubkey}:cabal:cmp_v79test01`]);
  assert.deepEqual(ev.tags.find((t) => t[0] === "cabal-post"), ["cabal-post", "pst_v79test01"]);
  assert.ok(ev.tags.some((t) => t[0] === "t" && t[1] === "cabal"));
  assert.deepEqual(ev.tags.find((t) => t[0] === "t" && t[1].startsWith("cabal:format:")), ["t", "cabal:format:fmt_v79test1"]);
  const body = JSON.parse(ev.content);
  assert.equal(body.id, "pst_v79test01");
  assert.equal(body.author, "@a");
  assert.equal(body.assists, undefined, "post content carries no assists");
  assert.equal(JSON.stringify(ev).includes(c.key), false, "campaign key must never appear in a post event");

  const signed = await N.signEvent(ev, c.key);
  assert.equal(await N.verifyEvent(signed), true);
  assert.equal(N.decodeEvent(signed).type, "post");
  assert.equal(N.decodeEvent(signed).postId, "pst_v79test01");
});

test("encryptionEvent produces kind 78 with the same tags/content as before", async () => {
  const c = mkCampaign();
  const pe = await N.signEvent(N.postEvent(c, mkPost(), { createdAt: 1001 }), c.key);
  const ev = N.encryptionEvent(c, mkPost(), mkAssist(), { postEventId: pe.id, createdAt: 1002 });
  assert.equal(ev.kind, 78);
  assert.deepEqual(ev.tags.find((t) => t[0] === "e"), ["e", pe.id]);
  assert.deepEqual(ev.tags.find((t) => t[0] === "a"), ["a", `30078:${kp.pubkey}:cabal:cmp_v79test01`]);
  assert.deepEqual(ev.tags.find((t) => t[0] === "cabal-post"), ["cabal-post", "pst_v79test01"]);
  const body = JSON.parse(ev.content);
  assert.equal(body.handle, "@b");
  assert.equal(body.note, "Shared it.");
  assert.equal(JSON.stringify(ev).includes(c.key), false, "campaign key must never appear in an assist event");

  const signed = await N.signEvent(ev, c.key);
  assert.equal(await N.verifyEvent(signed), true);
  const d = N.decodeEvent(signed);
  assert.equal(d.type, "assist");
  assert.equal(d.postEventId, pe.id);
});

test("filtersForCampaign queries kinds [30078, 78], not [30078, 1]", () => {
  const withKey = N.filtersForCampaign("cmp_v79test01", kp.pubkey);
  assert.deepEqual(withKey, [
    { kinds: [30078], "#d": ["cabal:cmp_v79test01"], authors: [kp.pubkey] },
    { kinds: [78], authors: [kp.pubkey], "#a": [`30078:${kp.pubkey}:cabal:cmp_v79test01`] },
  ]);
  assert.equal(JSON.stringify(withKey).includes('"kinds":[1]'), false);
  // Without a pubkey the campaign event is found first; still no kind 1.
  assert.deepEqual(N.filtersForCampaign("cmp_v79test01"), [
    { kinds: [30078], "#d": ["cabal:cmp_v79test01"] },
  ]);
});

test("decodeEvent accepts kind 78 AND legacy kind 1 post/assist events", async () => {
  const c = mkCampaign();
  const post78 = await N.signEvent(N.postEvent(c, mkPost(), { createdAt: 1001 }), c.key);
  const assist78 = await N.signEvent(N.encryptionEvent(c, mkPost(), mkAssist(), { postEventId: post78.id, createdAt: 1002 }), c.key);
  assert.equal(N.decodeEvent(post78).type, "post");
  assert.equal(N.decodeEvent(assist78).type, "assist");

  // Legacy kind 1 fixtures: what rings published before V79 wrote. The
  // builders never produce these anymore; decode must still merge them.
  const legacyPost = await N.signEvent({
    kind: 1, created_at: 1001,
    tags: [["a", `30078:${kp.pubkey}:cabal:cmp_v79test01`], ["t", "cabal"], ["cabal-post", "pst_v79test01"]],
    content: JSON.stringify(mkPost()),
  }, c.key);
  const legacyAssist = await N.signEvent({
    kind: 1, created_at: 1002,
    tags: [["e", legacyPost.id], ["a", `30078:${kp.pubkey}:cabal:cmp_v79test01`], ["t", "cabal"], ["cabal-post", "pst_v79test01"]],
    content: JSON.stringify(mkAssist()),
  }, c.key);
  const dp = N.decodeEvent(legacyPost);
  assert.equal(dp.type, "post");
  assert.equal(dp.postId, "pst_v79test01");
  assert.equal(N.decodeEvent(legacyAssist).type, "assist");

  // A legacy ring merges end to end through applyRelayEvents.
  const ce = await N.signEvent(N.campaignEvent(c, { createdAt: 1000 }), c.key);
  const merged = N.applyRelayEvents([], [ce, legacyPost, legacyAssist]).campaigns[0];
  assert.equal(merged.posts.length, 1);
  assert.equal(merged.posts[0].assists.length, 1);
  assert.equal(merged.posts[0].assists[0].note, "Shared it.");
});

test("authEvent shape: kind 22242, relay+challenge tags, created_at now, valid signature", async () => {
  const before = Math.floor(Date.now() / 1000);
  const ev = await N.authEvent("wss://nos.lol", "challenge-abc", kp.key);
  const after = Math.floor(Date.now() / 1000);
  assert.equal(ev.kind, 22242);
  assert.equal(ev.pubkey, kp.pubkey, "AUTH authenticates as the campaign keypair");
  assert.deepEqual(ev.tags, [["relay", "wss://nos.lol"], ["challenge", "challenge-abc"]]);
  assert.equal(ev.content, "");
  assert.ok(ev.created_at >= before && ev.created_at <= after);
  assert.equal(await N.verifyEvent(ev), true);
  await assert.rejects(() => N.authEvent("wss://nos.lol", "", kp.key));
  await assert.rejects(() => N.authEvent("", "challenge-abc", kp.key));
});

test("relay client answers an AUTH challenge on connect, then publishes (secret-key seam)", async () => {
  const sent = [];
  let authed = false;
  class AuthWS {
    constructor(url) {
      this.url = url;
      setTimeout(() => {
        this.onopen?.();
        this.onmessage?.({ data: JSON.stringify(["AUTH", "challenge-connect"]) });
      }, 0);
    }
    send(raw) {
      const m = JSON.parse(raw);
      sent.push(m);
      if (m[0] === "AUTH") {
        setTimeout(() => {
          authed = true;
          this.onmessage?.({ data: JSON.stringify(["OK", m[1].id, true, ""]) });
        }, 0);
      }
      if (m[0] === "EVENT") {
        setTimeout(() => this.onmessage?.({ data: JSON.stringify(["OK", m[1].id, authed, authed ? "" : "auth-required: please authenticate"]) }), 0);
      }
    }
    close() {}
  }
  const client = N.createRelayClient({ relays: ["wss://relay.example"], WebSocketImpl: AuthWS, timeoutMs: 500, auth: kp.key });
  const c = mkCampaign();
  const ev = await N.signEvent(N.campaignEvent(c, { createdAt: 1000 }), c.key);
  const res = await client.publish(ev);
  assert.equal(res["wss://relay.example"].ok, true, "publish succeeds once AUTH is answered");
  const authMsgs = sent.filter((m) => m[0] === "AUTH");
  assert.equal(authMsgs.length, 1, "exactly one AUTH answer per connection (memoized)");
  const authEv = authMsgs[0][1];
  assert.equal(authEv.kind, 22242);
  assert.deepEqual(authEv.tags, [["relay", "wss://relay.example"], ["challenge", "challenge-connect"]]);
  assert.equal(await N.verifyEvent(authEv), true);
  assert.equal(sent.filter((m) => m[0] === "EVENT").length, 1, "no publish retry was needed once authed");
  client.close();
});

test("relay client retries publish once after an auth-required: OK (challenge arrives with the rejection)", async () => {
  const sent = [];
  let authed = false;
  class StrictWS {
    constructor(url) {
      this.url = url;
      setTimeout(() => this.onopen?.(), 0); // NO challenge on connect
    }
    send(raw) {
      const m = JSON.parse(raw);
      sent.push(m);
      if (m[0] === "AUTH") {
        setTimeout(() => {
          authed = true;
          this.onmessage?.({ data: JSON.stringify(["OK", m[1].id, true, ""]) });
        }, 0);
      }
      if (m[0] === "EVENT") {
        if (authed) {
          setTimeout(() => this.onmessage?.({ data: JSON.stringify(["OK", m[1].id, true, ""]) }), 0);
        } else {
          // Reject AND send the challenge, as a relay enforcing AUTH does.
          setTimeout(() => {
            this.onmessage?.({ data: JSON.stringify(["OK", m[1].id, false, "auth-required: please authenticate"]) });
            this.onmessage?.({ data: JSON.stringify(["AUTH", "challenge-retry"]) });
          }, 0);
        }
      }
    }
    close() {}
  }
  const client = N.createRelayClient({ relays: ["wss://relay.example"], WebSocketImpl: StrictWS, timeoutMs: 500, auth: kp.key });
  const c = mkCampaign();
  const ev = await N.signEvent(N.campaignEvent(c, { createdAt: 1000 }), c.key);
  const res = await client.publish(ev);
  assert.equal(res["wss://relay.example"].ok, true, "publish succeeds after one AUTH + retry");
  assert.equal(sent.filter((m) => m[0] === "EVENT").length, 2, "the EVENT was sent twice: once unauthenticated, once after AUTH");
  assert.equal(sent.filter((m) => m[0] === "AUTH").length, 1);
  assert.equal(sent.filter((m) => m[0] === "AUTH")[0][1].tags[1][1], "challenge-retry");
  client.close();
});

test("relay client retries fetch once after an auth-required: CLOSED", async () => {
  const c = mkCampaign();
  const ce = await N.signEvent(N.campaignEvent(c, { createdAt: 1000 }), c.key);
  const sent = [];
  let authed = false;
  class StrictFetchWS {
    constructor(url) { this.url = url; setTimeout(() => this.onopen?.(), 0); }
    send(raw) {
      const m = JSON.parse(raw);
      sent.push(m);
      if (m[0] === "AUTH") {
        setTimeout(() => {
          authed = true;
          this.onmessage?.({ data: JSON.stringify(["OK", m[1].id, true, ""]) });
        }, 0);
      }
      if (m[0] === "REQ") {
        if (!authed) {
          setTimeout(() => {
            this.onmessage?.({ data: JSON.stringify(["CLOSED", m[1], "auth-required: please authenticate"]) });
            this.onmessage?.({ data: JSON.stringify(["AUTH", "challenge-fetch"]) });
          }, 0);
        } else {
          setTimeout(() => {
            this.onmessage?.({ data: JSON.stringify(["EVENT", m[1], ce]) });
            this.onmessage?.({ data: JSON.stringify(["EOSE", m[1]]) });
          }, 0);
        }
      }
    }
    close() {}
  }
  const client = N.createRelayClient({ relays: ["wss://relay.example"], WebSocketImpl: StrictFetchWS, timeoutMs: 500, auth: kp.key });
  const got = await client.fetch(N.filtersForCampaign(c.id, kp.pubkey));
  assert.deepEqual(got.map((e) => e.id), [ce.id], "fetch returns the events after one AUTH + REQ retry");
  assert.equal(sent.filter((m) => m[0] === "REQ").length, 2);
  assert.equal(sent.filter((m) => m[0] === "AUTH").length, 1);
  client.close();
});

test("auth signer-function seam: client calls (relayUrl, challenge) and sends its event", async () => {
  const seen = [];
  const signer = async (relayUrl, challenge) => {
    seen.push([relayUrl, challenge]);
    return N.authEvent(relayUrl, challenge, kp.key);
  };
  const sent = [];
  class AuthWS {
    constructor(url) { this.url = url; setTimeout(() => { this.onopen?.(); this.onmessage?.({ data: JSON.stringify(["AUTH", "challenge-fn"]) }); }, 0); }
    send(raw) {
      const m = JSON.parse(raw);
      sent.push(m);
      if (m[0] === "AUTH") setTimeout(() => this.onmessage?.({ data: JSON.stringify(["OK", m[1].id, true, ""]) }), 0);
      if (m[0] === "EVENT") setTimeout(() => this.onmessage?.({ data: JSON.stringify(["OK", m[1].id, true, ""]) }), 0);
    }
    close() {}
  }
  const client = N.createRelayClient({ relays: ["wss://relay.example"], WebSocketImpl: AuthWS, timeoutMs: 500, auth: signer });
  assert.deepEqual(await client.authenticate("wss://relay.example"), true);
  assert.deepEqual(seen, [["wss://relay.example", "challenge-fn"]]);
  assert.equal(await N.verifyEvent(sent.find((m) => m[0] === "AUTH")[1]), true);
  client.close();

  // Miswired auth fails loud at construction, not silent mid-sync.
  assert.throws(() => N.createRelayClient({ relays: [], auth: "not-a-key" }), /valid 64-char hex secret key/);
  assert.throws(() => N.createRelayClient({ relays: [], auth: 42 }), /secret-key hex string or a signer function/);
});

test("syncCampaign authenticates on fetch with the campaign key; read-only fetch stays unauthenticated", async () => {
  const c = mkCampaign();
  const ce = await N.signEvent(N.campaignEvent(c, { createdAt: 1000 }), c.key);
  const sent = [];
  let authed = false;
  class StrictFetchWS {
    constructor(url) { this.url = url; setTimeout(() => this.onopen?.(), 0); }
    send(raw) {
      const m = JSON.parse(raw);
      sent.push(m);
      if (m[0] === "AUTH") {
        setTimeout(() => {
          authed = true;
          this.onmessage?.({ data: JSON.stringify(["OK", m[1].id, true, ""]) });
        }, 0);
      }
      if (m[0] === "REQ") {
        if (!authed) {
          setTimeout(() => {
            this.onmessage?.({ data: JSON.stringify(["CLOSED", m[1], "auth-required: please authenticate"]) });
            this.onmessage?.({ data: JSON.stringify(["AUTH", "challenge-sync"]) });
          }, 0);
        } else {
          setTimeout(() => {
            this.onmessage?.({ data: JSON.stringify(["EVENT", m[1], ce]) });
            this.onmessage?.({ data: JSON.stringify(["EOSE", m[1]]) });
          }, 0);
        }
      }
    }
    close() {}
  }
  // Client built WITHOUT auth: syncCampaign must still authenticate per-op
  // from the campaign key (this is the seam app.js clients rely on).
  const client = N.createRelayClient({ relays: ["wss://relay.example"], WebSocketImpl: StrictFetchWS, timeoutMs: 500 });
  const r = await N.syncCampaign(client, [c], c.id);
  assert.equal(r.applied, 1);
  assert.equal(r.campaigns[0].nostr.eventId, ce.id);
  assert.equal(sent.filter((m) => m[0] === "AUTH").length, 1, "fetch authenticated once with the campaign key");
  assert.equal(JSON.stringify(sent).includes(c.key), false, "campaign key never appears on the wire outside a signature");
  client.close();

  // Read-only ring (no key): no AUTH is attempted, fetch still works.
  const sentRo = [];
  class OpenWS {
    constructor(url) { this.url = url; setTimeout(() => this.onopen?.(), 0); }
    send(raw) {
      const m = JSON.parse(raw);
      sentRo.push(m);
      if (m[0] === "REQ") setTimeout(() => {
        this.onmessage?.({ data: JSON.stringify(["EVENT", m[1], ce]) });
        this.onmessage?.({ data: JSON.stringify(["EOSE", m[1]]) });
      }, 0);
    }
    close() {}
  }
  const roClient = N.createRelayClient({ relays: ["wss://relay.example"], WebSocketImpl: OpenWS, timeoutMs: 500 });
  const { key: _ignored, ...readOnly } = c;
  const r2 = await N.syncCampaign(roClient, [readOnly], c.id);
  assert.equal(r2.applied, 1);
  assert.equal(sentRo.filter((m) => m[0] === "AUTH").length, 0, "read-only fetch sends no AUTH");
  roClient.close();
});

test("publishCampaign / publishRemoval / publishAdoption publish zero kind 1 events", async () => {
  const published = [];
  const client = { publish: async (e) => { published.push(e); return { "wss://a": { ok: true } }; } };
  const c = mkCampaign();
  c.posts[0].assists = [mkAssist()];
  await N.publishCampaign(client, c);
  assert.ok(published.length >= 3, "campaign + post + assist published");
  assert.deepEqual([...new Set(published.map((e) => e.kind))].sort((a, b) => a - b), [78, 30078]);
  assert.equal(published.filter((e) => e.kind === 1).length, 0);

  const rem = await N.publishRemoval(client, { ...c, members: [], removedMembers: [{ handle: "@b", removedAt: T, removedBy: "@a" }] }, { by: "@a", createdAt: 2000 });
  assert.equal(rem.kind, 30078);
  const adop = await N.publishAdoption(client, { ...c, formatIds: ["fmt_v79test1"] }, { createdAt: 2001 });
  assert.equal(adop.kind, 30078);
  assert.equal(published.filter((e) => e.kind === 1).length, 0, "still zero kind 1 events after removal + adoption");
  for (const e of published) assert.equal(await N.verifyEvent(e), true);
});
