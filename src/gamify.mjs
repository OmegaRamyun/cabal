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
    note: "You finished the pre-post checklist for a campaign.",
    test: (j) => Object.keys(j.restPoints).length >= 1,
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
 * A rest point is earned only when the user's own checklist for that
 * campaign is complete. `checklist` is the state object from checklist.mjs.
 */
export function markRestPoint(journal, campaignId, checklist) {
  const id = cleanId(campaignId);
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

export function chooseTitle(journal, titleId) {
  const j = createJournal(journal);
  if (TITLE_IDS.has(titleId)) j.title = titleId;
  return j;
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

/** Load the user's checklist state for one campaign (own key only). */
export function loadCampaignChecklist(campaignId, storage) {
  const s = resolveStorage(storage);
  try { return s ? JSON.parse(s.getItem(checklistKey(campaignId))) : null; } catch { return null; }
}

/**
 * record(kind, payload, storage) — load, apply one of the user's own
 * craft actions, save. kinds: page, discover, rest, revise.
 * Call sites: intro pages, discovery view, checklist, composer.
 */
export function record(kind, payload = {}, storage) {
  if (payload == null) payload = {};
  let j = loadJournal(storage);
  const had = new Set(milestonesReached(j, payload));
  let result = null;
  if (kind === "page") j = markPageRead(j, payload.pageId);
  else if (kind === "discover") j = markDiscovered(j, payload.campaignId);
  else if (kind === "rest") {
    j = markRestPoint(j, payload.campaignId, payload.checklist ?? loadCampaignChecklist(payload.campaignId, storage));
  } else if (kind === "revise") {
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
    const prog = computeProgress(journal, { pageIds });
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
      section.appendChild(
        el(doc, "p", `Primer: ${prog.pagesRead} of ${prog.pagesTotal} pages read`, "journal-primer")
      );
    }

    const list = el(doc, "ul", null, "journal-milestones");
    for (const m of MILESTONES) {
      const done = prog.milestones.includes(m.id);
      const li = el(doc, "li", null, done ? "milestone reached" : "milestone dim");
      li.appendChild(el(doc, "span", m.label, "milestone-name"));
      li.appendChild(el(doc, "span", " " + m.note, "milestone-note"));
      list.appendChild(li);
    }
    section.appendChild(list);
    rootEl.appendChild(section);
  };

  render();
  return { refresh() { journal = loadJournal(ctx.storage); render(); } };
}
