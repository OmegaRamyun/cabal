import test from "node:test";
import assert from "node:assert/strict";
import {
  createCampaign, validateCampaign, normalizeCampaign, addPost, addMember,
  markContributed, markPosted, latestPost, latestActivity, unassistedPostsFor,
  postAssists, postedCount, detectPlatform, parsePostUrl, isLive, isUpcoming,
  encodeCampaignLink, decodeCampaignLink, NOTE_MAX,
} from "../src/campaign.mjs";
import * as campaignMod from "../src/campaign.mjs";
import { isListable } from "../src/discovery.mjs";
import { demoCampaigns } from "../src/demo.mjs";
import { campaignToEntry } from "../src/atom.mjs";
import { readFileSync } from "node:fs";

const NOW = new Date("2026-11-23T12:00:00.000Z");
const game = { name: "Brass Orchard", links: { itch: "https://brass.itch.io/orchard" }, tags: ["cozy"] };
const anchorPost = { platform: "x", url: "https://x.com/brass/status/1", text: "Launch!", author: "@brassdev" };
const creator = { name: "Brass Dev", handle: "@brassdev" };

// A pre-V38 stored campaign: anchor-only, members carry posted state.
const legacy = () => ({
  id: "cmp_legacy01",
  game: { ...game },
  title: "Launch push",
  anchorPost: { ...anchorPost },
  window: { start: "2026-11-22", end: "2026-11-29" },
  members: [
    { name: "Brass Dev", handle: "@brassdev", status: "pending" },
    { name: "Jo", handle: "@jo", status: "posted", quoteUrl: "https://x.com/jo/status/9", postedAt: "2026-11-22T10:00:00Z", quoteText: "Worth a look." },
    { name: "Al", handle: "@al", status: "pending" },
  ],
  createdAt: "2026-11-22T09:00:00Z",
});

const ring = () => {
  let c = createCampaign({ game, title: "Ring", anchorPost, creator, window: null });
  c = addMember(c, { name: "Jo", handle: "@jo" });
  return c;
};

// --- normalizeCampaign / migration ---

test("normalizeCampaign: old anchor-only shape -> v2, member posted state -> assists on posts[0]", () => {
  const old = legacy();
  const before = JSON.stringify(old);
  const c = normalizeCampaign(old);
  assert.equal(JSON.stringify(old), before, "input untouched");
  assert.equal(c.posts.length, 1);
  const p = c.posts[0];
  assert.match(p.id, /^pst_[a-z0-9]{8}$/);
  assert.equal(p.author, "@brassdev");
  assert.equal(p.platform, "x");
  assert.equal(p.url, anchorPost.url);
  assert.equal(p.createdAt, old.createdAt);
  assert.deepEqual(p.assists, [{
    handle: "@jo", status: "contributed", contributedAt: "2026-11-22T10:00:00Z",
    url: "https://x.com/jo/status/9", quoteText: "Worth a look.",
  }]);
  for (const m of c.members) {
    for (const k of ["status", "quoteUrl", "postedAt", "quoteText"]) assert.equal(m[k], undefined, k);
  }
  assert.equal(c.members.length, 3, "pending members stay on the roster");
  assert.deepEqual(c.window, old.window, "window passes through");
  assert.deepEqual(c.anchorPost, old.anchorPost);
  assert.deepEqual(validateCampaign(c), []);
});

test("normalizeCampaign: idempotent and deterministic post id", () => {
  const once = normalizeCampaign(legacy());
  assert.deepEqual(normalizeCampaign(once), once);
  assert.equal(normalizeCampaign(legacy()).posts[0].id, once.posts[0].id);
});

test("normalizeCampaign: posts shape kept, anchorPost derived when missing; posted time falls back to createdAt", () => {
  const c = normalizeCampaign({
    ...legacy(), anchorPost: undefined,
    posts: [{ id: "pst_aaaaaaaa", author: "@z", platform: "reddit", url: "https://reddit.com/r/a/comments/1/x/", createdAt: "2026-11-22T09:00:00Z" }],
    members: [{ name: "Jo", handle: "@jo", status: "posted" }],
  });
  assert.equal(c.posts[0].id, "pst_aaaaaaaa");
  assert.deepEqual(c.posts[0].assists.map((a) => a.contributedAt), ["2026-11-22T09:00:00Z"]);
  assert.equal(c.anchorPost.author, "@z");
  assert.equal(c.anchorPost.platform, "reddit");
});

test("normalizeCampaign: never throws on garbage", () => {
  for (const bad of [null, undefined, 5, "x", [], {}, { posts: "nope" }, { anchorPost: 3 }, { posts: [null, 4] }]) {
    assert.doesNotThrow(() => normalizeCampaign(bad));
  }
  assert.equal(normalizeCampaign(null), null);
  assert.deepEqual(normalizeCampaign({ id: "a" }), { id: "a" });
});

test("normalizeCampaign: clips an over-long note to 280", () => {
  const c = normalizeCampaign({
    ...legacy(), anchorPost: undefined,
    posts: [{ id: "pst_aaaaaaaa", author: "@z", platform: "x", url: "https://x.com/z/status/1", createdAt: "2026-11-22T09:00:00Z",
      assists: [{ handle: "@jo", contributedAt: "2026-11-22T10:00:00Z", note: "n".repeat(400) }] }],
  });
  assert.equal(c.posts[0].assists[0].note.length, NOTE_MAX);
});

// --- validate (both shapes) ---

test("validateCampaign: both shapes valid; neither anchor nor posts invalid; post/assist rules", () => {
  assert.deepEqual(validateCampaign(legacy()), []);
  const v2 = normalizeCampaign(legacy());
  assert.deepEqual(validateCampaign(v2), []);
  assert.ok(validateCampaign({ ...v2, posts: [], anchorPost: undefined }).length > 0);
  const bad = (patch) => validateCampaign({ ...v2, posts: [{ ...v2.posts[0], ...patch }] });
  assert.ok(bad({ id: "" }).some((e) => /id/.test(e)));
  assert.ok(bad({ author: "" }).some((e) => /author/.test(e)));
  assert.ok(bad({ platform: "" }).some((e) => /platform/.test(e)));
  assert.ok(bad({ url: "ftp://nope" }).some((e) => /url/.test(e)));
  assert.ok(bad({ createdAt: "soon" }).some((e) => /createdAt/.test(e)));
  assert.ok(bad({ assists: [{ handle: "", contributedAt: "2026-11-22T10:00:00Z" }] }).some((e) => /handle/.test(e)));
  assert.ok(bad({ assists: [{ handle: "@a", contributedAt: "never" }] }).some((e) => /contributedAt/.test(e)));
  assert.ok(bad({ assists: [{ handle: "@a", contributedAt: "2026-11-22T10:00:00Z", url: "javascript:1" }] }).some((e) => /url/.test(e)));
  assert.ok(bad({ assists: [{ handle: "@a", contributedAt: "2026-11-22T10:00:00Z", note: "x".repeat(281) }] }).some((e) => /note/.test(e)));
  assert.deepEqual(bad({ assists: [{ handle: "@a", contributedAt: "2026-11-22T10:00:00Z" }] }), [], "url and note are optional");
  assert.ok(validateCampaign({ ...v2, posts: [v2.posts[0], v2.posts[0]] }).some((e) => /duplicate/.test(e)));
});

test("decodeCampaignLink: an old-shape link decodes into v2", () => {
  const { url } = encodeCampaignLink(legacy(), "https://e.test/");
  const { campaign, error } = decodeCampaignLink(url);
  assert.equal(error, undefined);
  assert.equal(campaign.posts.length, 1);
  assert.equal(campaign.posts[0].assists[0].handle, "@jo");
});

// --- createCampaign ---

test("createCampaign: builds posts from anchorPost; accepts posts input; anchorPost mirrors posts[0]", () => {
  const a = createCampaign({ game, title: "T", anchorPost, creator });
  assert.equal(a.posts.length, 1);
  assert.deepEqual(a.posts[0].assists, []);
  assert.equal(a.window, null);

  const b = createCampaign({
    game, title: "T", creator,
    posts: [
      { author: "@brassdev", platform: "reddit", url: "https://www.reddit.com/r/gamedev/comments/1/x/", text: "devlog", kind: "devlog" },
      { author: "@brassdev", url: "https://www.instagram.com/p/ABC/" },
    ],
  });
  assert.equal(b.posts.length, 2);
  assert.match(b.posts[0].id, /^pst_/);
  assert.notEqual(b.posts[0].id, b.posts[1].id);
  assert.equal(b.posts[1].platform, "instagram", "platform detected from URL when omitted");
  assert.equal(b.anchorPost.url, b.posts[0].url);
  assert.deepEqual(validateCampaign(b), []);
  assert.throws(() => createCampaign({ game, title: "T", creator, posts: [{ author: "@a", platform: "x", url: "https://x.com/a/status/1" }] }), /text/);
});

// --- addPost ---

test("addPost: appends, assigns pst_ id + createdAt, keeps anchorPost, no mutation, throws on invalid", () => {
  const c = ring();
  const before = JSON.stringify(c);
  const next = addPost(c, { author: "@jo", platform: "reddit", url: "https://www.reddit.com/r/a/comments/2/y/", text: "ctx", kind: "devlog" });
  assert.equal(JSON.stringify(c), before);
  assert.equal(next.posts.length, 2);
  assert.match(next.posts[1].id, /^pst_[a-z0-9]{8}$/);
  assert.ok(!Number.isNaN(Date.parse(next.posts[1].createdAt)));
  assert.deepEqual(next.posts[1].assists, []);
  assert.deepEqual(next.anchorPost, c.anchorPost);
  assert.throws(() => addPost(c, { author: "@jo", platform: "reddit", url: "not a url" }), /url/);
  assert.throws(() => addPost(c, { platform: "reddit", url: "https://reddit.com/r/a/comments/2/y/" }), /author/);
  assert.throws(() => addPost(c, { author: "@jo", platform: "x", url: "https://x.com/jo/status/3" }), /text/);
  assert.throws(() => addPost(c, { id: c.posts[0].id, author: "@jo", platform: "reddit", url: "https://reddit.com/r/a/comments/2/y/" }), /already used/);
  assert.equal(addPost(c, { author: "@jo", url: "https://example.com/p", kind: "weird" }).posts[1].kind, "other");
});

// --- markContributed ---

test("markContributed: upserts one assist per handle (case-insensitive), keeps note, never duplicates", () => {
  const c = ring();
  const pid = c.posts[0].id;
  const a = markContributed(c, pid, "@jo", { url: "https://x.com/jo/status/5", quoteText: "q", note: "Liked. Shared to #Ring.", now: NOW });
  assert.equal(c.posts[0].assists.length, 0, "no mutation");
  const as = postAssists(a.posts[0]);
  assert.equal(as.length, 1);
  assert.deepEqual(as[0], {
    handle: "@jo", status: "contributed", contributedAt: NOW.toISOString(),
    url: "https://x.com/jo/status/5", quoteText: "q", note: "Liked. Shared to #Ring.",
  });
  const later = new Date("2026-11-24T00:00:00Z");
  const b = markContributed(a, pid, "@JO", { note: "Commented too.", now: later });
  const bs = postAssists(b.posts[0]);
  assert.equal(bs.length, 1, "upsert in place");
  assert.equal(bs[0].handle, "@jo");
  assert.equal(bs[0].note, "Commented too.");
  assert.equal(bs[0].url, "https://x.com/jo/status/5", "omitted fields keep their value");
  assert.equal(bs[0].contributedAt, later.toISOString());
  const cleared = markContributed(b, pid, "@jo", { url: "" });
  assert.equal(postAssists(cleared.posts[0])[0].url, undefined);
});

test("markContributed: note optional, clipped to 280; unknown postId and blank handle are unchanged copies", () => {
  const c = ring();
  const pid = c.posts[0].id;
  const bare = markContributed(c, pid, "@jo", { now: NOW });
  assert.equal(postAssists(bare.posts[0])[0].note, undefined);
  const long = markContributed(c, pid, "@jo", { note: "z".repeat(500) });
  assert.equal(postAssists(long.posts[0])[0].note.length, NOTE_MAX);
  for (const noop of [markContributed(c, "pst_nonexist", "@jo"), markContributed(c, pid, "   "), markContributed(c, pid, undefined)]) {
    assert.deepEqual(noop, c);
    assert.notEqual(noop, c);
  }
});

test("markContributed: works on an old-shape campaign via the derived post id", () => {
  const pid = normalizeCampaign(legacy()).posts[0].id;
  const c = markContributed(legacy(), pid, "@al", { now: NOW });
  assert.deepEqual(c.posts[0].assists.map((a) => a.handle), ["@jo", "@al"]);
});

test("markPosted (deprecated wrapper): contributes on posts[0]; non-member is a no-op", () => {
  const c = ring();
  const d = markPosted(c, "@jo", "https://x.com/jo/status/7", NOW);
  assert.equal(d.posts[0].assists[0].url, "https://x.com/jo/status/7");
  assert.equal(d.posts[0].assists[0].contributedAt, NOW.toISOString());
  assert.equal(markPosted(c, "@nobody").posts[0].assists.length, 0);
});

// --- feed helpers ---

test("latestPost / latestActivity / postAssists", () => {
  let c = ring();
  assert.equal(latestPost(c).id, c.posts[0].id);
  c = addPost(c, { author: "@jo", platform: "reddit", url: "https://reddit.com/r/a/comments/2/y/", createdAt: "2026-11-25T00:00:00Z" });
  const second = c.posts[1];
  assert.equal(latestPost(c).id, second.id);
  assert.equal(latestActivity(c), "2026-11-25T00:00:00Z");
  c = markContributed(c, c.posts[0].id, "@jo", { now: new Date("2026-12-01T00:00:00Z") });
  assert.equal(latestActivity(c), "2026-12-01T00:00:00.000Z", "an assist can be the newest activity");
  assert.equal(latestPost(c).id, second.id, "assists do not change the latest post");
  assert.deepEqual(postAssists(undefined), []);
  assert.deepEqual(postAssists({}), []);
  assert.equal(latestPost({}), null);
  assert.equal(latestActivity({ createdAt: "2026-11-20T00:00:00Z" }), "2026-11-20T00:00:00Z");
});

test("unassistedPostsFor: newest first, skips posts already assisted and the handle's own posts", () => {
  let c = ring();
  c = addPost(c, { author: "@brassdev", platform: "reddit", url: "https://reddit.com/r/a/comments/2/y/", createdAt: "2026-11-24T00:00:00Z" });
  c = addPost(c, { author: "@jo", platform: "instagram", url: "https://instagram.com/p/Q/", createdAt: "2026-11-25T00:00:00Z" });
  const [p0, p1, p2] = c.posts;
  assert.deepEqual(unassistedPostsFor(c, "@jo").map((p) => p.id), [p1.id, p0.id]);
  const after = markContributed(c, p1.id, "@JO");
  assert.deepEqual(unassistedPostsFor(after, "@jo").map((p) => p.id), [p0.id]);
  assert.deepEqual(unassistedPostsFor(c, "@brassdev").map((p) => p.id), [p2.id], "own posts are not owed");
  assert.deepEqual(unassistedPostsFor(c, ""), []);
});

test("postedCount: DISTINCT handles with an assist anywhere, not an assist count", () => {
  let c = ring();
  c = addPost(c, { author: "@jo", platform: "reddit", url: "https://reddit.com/r/a/comments/2/y/" });
  assert.equal(postedCount(c), 0);
  c = markContributed(c, c.posts[0].id, "@jo");
  c = markContributed(c, c.posts[1].id, "@JO");
  assert.equal(postedCount(c), 1, "same person on two posts counts once");
  c = markContributed(c, c.posts[1].id, "@brassdev");
  assert.equal(postedCount(c), 2);
  assert.equal(postedCount(legacy()), 1, "legacy posted members count via migration");
});

test("pendingMembers is deprecated; no ledger-style exports exist", () => {
  const names = Object.keys(campaignMod);
  for (const banned of ["assistCount", "totalAssists", "leaderboard", "streak", "ledger"]) {
    assert.ok(!names.includes(banned), banned);
  }
});

test("isLive / isUpcoming: null window means live and never upcoming", () => {
  const c = ring();
  assert.equal(c.window, null);
  assert.equal(isLive(c, NOW), true);
  assert.equal(isUpcoming(c, NOW), false);
});

// --- URL recognition ---

test("detectPlatform: hostname map, never throws", () => {
  const cases = {
    "https://x.com/a/status/1": "x", "https://twitter.com/a/status/1": "x", "https://mobile.twitter.com/a": "x",
    "https://bsky.app/profile/a/post/1": "bluesky",
    "https://threads.net/@a/post/1": "threads", "https://www.threads.com/@a": "threads",
    "https://www.reddit.com/r/a/comments/1/x/": "reddit", "https://old.reddit.com/r/a": "reddit",
    "https://www.instagram.com/p/ABC/": "instagram",
    "https://www.tiktok.com/@a/video/1": "tiktok", "https://vm.tiktok.com/abc": "tiktok",
    "https://www.youtube.com/watch?v=abc": "youtube", "https://youtu.be/abc": "youtube",
    "https://example.com/post": "other", "https://notx.com/a": "other", "https://x.com.evil.test/a": "other",
    "x.com/a/status/1": "x",
  };
  for (const [url, want] of Object.entries(cases)) assert.equal(detectPlatform(url), want, url);
  for (const junk of ["", "   ", "not a url", "javascript:alert(1)", "ftp://x.com/a", null, undefined, 42, {}]) {
    assert.equal(detectPlatform(junk), "other", String(junk));
  }
});

test("parsePostUrl: X author, Reddit title, YouTube/unknown platform only, invalid -> other", () => {
  assert.deepEqual(parsePostUrl("https://x.com/toonsouls/status/100"), { platform: "x", author: "@toonsouls" });
  assert.deepEqual(parsePostUrl("https://twitter.com/Wren_1/status/9?s=20"), { platform: "x", author: "@Wren_1" });
  assert.deepEqual(parsePostUrl("https://x.com/i/status/9"), { platform: "x" }, "no author in the path");
  assert.deepEqual(parsePostUrl("https://x.com/toonsouls"), { platform: "x" });
  assert.deepEqual(
    parsePostUrl("https://www.reddit.com/r/gamedev/comments/1abc123/toonsouls_devlog/"),
    { platform: "reddit", title: "toonsouls devlog" },
  );
  assert.equal(parsePostUrl("https://reddit.com/r/a/comments/1/my-cool-post-title").title, "my cool post title");
  assert.equal(parsePostUrl("https://reddit.com/r/a/comments/1/" + "w-".repeat(200)).title.length <= 120, true);
  assert.deepEqual(parsePostUrl("https://reddit.com/r/a/comments/1/"), { platform: "reddit" }, "no slug, no title");
  assert.deepEqual(parsePostUrl("https://www.youtube.com/watch?v=abc"), { platform: "youtube" });
  assert.deepEqual(parsePostUrl("https://youtu.be/abc"), { platform: "youtube" });
  assert.deepEqual(parsePostUrl("https://www.instagram.com/p/ABC123/"), { platform: "instagram" });
  assert.deepEqual(parsePostUrl("https://example.com/whatever"), { platform: "other" });
  for (const junk of ["", "nope", null, undefined, 7, "http://", "https://%zz"]) {
    assert.deepEqual(parsePostUrl(junk), { platform: "other" }, String(junk));
  }
  assert.equal(parsePostUrl("https://reddit.com/r/a/comments/1/%E0%A4%A/").platform, "reddit", "bad escapes do not throw");
});

test("URL recognition is pure: no network surface in campaign.mjs", () => {
  const src = readFileSync(new URL("../src/campaign.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|document\./);
});

// --- discovery / demo / atom / data ---

test("isListable is unchanged for v2 campaigns (game page + >= 2 members)", () => {
  assert.equal(isListable(ring()), true);
  assert.equal(isListable(createCampaign({ game, title: "T", anchorPost, creator })), false);
});

test("demo: v2 shape, Next Fest ring has two posts incl. a Reddit post by Wren with one assist", () => {
  const list = demoCampaigns(NOW);
  for (const c of list) {
    assert.deepEqual(validateCampaign(c), [], c.id);
    assert.ok(Array.isArray(c.posts) && c.posts.length >= 1);
    for (const m of c.members) assert.equal(m.status, undefined);
    assert.deepEqual(normalizeCampaign(c), c, "already normalized");
  }
  const fest = list[2];
  assert.equal(fest.posts.length, 2);
  const reddit = fest.posts[1];
  assert.equal(reddit.platform, "reddit");
  assert.equal(reddit.author, "Wren");
  assert.equal(reddit.assists.length, 1);
  assert.equal(latestPost(fest).id, reddit.id);
  assert.equal(list[0].posts.length, 1);
  assert.equal(postedCount(fest), 5);
});

test("data/campaigns.json: ToonSouls is the sustained example ring (spec section 7)", () => {
  const data = JSON.parse(readFileSync(new URL("../data/campaigns.json", import.meta.url), "utf8"));
  const c = data.campaigns.find((x) => x.id === "cmp_toon001");
  assert.deepEqual(validateCampaign(c), []);
  assert.equal(c.window, null);
  assert.equal(c.demo, true);
  assert.deepEqual(c.posts.map((p) => p.platform), ["x", "reddit", "instagram"]);
  assert.equal(c.posts[0].author, "@toonsouls");
  assert.equal(c.posts[1].url, "https://www.reddit.com/r/gamedev/comments/1abc123/toonsouls_devlog/");
  assert.equal(c.posts[2].url, "https://www.instagram.com/p/ABC123/");
  assert.equal(c.posts[2].author, "@mossfinch");
  assert.deepEqual(c.posts[0].assists.map((a) => a.handle), ["@mossfinch"]);
  assert.ok(c.posts[0].assists[0].url, "quote-post link on the X anchor");
  assert.deepEqual(c.posts[1].assists.map((a) => a.handle), ["@mossfinch"]);
  assert.ok(c.posts[1].assists[0].url, "share URL on the Reddit devlog");
  assert.deepEqual(c.posts[2].assists, []);
  assert.equal(isListable(c), true);
  assert.equal(latestPost(c).id, c.posts[2].id);
});

test("atom: summary describes the LATEST post, updated tracks latest activity", () => {
  const data = JSON.parse(readFileSync(new URL("../data/campaigns.json", import.meta.url), "utf8"));
  const c = data.campaigns.find((x) => x.id === "cmp_toon001");
  const entry = campaignToEntry(c, { linkFor: () => "https://e.test/#c=x", now: new Date("2026-11-23T18:00:00Z") });
  assert.match(entry, /Latest post — instagram @mossfinch: Boss fight clip/);
  assert.match(entry, /\(2h\)/);
  assert.match(entry, /<name>@mossfinch<\/name>/);
  assert.match(entry, /<updated>2026-11-23T16:00:00Z<\/updated>/);
  assert.match(entry, /1\/2 ringmates have contributed/);
  assert.doesNotMatch(entry, /launch-week|ToonSouls is out now/, "not the anchor text");
  const feed = readFileSync(new URL("../campaigns.atom", import.meta.url), "utf8");
  assert.match(feed, /Latest post — instagram @mossfinch/, "committed feed is regenerated");
});
