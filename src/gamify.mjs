// V35 — Field journal: gamify the craft, not the ring.
// Everything here is about what one dev does alone: learning the theory,
// discovering campaigns, sharpening a draft, finishing the pre-post
// checklist. State is private to this browser (localStorage, cabal.v2.*).
// This module never reads another member's posts, never counts anyone's
// posts, and never rewards posting or engaging. The similarity gate stays
// advisory: it informs a milestone, it never refuses anything.

import { gate, sharedPhrases, trigrams } from "./similarity.mjs";
import { checklistKey, isCampaignChecklistReady } from "./checklist.mjs";

export const JOURNAL_KEY = "cabal.v2.journal";

// A revision counts as "kindled" when the revised draft sits at least this
// much further from the anchor than the earlier version did, measured by
// the similarity gate on the user's own drafts only.
export const KINDLE_MIN_GAIN = 0.1;
export const KINDLE_MIN_WORDS = 5;
// At most this much of the revised draft's trigrams may already have
// appeared in the earlier version. A deletion keeps (nearly) all of the
// old trigrams; a nonsense-append keeps most of them; a real rework does
// not. (Verifier fix: the old before-score floor of 0.3 sat below
// SimHash's ~0.50 random-pair noise floor, so unrelated drafts kindled
// on hash variance, and trimming a draft to 5 words kindled too.)
export const KINDLE_MAX_KEPT = 0.6;
export const DISCOVERY_MILESTONE = 3;
// Kindled drafts on this many DIFFERENT posts light "Steady Flame". A
// threshold on a boolean milestone, never a displayed count.
export const STEADY_FLAME_MILESTONE = 2;

/** Composite per-post journal key: `<campaignId>:<postId>`. */
export function postKey(campaignId, postId) {
  const c = String(campaignId ?? "").trim();
  const p = String(postId ?? "").trim();
  return c && p ? `${c}:${p}` : "";
}

// The ring's first-post keys, from ctx. Accepts an array of composite keys
// or an object map of key -> truthy. Absent ctx means "unknown", so no
// kindle can be proven to be on a later post.
function firstPostSet(ctx) {
  const src = ctx && ctx.firstPostIds;
  if (Array.isArray(src)) return new Set(src.map(String));
  if (src && typeof src === "object") return new Set(Object.keys(src).filter((k) => src[k]));
  return new Set();
}

// Self-chosen, cosmetic. Never gated by anything the user has done.
export const TITLES = Object.freeze([
  Object.freeze({ id: "unsworn", label: "The Unsworn" }),
  Object.freeze({ id: "ashen-scribe", label: "Ashen Scribe" }),
  Object.freeze({ id: "lamplighter", label: "Lamplighter" }),
  Object.freeze({ id: "hollow-cartographer", label: "Hollow Cartographer" }),
  Object.freeze({ id: "emberkeeper", label: "Emberkeeper" }),
  Object.freeze({ id: "wandering-smith", label: "Wandering Smith" }),
]);
const TITLE_IDS = new Set(TITLES.map((t) => t.id));
export const DEFAULT_TITLE = "unsworn";

// Milestones mark personal craft learning. `test(journal, ctx)` is pure.
export const MILESTONES = Object.freeze([
  Object.freeze({
    id: "first-page",
    label: "First Page Turned",
    note: "You read an intro page.",
    test: (j) => Object.keys(j.pagesRead).length >= 1,
  }),
  Object.freeze({
    id: "whole-primer",
    label: "The Primer, Entire",
    note: "You read every intro page.",
    test: (j, ctx) => {
      const ids = ctx.pageIds || [];
      return ids.length > 0 && ids.every((id) => j.pagesRead[id]);
    },
  }),
  Object.freeze({
    id: "first-light",
    label: "First Light",
    note: "You discovered a campaign.",
    test: (j) => Object.keys(j.discovered).length >= 1,
  }),
  Object.freeze({
    id: "far-lanterns",
    label: "Far Lanterns",
    note: `You discovered ${DISCOVERY_MILESTONE} different campaigns.`,
    test: (j) => Object.keys(j.discovered).length >= DISCOVERY_MILESTONE,
  }),
  Object.freeze({
    id: "kindled",
    label: "Kindled",
    note: "You reworked a draft until it stood further from the anchor.",
    test: (j) => Object.keys(j.kindled).length >= 1,
  }),
  Object.freeze({
    id: "rest-point",
    label: "Rest Point",
    note: "You finished the pre-post checklist for a post.",
    test: (j) => Object.keys(j.restPoints).length >= 1,
  }),
  Object.freeze({
    id: "second-wind",
    label: "Second Wind",
    note: "You reworked a draft on a post that was not the ring's first.",
    test: (j, ctx) => {
      const first = firstPostSet(ctx);
      if (first.size === 0) return false; // no ring context: cannot prove a later post
      return Object.keys(j.kindled).some((k) => k.includes(":") && !first.has(k));
    },
  }),
  Object.freeze({
    id: "pass-it-on",
    label: "Pass It On",
    note: "You passed a ringmate's post on to your own #Ring channel.",
    test: (j) => Object.keys(j.passedOn).length >= 1,
  }),
  Object.freeze({
    id: "steady-flame",
    label: "Steady Flame",
    note: "You reworked drafts on two different posts.",
    test: (j) => Object.keys(j.kindled).length >= STEADY_FLAME_MILESTONE,
  }),
]);

// ---- journal state (plain object; every function returns a new one) ----

const cleanId = (v) => String(v ?? "").trim().slice(0, 120);
const cleanSet = (src) => {
  const out = {};
  if (src && typeof src === "object" && !Array.isArray(src)) {
    for (const k of Object.keys(src)) {
      const id = cleanId(k);
      if (id && src[k]) out[id] = true;
    }
  }
  return out;
};

export function createJournal(initial = {}) {
  const s = initial && typeof initial === "object" ? initial : {};
  const kindled = {};
  if (s.kindled && typeof s.kindled === "object" && !Array.isArray(s.kindled)) {
    for (const k of Object.keys(s.kindled)) {
      const id = cleanId(k);
      const e = s.kindled[k];
      if (id && e && Number.isFinite(e.before) && Number.isFinite(e.after)) {
        kindled[id] = { before: e.before, after: e.after };
      }
    }
  }
  return {
    pagesRead: cleanSet(s.pagesRead),
    discovered: cleanSet(s.discovered),
    restPoints: cleanSet(s.restPoints),
    passedOn: cleanSet(s.passedOn),
    kindled,
    title: TITLE_IDS.has(s.title) ? s.title : DEFAULT_TITLE,
  };
}

export function markPageRead(journal, pageId) {
  const id = cleanId(pageId);
  const j = createJournal(journal);
  if (id) j.pagesRead[id] = true;
  return j;
}

export function markDiscovered(journal, campaignId) {
  const id = cleanId(campaignId);
  const j = createJournal(journal);
  if (id) j.discovered[id] = true;
  return j;
}

/**
 * A rest point is earned only when the user's own checklist is complete.
 * Per post: the key is `<campaignId>:<postId>`, so finishing one post's
 * checklist never lights another. A bare campaignId (no postId) keeps
 * the legacy per-campaign key. `checklist` is the state object from
 * checklist.mjs.
 */
export function markRestPoint(journal, campaignId, checklist, postId) {
  const id = postId ? postKey(campaignId, postId) : cleanId(campaignId);
  const j = createJournal(journal);
  if (id && checklist && isCampaignChecklistReady(checklist)) j.restPoints[id] = true;
  return j;
}

const wordCount = (t) => String(t ?? "").trim().split(/\s+/).filter(Boolean).length;

/**
 * Compare two versions of the user's OWN draft against the anchor text.
 * Advisory only: returns the scores, the verdicts, the kept-trigram
 * share, and whether the revision kindled. A revision kindles only when
 * the earlier draft was actually flagged (verdict review/warn), the
 * revised draft reads as its own words (verdict pass), the gate score
 * dropped, and the revision really reworked the text (kept share below
 * KINDLE_MAX_KEPT) — so deleting down or appending filler cannot kindle.
 * Honest limit: pure filler that shares nothing with either draft still
 * passes these checks, because no similarity test can tell a genuine
 * rewrite from unrelated filler. The milestone is private to this
 * browser, so gaming it only fools the user themself.
 */
export function assessRevision(anchorText, before, after) {
  const beforeRes = gate(String(before ?? ""), [String(anchorText ?? "")]);
  const afterRes = gate(String(after ?? ""), [String(anchorText ?? "")]);
  const afterGrams = trigrams(String(after ?? ""));
  const kept = afterGrams.size
    ? sharedPhrases(String(after ?? ""), String(before ?? "")).length / afterGrams.size
    : 0;
  const kindled =
    wordCount(after) >= KINDLE_MIN_WORDS &&
    beforeRes.verdict !== "pass" &&
    afterRes.verdict === "pass" &&
    beforeRes.score - afterRes.score >= KINDLE_MIN_GAIN &&
    kept <= KINDLE_MAX_KEPT;
  return {
    before: beforeRes.score,
    after: afterRes.score,
    beforeVerdict: beforeRes.verdict,
    afterVerdict: afterRes.verdict,
    kept,
    kindled,
  };
}

export function kindleDraft(journal, draftId, { anchor, before, after } = {}) {
  const id = cleanId(draftId);
  const j = createJournal(journal);
  const result = assessRevision(anchor, before, after);
  if (id && result.kindled && !j.kindled[id]) {
    j.kindled[id] = { before: result.before, after: result.after };
  }
  return { journal: j, result };
}

/**
 * "I passed a ringmate's post on" — self-reported, boolean, private. No
 * link, no count, no check: it only records that the user says they did.
 */
export function markPassedOn(journal, campaignId, postId) {
  const key = postKey(campaignId, postId);
  const j = createJournal(journal);
  if (key) j.passedOn[cleanId(key)] = true;
  return j;
}

export function chooseTitle(journal, titleId) {
  const j = createJournal(journal);
  if (TITLE_IDS.has(titleId)) j.title = titleId;
  return j;
}

/**
 * trackRevision(textarea, { anchorText, draftId, onKindled, storage }) —
 * watch one composer textarea for a flagged draft that gets genuinely
 * reworked. Remembers the first draft the gate flags; on each input,
 * assesses the current draft against it and records "revise" when it
 * kindles. Resets when the textarea is emptied (a fresh draft starts a
 * fresh watch) and after a kindle, so one draft kindles once. Advisory
 * only: it never touches the textarea's value and never blocks anything.
 * Returns { destroy() }.
 */
export function trackRevision(textarea, { anchorText, draftId, onKindled, storage, firstPostIds } = {}) {
  if (!textarea || typeof textarea.addEventListener !== "function") {
    return { destroy() {} };
  }
  let flagged = null;
  function onInput() {
    const current = textarea.value;
    if (!String(current ?? "").trim()) {
      flagged = null;
      return;
    }
    if (flagged === null) {
      const probe = gate(String(current), [String(anchorText ?? "")]);
      if (probe.verdict !== "pass") flagged = current;
      return;
    }
    const r = assessRevision(anchorText, flagged, current);
    if (r.kindled) {
      const recorded = record("revise", { draftId, anchor: anchorText, before: flagged, after: current, firstPostIds }, storage);
      flagged = null;
      // Fire only when the milestone is new — a later rework of the same
      // draft re-kindles the assessment but is already in the journal.
      if (typeof onKindled === "function" && recorded.newMilestones.includes("kindled")) {
        onKindled(recorded);
      }
    }
  }
  textarea.addEventListener("input", onInput);
  return {
    destroy() {
      if (typeof textarea.removeEventListener === "function") {
        textarea.removeEventListener("input", onInput);
      }
    },
  };
}

export function milestonesReached(journal, ctx = {}) {
  const j = createJournal(journal);
  return MILESTONES.filter((m) => m.test(j, ctx)).map((m) => m.id);
}

/** Learning progress for the panel: fixed sets only (pages in the primer). */
export function computeProgress(journal, ctx = {}) {
  const j = createJournal(journal);
  const pageIds = ctx.pageIds || [];
  return {
    pagesRead: pageIds.filter((id) => j.pagesRead[id]).length,
    pagesTotal: pageIds.length,
    milestones: milestonesReached(j, ctx),
    title: j.title,
  };
}

// ---- persistence (own key, own browser) ----

function resolveStorage(storage) {
  if (storage) return storage;
  try {
    const ls = globalThis.localStorage;
    if (ls && typeof ls.getItem === "function") return ls;
  } catch { /* no storage */ }
  return null;
}

export function loadJournal(storage) {
  const s = resolveStorage(storage);
  try {
    return createJournal(s ? JSON.parse(s.getItem(JOURNAL_KEY)) : null);
  } catch {
    return createJournal();
  }
}

export function saveJournal(journal, storage) {
  const s = resolveStorage(storage);
  try { if (s) s.setItem(JOURNAL_KEY, JSON.stringify(createJournal(journal))); } catch { /* ignore */ }
}

/**
 * Load the user's checklist state (own key only). With a postId this is
 * the per-post key (`cabal.v2.checklist.<campaignId>.<postId>`); without
 * one it is the legacy campaign key.
 */
export function loadCampaignChecklist(campaignId, storage, postId) {
  const s = resolveStorage(storage);
  try { return s ? JSON.parse(s.getItem(checklistKey(campaignId, postId))) : null; } catch { return null; }
}

/**
 * record(kind, payload, storage) — load, apply one of the user's own
 * craft actions, save. kinds: page, discover, rest, revise, passon.
 * rest / revise / passon are per post: payload carries { campaignId,
 * postId } (revise carries draftId = `<campaignId>:<postId>`).
 * Call sites: intro pages, discovery view, checklist, composer, feed.
 */
export function record(kind, payload = {}, storage) {
  if (payload == null) payload = {};
  let j = loadJournal(storage);
  const had = new Set(milestonesReached(j, payload));
  let result = null;
  if (kind === "page") j = markPageRead(j, payload.pageId);
  else if (kind === "discover") j = markDiscovered(j, payload.campaignId);
  else if (kind === "rest") {
    j = markRestPoint(
      j,
      payload.campaignId,
      payload.checklist ?? loadCampaignChecklist(payload.campaignId, storage, payload.postId),
      payload.postId
    );
  } else if (kind === "passon") j = markPassedOn(j, payload.campaignId, payload.postId);
  else if (kind === "revise") {
    const r = kindleDraft(j, payload.draftId, payload);
    j = r.journal;
    result = r.result;
  }
  saveJournal(j, storage);
  const fresh = milestonesReached(j, payload).filter((id) => !had.has(id));
  return { journal: j, newMilestones: fresh, result };
}

// ---- DOM (mount only; textContent and classNames, no network) ----

function el(doc, tag, text, cls) {
  const n = doc.createElement(tag);
  if (text != null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

/**
 * mount(rootEl, ctx) — the private field journal panel.
 * ctx: { storage?, pageIds?: string[] }
 */
export function mount(rootEl, ctx = {}) {
  const doc = rootEl.ownerDocument;
  const pageIds = ctx.pageIds || [];
  let journal = loadJournal(ctx.storage);

  const render = () => {
    rootEl.textContent = "";
    const prog = computeProgress(journal, { pageIds, firstPostIds: ctx.firstPostIds });
    const section = el(doc, "section", null, "cabal-journal");
    section.appendChild(el(doc, "h2", "Field journal", "journal-title"));
    section.appendChild(el(doc, "p", "Yours alone. Kept in this browser. Never shown to the ring.", "journal-note"));

    const titleRow = el(doc, "label", "Your title ", "journal-title-pick");
    const select = el(doc, "select", null, "journal-title-select");
    for (const t of TITLES) {
      const o = el(doc, "option", t.label);
      o.value = t.id;
      if (t.id === journal.title) o.selected = true;
      select.appendChild(o);
    }
    select.addEventListener("change", () => {
      journal = chooseTitle(journal, select.value);
      saveJournal(journal, ctx.storage);
      render();
    });
    titleRow.appendChild(select);
    section.appendChild(titleRow);

    if (prog.pagesTotal > 0) {
      const pct = Math.round((prog.pagesRead / prog.pagesTotal) * 100);
      section.appendChild(
        el(doc, "p", `Primer: ${prog.pagesRead} of ${prog.pagesTotal} pages read`, "journal-primer")
      );
      const meter = el(doc, "div", null, "ring-progress");
      meter.setAttribute("aria-hidden", "true");
      const fill = el(doc, "span", null, "ring-progress-fill");
      fill.style.width = `${pct}%`;
      meter.appendChild(fill);
      section.appendChild(meter);
    }

    const list = el(doc, "ul", null, "journal-milestones");
    for (const m of MILESTONES) {
      const done = prog.milestones.includes(m.id);
      const li = el(doc, "li", null, done ? "milestone reached" : "milestone dim");
      const sigil = el(doc, "span", done ? "◆" : "◇", "milestone-sigil");
      sigil.setAttribute("aria-hidden", "true");
      const body = el(doc, "span", null, "milestone-body");
      body.appendChild(el(doc, "span", m.label, "milestone-name"));
      body.appendChild(el(doc, "span", " " + m.note, "milestone-note"));
      li.appendChild(sigil);
      li.appendChild(body);
      list.appendChild(li);
    }
    section.appendChild(list);
    rootEl.appendChild(section);
  };

  render();
  return { refresh() { journal = loadJournal(ctx.storage); render(); } };
}
