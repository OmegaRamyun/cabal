import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as G from "../src/gamify.mjs";
import { createCampaignChecklist, toggleCampaignChecklistItem, campaignChecklistItems } from "../src/checklist.mjs";

const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
};

const ANCHOR = "Our little farming game about haunted turnips launches Friday on Steam and we cannot wait";
const COPY = "Our little farming game about haunted turnips launches Friday on Steam and we cannot wait!!";
const OWN = "I spent two years making a tiny crop sim where the vegetables whisper back. Wishlist if that sounds like your kind of night.";

test("exported surface has no post-counting, streak, or ledger API", () => {
  for (const name of Object.keys(G)) {
    assert.doesNotMatch(name, /count(Posts|Engage)|streak|ledger|quota|leaderboard|rank|points|score(Board)?$|owed|turn/i, name);
  }
  assert.equal(G.countPosts, undefined);
  assert.equal(G.streak, undefined);
  assert.equal(G.ledger, undefined);
});

test("module source carries no ledger/quota language and reads no members", () => {
  const src = readFileSync(new URL("../src/gamify.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\b(owed|your turn|streak|ledger|leaderboard|quota)\b/i);
  assert.doesNotMatch(src, /\.members|markPosted|postedCount|fetch\(|XMLHttpRequest/);
});

test("journal sanitises junk input", () => {
  const j = G.createJournal({ pagesRead: [1], discovered: "x", title: "king", kindled: { a: { before: "x" } } });
  assert.deepEqual(j.pagesRead, {});
  assert.deepEqual(j.discovered, {});
  assert.deepEqual(j.kindled, {});
  assert.equal(j.title, G.DEFAULT_TITLE);
});

test("page and discovery milestones fire only on own actions; no double counting", () => {
  let j = G.createJournal();
  assert.deepEqual(G.milestonesReached(j), []);
  j = G.markPageRead(j, "p1");
  j = G.markPageRead(j, "p1");
  assert.deepEqual(G.milestonesReached(j, { pageIds: ["p1", "p2"] }), ["first-page"]);
  j = G.markPageRead(j, "p2");
  assert.ok(G.milestonesReached(j, { pageIds: ["p1", "p2"] }).includes("whole-primer"));
  for (const id of ["a", "a", "b"]) j = G.markDiscovered(j, id);
  assert.ok(!G.milestonesReached(j).includes("far-lanterns"));
  j = G.markDiscovered(j, "c");
  assert.ok(G.milestonesReached(j).includes("far-lanterns"));
});

test("whole-primer needs a nonempty page list", () => {
  assert.ok(!G.milestonesReached(G.createJournal(), { pageIds: [] }).includes("whole-primer"));
});

test("rest point only when the user's checklist is complete", () => {
  let cl = G.createJournal() && createCampaignChecklist("c1");
  let j = G.markRestPoint(G.createJournal(), "c1", cl);
  assert.deepEqual(j.restPoints, {});
  for (const it of campaignChecklistItems()) cl = toggleCampaignChecklistItem(cl, it.id, true);
  j = G.markRestPoint(j, "c1", cl);
  assert.deepEqual(Object.keys(j.restPoints), ["c1"]);
  assert.ok(G.milestonesReached(j).includes("rest-point"));
});

test("kindling: distinct rewrite counts, tiny tweak or gutting does not", () => {
  assert.equal(G.assessRevision(ANCHOR, COPY, OWN).kindled, true);
  assert.equal(G.assessRevision(ANCHOR, COPY, COPY + " ok").kindled, false);
  assert.equal(G.assessRevision(ANCHOR, COPY, "Hi").kindled, false);
  assert.equal(G.assessRevision(ANCHOR, OWN, "Another wholly different line about my crop sim, wishlist it please").kindled, false);
});

test("kindling: verifier gaming probes do not kindle", () => {
  // Trimming the flagged draft down to 5 words keeps every trigram.
  assert.equal(G.assessRevision(ANCHOR, COPY, "Our little farming game about").kindled, false);
  // Appending 5 nonsense words keeps most of the old trigrams.
  assert.equal(G.assessRevision(ANCHOR, COPY, COPY + " zzz qqq xxx vvv bbb").kindled, false);
  // An unrelated draft that was never flagged cannot kindle on hash noise
  // (old 0.3 floor sat below SimHash's ~0.50 random-pair baseline).
  assert.equal(G.assessRevision(ANCHOR, OWN, "a b c d e").kindled, false);
  // The genuine rewrite still kindles, with a real verdict transition.
  const r = G.assessRevision(ANCHOR, COPY, OWN);
  assert.equal(r.beforeVerdict, "warn");
  assert.equal(r.afterVerdict, "pass");
  assert.ok(r.kept <= G.KINDLE_MAX_KEPT);
  assert.equal(r.kindled, true);
});

test("kindling limit (documented): pure filler is indistinguishable from a rewrite", () => {
  // "a b c d e" shares nothing with the flagged draft or the anchor, so
  // every similarity check passes it. No local similarity test can tell
  // filler from a genuine from-scratch rewrite; the milestone is private
  // to this browser, so this only fools the user themself. Asserted here
  // so the limit stays visible instead of silently regressing.
  assert.equal(G.assessRevision(ANCHOR, COPY, "a b c d e").kindled, true);
});

test("record() tolerates a null payload", () => {
  const s = mem();
  assert.doesNotThrow(() => G.record("page", null, s));
  assert.doesNotThrow(() => G.record("revise", null, s));
});

function fakeTextarea() {
  const listeners = new Map();
  return {
    value: "",
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
    fire() { listeners.get("input")?.(); },
    get listenerCount() { return listeners.size; },
  };
}

test("trackRevision: flagged-then-reworked draft kindles once", () => {
  const s = mem();
  const ta = fakeTextarea();
  let kindledCalls = 0;
  const h = G.trackRevision(ta, { anchorText: ANCHOR, draftId: "d1", storage: s, onKindled: () => { kindledCalls += 1; } });
  ta.value = COPY;
  ta.fire();
  assert.deepEqual(G.loadJournal(s).kindled, {});
  ta.value = OWN;
  ta.fire();
  assert.ok(G.loadJournal(s).kindled.d1);
  assert.equal(kindledCalls, 1);
  // A second rework of the same draft re-kindles the assessment but the
  // journal already holds it, so onKindled does not fire again.
  ta.value = COPY;
  ta.fire();
  ta.value = OWN + " And a little more.";
  ta.fire();
  assert.equal(kindledCalls, 1);
  h.destroy();
  assert.equal(ta.listenerCount, 0);
});

test("trackRevision: never-flagged drafts and empty resets do not kindle", () => {
  const s = mem();
  const ta = fakeTextarea();
  G.trackRevision(ta, { anchorText: ANCHOR, draftId: "d2", storage: s });
  ta.value = OWN;
  ta.fire();
  assert.deepEqual(G.loadJournal(s).kindled, {});
  // Flagged, then emptied, then a fresh passing draft: no kindle.
  ta.value = COPY;
  ta.fire();
  ta.value = "";
  ta.fire();
  ta.value = OWN;
  ta.fire();
  assert.deepEqual(G.loadJournal(s).kindled, {});
});

test("trackRevision: no textarea is a safe no-op", () => {
  assert.doesNotThrow(() => G.trackRevision(null, { anchorText: ANCHOR, draftId: "d3" }));
  assert.doesNotThrow(() => G.trackRevision({}, { anchorText: ANCHOR, draftId: "d3" }));
});

test("kindling is advisory data: never throws, once per draft", () => {
  let r = G.kindleDraft(G.createJournal(), "d1", { anchor: ANCHOR, before: COPY, after: OWN });
  assert.ok(G.milestonesReached(r.journal).includes("kindled"));
  const first = r.journal.kindled.d1;
  r = G.kindleDraft(r.journal, "d1", { anchor: ANCHOR, before: COPY, after: OWN + " more words here" });
  assert.deepEqual(r.journal.kindled.d1, first);
  assert.doesNotThrow(() => G.kindleDraft(null, null, undefined));
});

test("titles are self-chosen and ungated; unknown ids ignored", () => {
  const j0 = G.createJournal();
  for (const t of G.TITLES) assert.equal(G.chooseTitle(j0, t.id).title, t.id);
  assert.equal(G.chooseTitle(j0, "emperor").title, G.DEFAULT_TITLE);
  assert.ok(G.TITLES.every((t) => !("requires" in t) && !("test" in t)));
});

test("progress reads only the journal and the page list", () => {
  const j = G.markPageRead(G.createJournal(), "p1");
  const p = G.computeProgress(j, { pageIds: ["p1", "p2", "p3"], campaigns: [{ members: [{ posted: true }] }] });
  assert.equal(p.pagesRead, 1);
  assert.equal(p.pagesTotal, 3);
});

test("record() persists to the user's own key and reports new milestones once", () => {
  const s = mem();
  let r = G.record("page", { pageId: "p1", pageIds: ["p1"] }, s);
  assert.deepEqual(r.newMilestones.sort(), ["first-page", "whole-primer"]);
  r = G.record("page", { pageId: "p1", pageIds: ["p1"] }, s);
  assert.deepEqual(r.newMilestones, []);
  assert.deepEqual([...s._m.keys()], [G.JOURNAL_KEY]);
  assert.ok(G.JOURNAL_KEY.startsWith("cabal.v2."));
  r = G.record("revise", { draftId: "d", anchor: ANCHOR, before: COPY, after: OWN }, s);
  assert.deepEqual(r.newMilestones, ["kindled"]);
  assert.equal(G.loadJournal(s).kindled.d.after < G.loadJournal(s).kindled.d.before, true);
});

test("record('rest') reads the campaign checklist from storage", () => {
  const s = mem();
  let cl = createCampaignChecklist("camp");
  for (const it of campaignChecklistItems()) cl = toggleCampaignChecklistItem(cl, it.id, true);
  s.setItem("cabal.v2.checklist.camp", JSON.stringify(cl));
  assert.deepEqual(G.record("rest", { campaignId: "camp" }, s).newMilestones, ["rest-point"]);
});

test("load/save survive corrupt storage and missing storage", () => {
  const s = mem();
  s.setItem(G.JOURNAL_KEY, "{not json");
  assert.deepEqual(G.loadJournal(s), G.createJournal());
  assert.doesNotThrow(() => G.saveJournal(G.createJournal(), { setItem() { throw new Error("full"); } }));
});
