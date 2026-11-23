import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as G from "../src/gamify.mjs";
import { INTRO_PAGES, getIntroPage, introPageIds, introPageIdForRoute } from "../src/intro.mjs";

const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
};
const ANCHOR = "Our little farming game about haunted turnips launches Friday on Steam and we cannot wait";
const COPY = "Our little farming game about haunted turnips launches Friday on Steam and we cannot wait!!";
const OWN = "I spent two years making a tiny crop sim where the vegetables whisper back. Wishlist if that sounds like your kind of night.";

const FIRST = ["cmp_a:pst_first"]; // ring's first-post key
const kindle = (j, key) => G.kindleDraft(j, key, { anchor: ANCHOR, before: COPY, after: OWN }).journal;
const reached = (j, ctx = { firstPostIds: FIRST }) => G.milestonesReached(j, ctx);

// ---- journal ----

test("journal has a sanitised passedOn set", () => {
  assert.deepEqual(G.createJournal().passedOn, {});
  assert.deepEqual(G.createJournal({ passedOn: [1] }).passedOn, {});
  assert.deepEqual(G.createJournal({ passedOn: { "c:p": true, x: false } }).passedOn, { "c:p": true });
});

test("Second Wind: kindling a later post earns it; the first post does not", () => {
  const onFirst = kindle(G.createJournal(), "cmp_a:pst_first");
  assert.ok(reached(onFirst).includes("kindled"));
  assert.ok(!reached(onFirst).includes("second-wind"));
  const onLater = kindle(G.createJournal(), "cmp_a:pst_second");
  assert.ok(reached(onLater).includes("second-wind"));
  // without ring context nothing can be proven to be a later post
  assert.ok(!G.milestonesReached(onLater, {}).includes("second-wind"));
  // legacy draft ids (no postId) never earn it
  assert.ok(!reached(kindle(G.createJournal(), "legacy-draft")).includes("second-wind"));
});

test("Steady Flame: two different posts, never the same post twice", () => {
  let j = kindle(G.createJournal(), "cmp_a:pst_first");
  assert.ok(!reached(j).includes("steady-flame"));
  j = kindle(j, "cmp_a:pst_first");
  assert.ok(!reached(j).includes("steady-flame"));
  j = kindle(j, "cmp_a:pst_second");
  assert.ok(reached(j).includes("steady-flame"));
});

test("Pass It On: only the passon record earns it, per post, privately", () => {
  const s = mem();
  assert.ok(!G.milestonesReached(G.createJournal()).includes("pass-it-on"));
  assert.deepEqual(G.record("passon", { campaignId: "", postId: "p" }, s).newMilestones, []);
  const r = G.record("passon", { campaignId: "cmp_a", postId: "pst_x" }, s);
  assert.deepEqual(r.newMilestones, ["pass-it-on"]);
  assert.deepEqual(Object.keys(r.journal.passedOn), ["cmp_a:pst_x"]);
  assert.deepEqual(G.record("passon", { campaignId: "cmp_a", postId: "pst_x" }, s).newMilestones, []);
  assert.deepEqual(Object.keys(G.loadJournal(s).passedOn), ["cmp_a:pst_x"]);
});

test("rest point is per post: one post's checklist does not light another", async () => {
  const { createCampaignChecklist, toggleCampaignChecklistItem, campaignChecklistItems } = await import("../src/checklist.mjs");
  let cl = createCampaignChecklist("cmp_a");
  for (const it of campaignChecklistItems()) cl = toggleCampaignChecklistItem(cl, it.id, true);
  let j = G.markRestPoint(G.createJournal(), "cmp_a", cl, "pst_one");
  assert.deepEqual(Object.keys(j.restPoints), ["cmp_a:pst_one"]);
  assert.ok(reached(j).includes("rest-point"));
  assert.equal(j.restPoints["cmp_a:pst_two"], undefined);
  // incomplete checklist for another post earns nothing
  const j2 = G.markRestPoint(G.createJournal(), "cmp_a", createCampaignChecklist("cmp_a"), "pst_two");
  assert.deepEqual(j2.restPoints, {});
  // record("rest") with an explicit checklist and postId
  const r = G.record("rest", { campaignId: "cmp_a", postId: "pst_one", checklist: cl }, mem());
  assert.deepEqual(r.newMilestones, ["rest-point"]);
});

test("record('revise') with draftId and firstPostIds reports new milestones", () => {
  const r = G.record("revise", { draftId: "cmp_a:pst_second", anchor: ANCHOR, before: COPY, after: OWN, firstPostIds: FIRST }, mem());
  assert.ok(r.newMilestones.includes("kindled"));
  assert.ok(r.newMilestones.includes("second-wind"));
});

test("milestones stay boolean: no counts, streaks, or ledgers in the surface", () => {
  for (const m of G.MILESTONES) assert.equal(typeof m.test(G.createJournal(), {}), "boolean", m.id);
  for (const name of Object.keys(G)) {
    assert.doesNotMatch(name, /count(Posts|Engage)|streak|ledger|quota|leaderboard|rank|points|owed/i, name);
  }
  const src = readFileSync(new URL("../src/gamify.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\b(owed|your turn|streak|ledger|leaderboard|quota)\b/i);
});

// ---- intro ----

const text = (p) => [p.title, p.lede, ...p.sections.flatMap((s) => [s.heading, ...s.paragraphs])].join("\n");
const all = () => INTRO_PAGES.map(text).join("\n");

test("route ids and mount contract survive", () => {
  assert.deepEqual(introPageIds(), ["intro", "how", "theory"]);
  assert.deepEqual(["#/intro", "#/intro/how", "#/intro/theory"].map(introPageIdForRoute), ["intro", "how", "theory"]);
});

test("how page: the five-part ongoing rhythm", () => {
  const how = getIntroPage("how");
  const steps = how.sections.filter((s) => /^\d\./.test(s.heading));
  assert.equal(steps.length, 5);
  assert.match(steps[0].heading, /Start or join a ring/);
  assert.match(steps[1].heading, /Add posts/);
  assert.match(steps[2].heading, /Assist/);
  assert.match(steps[3].heading, /Pass it on/);
  assert.match(steps[4].heading, /Keep the ring warm/);
  assert.match(steps[1].paragraphs.join(" "), /by hand/);
  assert.match(steps[2].paragraphs.join(" "), /Enscryption/);
  assert.match(steps[2].paragraphs.join(" "), /Liked\. Retweeted\. Commented\. Shared to #Ring\./);
  assert.match(steps[2].paragraphs.join(" "), /not a score/);
  assert.match(steps[3].paragraphs.join(" "), /#Ring channel/);
  assert.match(steps[4].paragraphs.join(" "), /resting ring, not a dead one/);
});

test("no fixed-window, 'five/six steps', or merge-on-open-primary copy remains", () => {
  const t = all();
  assert.doesNotMatch(t, /five steps|six steps/i);
  // "no window" / "no deadline" is the point; any other window talk is the old model.
  assert.doesNotMatch(t.replace(/no window and no deadline|has no window|no window/gi, ""), /\bwindow\b/i);
  assert.doesNotMatch(t, /does not update one you already have/i);
  assert.doesNotMatch(t, /Merging an updated link/i);
  assert.doesNotMatch(t, /no live updating/i);
  assert.doesNotMatch(t, /one push|one post you want amplified/i);
  assert.match(getIntroPage("how").lede, /rhythm/i);
});

test("theory: compounding, per post, two tiers, open-ended, pass-it-on is the core loop", () => {
  const th = getIntroPage("theory");
  const h = th.sections.map((s) => s.heading).join("\n");
  assert.match(h, /compounds/i);
  assert.match(h, /Same campaign, different post/);
  assert.match(h, /Two tiers/);
  assert.match(h, /Open-ended/);
  const core = th.sections.find((s) => /Pass it on.*core loop/i.test(s.heading));
  assert.ok(core);
  assert.match(core.paragraphs.join(" "), /copies a post's link and shares it onward/);
  assert.match(core.paragraphs.join(" "), /#Ring channel/);
  assert.match(core.paragraphs.join(" "), /No one counts shares/);
  // pass-it-on comes before the open-ended section, not after as an afterthought
  const idx = (re) => th.sections.findIndex((s) => re.test(s.heading));
  assert.ok(idx(/Pass it on/) < idx(/Anchored/));
});

test("theory: Nostr-framed sync honesty with the privacy reality in plain words", () => {
  const sync = getIntroPage("theory").sections.find((s) => /sync/i.test(s.heading));
  assert.ok(sync);
  const t = sync.paragraphs.join(" ");
  assert.match(t, /public relays/);
  assert.match(t, /offline fallback/);
  assert.match(t, /snapshot/);
  assert.match(t, /anything on a public relay is public/i);
  assert.match(t, /cannot be reliably deleted/);
});

test("what page: a ring that keeps going; founding post is the start", () => {
  const t = text(getIntroPage("intro"));
  assert.match(t, /A ring that keeps going/);
  assert.match(t, /founding post is the start/);
  assert.doesNotMatch(t, /one-push|one push/i);
});

test("copy respects the hard don'ts and the do-not-cite list", () => {
  const t = all();
  for (const bad of [
    /47-campaign/i, /27%/, /26%/, /5,190/, /65%/, /84.99%/, /10 cross-promo/i,
    /mech-shooter/i, /curator bans/i, /\bSCT[-\s]?\d/i, /20\.0/, /share_via_copy_link/,
    /streak/i, /leaderboard/i, /threads/i,
  ]) assert.doesNotMatch(t, bad, String(bad));
  assert.match(t, /32%/);
  assert.match(t, /\$53,088/);
});
