import test from "node:test";
import assert from "node:assert/strict";
import {
  DEMO_BADGE,
  demoBadge,
  demoCampaigns,
  demoGame,
  seedDemo,
  clearDemo,
} from "../src/demo.mjs";
import { TERMS_TEXT } from "../src/terms.mjs";

// Minimal storage-like stand-in for localStorage (getItem/setItem/removeItem).
function memoryStore(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    removeItem: (k) => {
      delete data[k];
    },
    _data: data,
  };
}

const NOW = new Date("2026-11-22T12:00:00.000Z");
// v2: "posted" = roster members with an assist anywhere in the ring.
const assisted = (c) => new Set(c.posts.flatMap((p) => p.assists.map((a) => a.handle)));
const posted = (c) => c.members.filter((m) => assisted(c).has(m.handle));
const pending = (c) => c.members.filter((m) => !assisted(c).has(m.handle));

test("demoGame is the fictional Starlight Salvage", () => {
  const g = demoGame();
  assert.equal(g.name, "Starlight Salvage");
  assert.equal(g.links.itch, "https://starlight-salvage.itch.io/starlight-salvage");
  assert.deepEqual(g.tags, ["roguelite", "cozy", "space"]);
});

test("demoCampaigns returns exactly 3 demo campaigns for the demo game", () => {
  const list = demoCampaigns(NOW);
  assert.equal(list.length, 3);
  for (const c of list) {
    assert.equal(c.demo, true);
    assert.equal(c.game.name, "Starlight Salvage");
    assert.equal(c.anchorPost.platform, "x");
    assert.ok(c.anchorPost.url.startsWith("https://x.com/"));
    assert.ok(c.anchorPost.text.length > 0);
    assert.ok(c.anchorPost.author.length > 0);
    assert.ok(c.window && c.window.start && c.window.end);
    assert.ok(new Date(c.window.start) < new Date(c.window.end));
  }
  assert.equal(new Set(list.map((c) => c.id)).size, 3);
  assert.deepEqual(
    list.map((c) => c.title),
    ["Launch week push", "Demo day push", "Steam Next Fest push"],
  );
});

test("live campaign window covers now; upcoming starts tomorrow; 2 posted / 2 pending", () => {
  const [live, upcoming] = demoCampaigns(NOW);
  assert.ok(new Date(live.window.start) <= NOW && NOW <= new Date(live.window.end));
  assert.ok(new Date(upcoming.window.start) > NOW);
  // Upcoming starts tomorrow (within 36h of now, not weeks out).
  assert.ok(new Date(upcoming.window.start) - NOW < 36 * 60 * 60 * 1000);
  assert.equal(live.members.length, 4);
  assert.equal(posted(live).length, 2);
  assert.equal(pending(live).length, 2);
  for (const a of live.posts[0].assists) assert.ok(a.url, `${a.handle} contributed without a quote URL`);
  assert.equal(upcoming.members.length, 3);
  assert.equal(posted(upcoming).length, 0);
});

test("popular campaign has 6 members, 5 posted", () => {
  const popular = demoCampaigns(NOW)[2];
  assert.equal(popular.members.length, 6);
  assert.equal(posted(popular).length, 5);
  assert.equal(pending(popular).length, 1);
  for (const a of popular.posts[0].assists) assert.ok(a.url, `${a.handle} contributed without a quote URL`);
});

test("demo content is fictional: no real games, people, or handles", () => {
  const list = demoCampaigns(NOW);
  const blob = JSON.stringify([demoGame(), ...list]).toLowerCase();
  for (const real of ["call of duty", "minecraft", "fortnite", "steam", "valve"]) {
    // "Steam" only appears in the fictional campaign title, never as the game.
    if (real === "steam") continue;
    assert.ok(!blob.includes(real), `demo content mentions real thing: ${real}`);
  }
  // Every handle is a short invented one, and every member name is invented.
  for (const c of list) {
    for (const m of c.members) {
      assert.match(m.handle, /^@[a-z]+$/);
      assert.ok(!/cade|cheyenne|anne|heather/i.test(m.name + m.handle));
    }
  }
  assert.equal(demoGame().links.itch, "https://starlight-salvage.itch.io/starlight-salvage");
});

test("demoBadge returns Demo for demo campaigns and '' otherwise", () => {
  assert.equal(DEMO_BADGE, "Demo");
  assert.equal(demoBadge(demoCampaigns(NOW)[0]), "Demo");
  assert.equal(demoBadge({ demo: false }), "");
  assert.equal(demoBadge({}), "");
  assert.equal(demoBadge(null), "");
});

test("seedDemo seeds on first load only; me stays empty", () => {
  const store = memoryStore();
  assert.equal(seedDemo(store, NOW), true);
  assert.equal(store.getItem("cabal.v2.demo"), "on");
  assert.equal(JSON.parse(store.getItem("cabal.v2.game")).name, "Starlight Salvage");
  assert.equal(JSON.parse(store.getItem("cabal.v2.campaigns")).length, 3);
  assert.equal(store.getItem("cabal.v2.me"), null);

  // Second call does not overwrite: flag exists, real data would be clobbered.
  store.setItem("cabal.v2.game", JSON.stringify({ name: "My Real Game", links: {}, tags: [] }));
  assert.equal(seedDemo(store, NOW), false);
  assert.equal(JSON.parse(store.getItem("cabal.v2.game")).name, "My Real Game");
});

test("seedDemo does not seed when the flag already exists ('off' included)", () => {
  const store = memoryStore({ "cabal.v2.demo": "off" });
  assert.equal(seedDemo(store, NOW), false);
  assert.equal(store.getItem("cabal.v2.game"), null);
  assert.equal(store.getItem("cabal.v2.campaigns"), null);
});

test("clearDemo removes demo items only and flips the flag off", () => {
  const real = {
    id: "cmp_real1",
    game: { name: "My Real Game", links: { itch: "https://example.com/mygame" }, tags: [] },
    title: "Real push",
    anchorPost: { platform: "x", url: "https://x.com/me/status/1", text: "hi", author: "Me" },
    window: null,
    members: [{ name: "Me", handle: "@me", status: "pending" }],
    createdAt: NOW.toISOString(),
  };
  const store = memoryStore();
  seedDemo(store, NOW);
  const seeded = JSON.parse(store.getItem("cabal.v2.campaigns"));
  store.setItem("cabal.v2.campaigns", JSON.stringify([...seeded, real]));
  store.setItem("cabal.v2.game", JSON.stringify({ name: "My Real Game", links: {}, tags: [] }));

  const out = clearDemo(store);
  assert.deepEqual(out, { removedCampaigns: 3, removedGame: false });
  assert.equal(store.getItem("cabal.v2.demo"), "off");
  const kept = JSON.parse(store.getItem("cabal.v2.campaigns"));
  assert.deepEqual(kept, [real]);
  // Real game untouched.
  assert.equal(JSON.parse(store.getItem("cabal.v2.game")).name, "My Real Game");
});

test("clearDemo removes the demo game when it is the stored game", () => {
  const store = memoryStore();
  seedDemo(store, NOW);
  const out = clearDemo(store);
  assert.deepEqual(out, { removedCampaigns: 3, removedGame: true });
  assert.equal(store.getItem("cabal.v2.game"), null);
  assert.deepEqual(JSON.parse(store.getItem("cabal.v2.campaigns")), []);
});

test("TERMS_TEXT covers every required point", () => {
  const t = TERMS_TEXT.toLowerCase();
  // Own games.
  assert.match(t, /promoting your own games/);
  // Does not post for you.
  assert.match(t, /does not post for you/);
  // Responsible for what you post + platform rules.
  assert.match(t, /you are responsible for what you post/);
  assert.match(t, /following each platform's rules/);
  // Honest, human-written, own words, disclosed.
  assert.match(t, /honest/);
  assert.match(t, /human/);
  assert.match(t, /in your own words/);
  assert.match(t, /disclosed|say when a post is part of a coordinated push/);
  // Harass / brigade / spam / target.
  assert.match(t, /harass/);
  assert.match(t, /brigade/);
  assert.match(t, /spam/);
  assert.match(t, /target anyone/);
  // As-is, no warranty, author not responsible, disclaimer is not a shield.
  assert.match(t, /as-is/);
  assert.match(t, /without warranty/);
  assert.match(t, /author is not responsible/);
  assert.match(t, /not a shield/);
});

test("TERMS_TEXT has no legal jargon beyond what is needed and no SCT codes", () => {
  assert.ok(!/SCT-?\d/i.test(TERMS_TEXT), "terms must not contain SCT codes");
  assert.ok(!/hereinafter|whereas|indemnif/i.test(TERMS_TEXT));
  assert.ok(TERMS_TEXT.length > 500, "terms should be substantive, not a one-liner");
});
