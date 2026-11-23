import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCampaign, addMember, removeMember, isRemoved, isMember,
  normalizeCampaign, validateCampaign, markContributed,
  encodeCampaignLink, decodeCampaignLink,
} from "../src/campaign.mjs";

const mk = (extra = {}) => createCampaign({
  game: { name: "G", links: { itch: "https://x.itch.io/g" } },
  title: "T",
  posts: [{ platform: "x", url: "https://x.com/a/status/1", text: "hi", author: "@a" }],
  creator: { name: "Ann", handle: "@ann" },
  ...extra,
});
const NOW = "2026-11-23T12:00:00.000Z";

function ring() {
  let c = mk();
  c = addMember(c, { name: "Bob", handle: "@bob" });
  c = addMember(c, { name: "Cy", handle: "@cy" });
  return markContributed(c, c.posts[0].id, "@bob", { now: NOW });
}

test("createdBy defaults to members[0].handle; removedMembers []", () => {
  const c = mk();
  assert.equal(c.createdBy, "@ann");
  assert.deepEqual(c.removedMembers, []);
  const old = normalizeCampaign({ ...mk(), createdBy: undefined, removedMembers: undefined });
  assert.equal(old.createdBy, "@ann");
  assert.deepEqual(old.removedMembers, []);
});

test("removeMember: creator removes, history kept, input not mutated", () => {
  const c = ring();
  const before = JSON.stringify(c);
  const r = removeMember(c, "@bob", { by: "@ANN", now: NOW });
  assert.equal(JSON.stringify(c), before);
  assert.ok(!isMember(r, "@bob"));
  assert.ok(isRemoved(r, "@BOB"));
  assert.deepEqual(r.removedMembers, [{ handle: "@bob", removedAt: NOW, removedBy: "@ann" }]);
  assert.equal(r.posts[0].assists.some((a) => a.handle === "@bob"), true);
  assert.deepEqual(validateCampaign(r), []);
});

test("removeMember: non-creator and creator-self are no-ops", () => {
  const c = ring();
  assert.deepEqual(removeMember(c, "@cy", { by: "@bob", now: NOW }), c);
  assert.deepEqual(removeMember(c, "@cy", { now: NOW }), c);
  assert.deepEqual(removeMember(c, "@ann", { by: "@ann", now: NOW }), c);
});

test("removeMember: second removal dedupes and updates removedAt", () => {
  const r1 = removeMember(ring(), "@bob", { by: "@ann", now: NOW });
  const r2 = removeMember(r1, "@Bob", { by: "@ann", now: "2026-11-24T00:00:00.000Z" });
  assert.equal(r2.removedMembers.length, 1);
  assert.equal(r2.removedMembers[0].removedAt, "2026-11-24T00:00:00.000Z");
});

test("removed handle cannot rejoin; others can", () => {
  const r = removeMember(ring(), "@bob", { by: "@ann", now: NOW });
  const again = addMember(r, { name: "Bob", handle: "@BOB" });
  assert.ok(!isMember(again, "@bob"));
  assert.ok(isMember(addMember(r, { name: "Di", handle: "@di" }), "@di"));
});

test("isMember / isRemoved tolerate junk", () => {
  assert.equal(isMember({}, "@a"), false);
  assert.equal(isRemoved({}, "@a"), false);
  assert.equal(isRemoved(mk(), ""), false);
});

test("normalizeCampaign passes through removal fields, key, nostr sidecar", () => {
  const c = removeMember(ring(), "@bob", { by: "@ann", now: NOW });
  const withExtra = { ...c, key: "sekrit", nostr: { naddr: "n1", relays: ["wss://r"] } };
  const n = normalizeCampaign(withExtra);
  assert.deepEqual(n.removedMembers, c.removedMembers);
  assert.equal(n.createdBy, "@ann");
  assert.equal(n.key, "sekrit");
  assert.deepEqual(n.nostr, withExtra.nostr);
  assert.deepEqual(normalizeCampaign(n), n);
});

test("createdBy stays pinned after roster change", () => {
  const c = mk();
  const n = normalizeCampaign({ ...c, members: [{ name: "Z", handle: "@z" }, ...c.members] });
  assert.equal(n.createdBy, "@ann");
});

test("createCampaign stores an opaque key; validateCampaign accepts new fields", () => {
  const c = mk({ key: "opaque-KEY_123" });
  assert.equal(c.key, "opaque-KEY_123");
  assert.equal(mk().key, undefined);
  assert.deepEqual(validateCampaign(c), []);
  assert.ok(validateCampaign({ ...c, removedMembers: "x" }).length > 0);
  assert.ok(validateCampaign({ ...c, removedMembers: [{}] }).length > 0);
});

test("link: key rides in the fragment as &k=, absent from query and payload", () => {
  const c = removeMember(ring(), "@bob", { by: "@ann", now: NOW });
  const key = "a b&c=d/é+";
  const { url } = encodeCampaignLink({ ...c, key }, "https://ex.test/app?x=1");
  const [beforeHash, frag] = url.split("#");
  assert.ok(!beforeHash.includes(key) && !/k=/.test(beforeHash));
  assert.ok(frag.includes("&k="));
  const payload = frag.split("&")[0].slice(2);
  assert.ok(!Buffer.from(payload, "base64url").toString().includes("a b"));
  assert.ok(!Buffer.from(payload, "base64url").toString().includes('"key"'));
  const back = decodeCampaignLink(url);
  assert.equal(back.error, undefined);
  assert.equal(back.campaign.key, key);
  assert.deepEqual(back.campaign.removedMembers, c.removedMembers);
  assert.equal(back.campaign.createdBy, "@ann");
});

test("link: no key -> no k param; hash/bare forms still decode", () => {
  const c = ring();
  const { url } = encodeCampaignLink(c, "");
  assert.ok(!url.includes("&k="));
  const d1 = decodeCampaignLink(url);
  assert.equal(d1.campaign.key, undefined);
  assert.ok(decodeCampaignLink(url.slice(1)).campaign);
  const withKey = encodeCampaignLink({ ...c, key: "K1" }, "").url;
  assert.equal(decodeCampaignLink(withKey.slice(1)).campaign.key, "K1");
});

test("link: decode errors never echo the key", () => {
  const r = decodeCampaignLink("#c=!!!&k=SECRETKEY");
  assert.ok(r.error);
  assert.ok(!r.error.includes("SECRETKEY"));
});
