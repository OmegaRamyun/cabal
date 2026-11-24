import test from "node:test";
import assert from "node:assert/strict";
import {
  createCampaign, validateCampaign, addMember, markPosted,
  postedCount, markContributed, isLive, isUpcoming,
  encodeCampaignLink, decodeCampaignLink,
} from "../src/campaign.mjs";
import { createMemoryStore, createStore, KEYS } from "../src/store.mjs";

const game = {
  name: "Brass Orchard",
  links: { steam: "https://store.steampowered.com/app/1", itch: "https://brass.itch.io/orchard" },
  tags: ["cozy", "farming"],
};
const anchorPost = {
  platform: "x",
  url: "https://x.com/brass/status/1",
  text: "Brass Orchard launches Friday!",
  author: "@brassdev",
};
const creator = { name: "Brass Dev", handle: "@brassdev" };

const make = (over = {}) => createCampaign({
  game, title: "Launch push", anchorPost,
  window: { start: "2026-11-23", end: "2026-11-30" },
  creator, ...over,
});

test("createCampaign: assigns cmp_ id + createdAt, creator is members[0] pending", () => {
  const c = make();
  assert.match(c.id, /^cmp_[a-z0-9]{8}$/);
  assert.ok(!Number.isNaN(Date.parse(c.createdAt)));
  assert.deepEqual(c.members, [{ name: "Brass Dev", handle: "@brassdev" }]);
  assert.equal(c.posts.length, 1);
  assert.match(c.posts[0].id, /^pst_[a-z0-9]{8}$/);
  assert.equal(c.anchorPost.url, c.posts[0].url);
  assert.equal(c.window.start, "2026-11-23");
  assert.deepEqual(validateCampaign(c), []);
});

test("createCampaign: ids are unique, window null when omitted", () => {
  const a = make({ window: null });
  const b = make({ window: null });
  assert.notEqual(a.id, b.id);
  assert.equal(a.window, null);
  assert.deepEqual(validateCampaign(a), []);
});

test("validateCampaign: each missing field is reported", () => {
  const good = make();
  const cases = [
    ["game.name", { ...good, game: { ...good.game, name: "" } }],
    ["game.name (blank)", { ...good, game: { ...good.game, name: "   " } }],
    ["posts[0].url", { ...good, posts: [{ ...good.posts[0], url: "" }] }],
    ["posts[0].url (not http)", { ...good, posts: [{ ...good.posts[0], url: "ftp://x" }] }],
    ["posts[0].author", { ...good, posts: [{ ...good.posts[0], author: "" }] }],
    ["posts[0].platform", { ...good, posts: [{ ...good.posts[0], platform: "" }] }],
    ["legacy anchorPost.url", { ...good, posts: undefined, anchorPost: { ...good.anchorPost, url: "" } }],
    ["legacy anchorPost.text", { ...good, posts: undefined, anchorPost: { ...good.anchorPost, text: "" } }],
    ["legacy anchorPost.author", { ...good, posts: undefined, anchorPost: { ...good.anchorPost, author: "" } }],
    ["legacy anchorPost.platform", { ...good, posts: undefined, anchorPost: { ...good.anchorPost, platform: "mastodon" } }],
    ["title", { ...good, title: "" }],
    ["members (empty)", { ...good, members: [] }],
    ["members (missing)", { ...good, members: undefined }],
    ["window reversed", { ...good, window: { start: "2026-11-30", end: "2026-11-23" } }],
  ];
  for (const [label, bad] of cases) {
    assert.ok(validateCampaign(bad).length > 0, label);
  }
  // Steam alone suffices; itch alone suffices.
  assert.deepEqual(validateCampaign({ ...good, game: { ...good.game, links: { steam: "https://store.steampowered.com/app/1" } } }), []);
  assert.deepEqual(validateCampaign({ ...good, game: { ...good.game, links: { itch: "https://brass.itch.io/orchard" } } }), []);
  assert.deepEqual(validateCampaign(null), ["campaign: missing or not an object"]);
});

test("createCampaign: throws on invalid input", () => {
  // V62: game.links is optional now, so an empty links object no longer throws.
  assert.doesNotThrow(() => createCampaign({ game: { ...game, links: {} }, title: "x", anchorPost, creator, window: null }));
  assert.throws(() => createCampaign({ game, title: "x", anchorPost, window: null }), /members/);
});

test("addMember: appends pending, dedupes handle (case-insensitive), no mutation", () => {
  const c = make();
  const before = JSON.stringify(c);
  const withJo = addMember(c, { name: "Jo", handle: "@jo" });
  assert.equal(JSON.stringify(c), before, "original untouched");
  assert.equal(withJo.members.length, 2);
  assert.equal(withJo.members[1].status, undefined);
  const dup = addMember(withJo, { name: "Jo Again", handle: "@JO" });
  assert.equal(dup.members.length, 2);
  assert.equal(dup.members[1].name, "Jo");
  assert.notEqual(dup, withJo);
});

test("markPosted (deprecated): contributes on posts[0], unknown handle is a no-op copy", () => {
  const c = addMember(make(), { name: "Jo", handle: "@jo" });
  const posted = markPosted(c, "@jo", "https://x.com/jo/status/9");
  assert.equal(c.posts[0].assists.length, 0, "original untouched");
  assert.equal(posted.posts[0].assists.length, 1);
  assert.equal(posted.posts[0].assists[0].handle, "@jo");
  assert.equal(posted.posts[0].assists[0].url, "https://x.com/jo/status/9");
  assert.equal(postedCount(posted), 1);
  const noop = markPosted(c, "@nobody");
  assert.deepEqual(noop, c);
  assert.notEqual(noop, c);
});

test("postedCount on a fresh campaign is 0", () => {
  assert.equal(postedCount(make()), 0);
});

test("isLive / isUpcoming: windowed and windowless", () => {
  const c = make();
  assert.equal(isLive(c, new Date("2026-11-25T12:00:00Z")), true);
  assert.equal(isLive(c, new Date("2026-11-22T12:00:00Z")), false);
  assert.equal(isLive(c, new Date("2026-12-01T00:00:00Z")), false);
  assert.equal(isUpcoming(c, new Date("2026-11-22T12:00:00Z")), true);
  assert.equal(isUpcoming(c, new Date("2026-11-25T12:00:00Z")), false);
  const open = make({ window: null });
  assert.equal(isLive(open, new Date("2031-01-01T00:00:00Z")), true);
  assert.equal(isUpcoming(open), false);
});

test("encode/decode round-trip, incl. unicode text", () => {
  const c = addMember(make(), { name: "Zoë 🎮", handle: "@zoe" });
  const { url, long } = encodeCampaignLink(c, "https://example.test/cabal/");
  assert.equal(long, false);
  assert.ok(url.startsWith("https://example.test/cabal/#c="));
  assert.ok(!/[+/=]/.test(url.split("#c=")[1]), "base64url only");
  const { campaign, error } = decodeCampaignLink(url.slice(url.indexOf("#")));
  assert.equal(error, undefined);
  assert.deepEqual(campaign, c);
});

test("encodeCampaignLink: long payload flagged, still returned", () => {
  const big = make({ title: "x".repeat(3000) });
  const { url, long } = encodeCampaignLink(big, "https://example.test/");
  assert.equal(long, true);
  assert.ok(url.includes("#c="));
  assert.deepEqual(decodeCampaignLink(url.slice(url.indexOf("#"))).campaign, big);
});

test("decodeCampaignLink: garbage never throws, always { error }", () => {
  for (const bad of ["", "#c=", "#c=!!!not-base64!!!", "#c=aGVsbG8=", "#c=eyJpZCI6MX0", "#x=abc", null, undefined, 42]) {
    const r = decodeCampaignLink(bad);
    assert.ok(r.error, JSON.stringify(bad));
    assert.equal(r.campaign, undefined);
  }
  // Valid JSON + valid base64 but failing validation -> error.
  const { url } = encodeCampaignLink({ id: "cmp_nope" }, "https://example.test/");
  assert.ok(decodeCampaignLink(url.slice(url.indexOf("#"))).error);
});

test("store: memory-store round-trip for game, campaigns, me, demo flag", () => {
  const store = createMemoryStore();
  assert.equal(store.loadGame(), null);
  assert.deepEqual(store.loadCampaigns(), []);
  assert.equal(store.loadMe(), null);
  assert.equal(store.demoFlag(), "off");

  store.saveGame(game);
  store.saveCampaigns([make()]);
  store.saveMe(creator);
  store.setDemoFlag("on");
  assert.deepEqual(store.loadGame(), game);
  assert.equal(store.loadCampaigns().length, 1);
  assert.equal(store.loadCampaigns()[0].title, "Launch push");
  assert.deepEqual(store.loadMe(), creator);
  assert.equal(store.demoFlag(), "on");

  store.setDemoFlag("bogus");
  assert.equal(store.demoFlag(), "on", "invalid flag value ignored");
  store.clearAll();
  assert.equal(store.loadGame(), null);
  assert.deepEqual(store.loadCampaigns(), []);
  assert.equal(store.loadMe(), null);
  assert.equal(store.demoFlag(), "off");
});

test("store: corrupt / wrong-typed values fall back to defaults", () => {
  const raw = new Map();
  const storage = {
    getItem: (k) => (raw.has(k) ? raw.get(k) : null),
    setItem: (k, v) => raw.set(k, String(v)),
    removeItem: (k) => raw.delete(k),
  };
  const store = createStore(storage);
  raw.set(KEYS.game, "{not json");
  raw.set(KEYS.campaigns, '"a string, not a list"');
  raw.set(KEYS.me, "[1,2]");
  raw.set(KEYS.demo, "maybe");
  assert.equal(store.loadGame(), null);
  assert.deepEqual(store.loadCampaigns(), []);
  assert.equal(store.loadMe(), null, "non-object me falls back to null");
  assert.equal(store.demoFlag(), "off");
  // A throwing backend also falls back, never throws.
  const boom = createStore({ getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); }, removeItem() { throw new Error("denied"); } });
  assert.equal(boom.loadGame(), null);
  assert.deepEqual(boom.loadCampaigns(), []);
  assert.equal(boom.demoFlag(), "off");
  assert.doesNotThrow(() => { boom.saveGame(game); boom.setDemoFlag("on"); boom.clearAll(); });
});

test("store keys are under cabal.v2.*", () => {
  assert.deepEqual(Object.values(KEYS).sort(), [
    "cabal.v2.campaigns", "cabal.v2.demo", "cabal.v2.game", "cabal.v2.journal", "cabal.v2.me",
  ]);
});
