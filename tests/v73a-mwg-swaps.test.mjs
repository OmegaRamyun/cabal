// V73a — Modern Web Guidance mechanical swaps, part A.
// Covers the structuredClone() swaps (M2) through the exported functions
// that use the module-private clone helpers. The helpers themselves are
// not exported, so each is exercised via its public caller:
//
//   - src/campaign.mjs clone(v)       -> normalizeCampaign / addMember / addPost
//   - src/nostr.mjs cloneCampaign(c)  -> loadSnapshot
//   - src/campaign-page.mjs clone(v)  -> NOT reachable via any public API:
//     every call site sits in a fallback branch behind a
//     `typeof campaignModel.X === 'function'` check that is always true
//     (campaignModel = ./campaign.mjs). Its swap is identical to the
//     campaign.mjs one and is verified by inspection; the `undefined`
//     guard is preserved verbatim in all three files.
//
// M1 (innerHTML = '' -> replaceChildren() in src/templates.mjs) and the
// M3 copy fix (src/nostr.mjs removed-text segment) are DOM-only behaviour:
// manual-check notes in tasks/V73a-mwg-swaps-a.md, no skipped test here
// (per repo AGENTS.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCampaign, addMember, addPost, removeMember, normalizeCampaign,
} from "../src/campaign.mjs";
import { loadSnapshot } from "../src/nostr.mjs";

const mk = (extra = {}) => createCampaign({
  game: { name: "G", links: { itch: "https://x.itch.io/g" } },
  title: "T",
  posts: [{ platform: "x", url: "https://x.com/a/status/1", text: "hi", author: "@a" }],
  creator: { name: "Ann", handle: "@ann" },
  ...extra,
});

// --- src/campaign.mjs clone(v) via normalizeCampaign -------------------------

test("normalizeCampaign deep-copies: mutating the result leaves the source untouched", () => {
  const src = mk();
  const out = normalizeCampaign(src);
  out.game.links.itch = "https://mutated.example/g";
  out.game.name = "Mutated";
  out.members[0].handle = "@mutated";
  out.posts[0].text = "mutated";
  assert.equal(src.game.links.itch, "https://x.itch.io/g");
  assert.equal(src.game.name, "G");
  assert.equal(src.members[0].handle, "@ann");
  assert.equal(src.posts[0].text, "hi");
});

test("normalizeCampaign returns undefined for undefined input (clone guard)", () => {
  assert.equal(normalizeCampaign(undefined), undefined);
  assert.equal(normalizeCampaign(null), null);
});

test("normalizeCampaign keeps ISO date strings as strings, never Date objects", () => {
  const src = mk();
  assert.equal(typeof src.createdAt, "string");
  const out = normalizeCampaign(src);
  assert.equal(typeof out.createdAt, "string");
  assert.equal(out.createdAt, src.createdAt);
  assert.equal(typeof out.posts[0].createdAt, "string");
});

// --- src/campaign.mjs clone(v) via addMember / addPost / removeMember -------

test("addMember returns a new campaign and does not mutate the source", () => {
  const src = mk();
  const out = addMember(src, { name: "Bob", handle: "@bob" });
  assert.notEqual(out, src);
  assert.notEqual(out.members, src.members);
  assert.equal(src.members.length, 1);
  assert.equal(out.members.length, 2);
  out.members[1].handle = "@mutated";
  assert.equal(src.members.length, 1);
});

test("addPost returns a new campaign and does not mutate the source posts", () => {
  const src = mk();
  const out = addPost(src, {
    platform: "x", url: "https://x.com/b/status/2", author: "@b", text: "second",
  });
  assert.equal(src.posts.length, 1);
  assert.equal(out.posts.length, 2);
  out.posts[0].text = "mutated";
  assert.equal(src.posts[0].text, "hi");
});

test("removeMember returns a new campaign and does not mutate the source", () => {
  let src = mk();
  src = addMember(src, { name: "Bob", handle: "@bob" });
  const out = removeMember(src, "@bob", { by: "@ann", now: "2026-11-24T00:00:00.000Z" });
  assert.equal(src.members.length, 2);
  assert.equal(out.members.length, 1);
  assert.deepEqual(src.removedMembers, []);
  assert.equal(out.removedMembers[0].handle, "@bob");
});

// --- src/nostr.mjs cloneCampaign(c) via loadSnapshot ------------------------

test("loadSnapshot deep-copies the snapshot: mutating the result leaves it untouched", () => {
  const snapshot = mk();
  const out = loadSnapshot([], snapshot);
  assert.equal(out.length, 1);
  assert.notEqual(out[0], snapshot);
  out[0].game.links.itch = "https://mutated.example/g";
  out[0].members[0].handle = "@mutated";
  out[0].posts[0].text = "mutated";
  assert.equal(snapshot.game.links.itch, "https://x.itch.io/g");
  assert.equal(snapshot.members[0].handle, "@ann");
  assert.equal(snapshot.posts[0].text, "hi");
});

test("loadSnapshot keeps the snapshot ISO date strings as strings", () => {
  const snapshot = mk();
  const out = loadSnapshot([], snapshot);
  assert.equal(typeof out[0].createdAt, "string");
  assert.equal(out[0].createdAt, snapshot.createdAt);
});
