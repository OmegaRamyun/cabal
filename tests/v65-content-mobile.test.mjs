// V65 (+V66, +V68, +V69) acceptance tests:
// - V65: <=60-word 3-step onboarding card, Theory out of onboarding, Ring copy, tags intact
// - V66: Field Journal hidden until first assist
// - V68(a): Breadcrumb per-page title in src/nav.mjs
// - V68(b): Prefilled editable Disclosure reminder replacing /disclos/i regex
// - V69: Post format creation gated to 2+ dev rings + renamed
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  ONBOARDING_CARD,
  THEORY_DOCS_ROUTE,
  INTRO_PAGES,
  countWords,
  onboardingCardWordCount,
  isReferencePage,
  getIntroPage,
  introPageIdForRoute,
  mount as mountIntro,
} from "../src/intro.mjs";
import {
  createJournal,
  markPageRead,
  markDiscovered,
  markFirstAssist,
  shouldShowJournal,
  record,
  mount as mountJournal,
} from "../src/gamify.mjs";
import { backTargetForRoute } from "../src/nav.mjs";
import {
  DEFAULT_DISCLOSURE_REMINDER,
  MIN_DEVS_FOR_FORMAT,
  CREATE_TEMPLATE_COPY,
  canCreateFormat,
  buildFormatFromForm,
  mount as mountFormat,
  mountCreate,
} from "../src/campaign-formats.mjs";

// ---- minimal fake DOM ----
class FakeEl {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attrs = {};
    this.className = "";
    this._text = "";
    this._l = {};
    this.value = "";
    this.hidden = false;
    this.style = {};
    this.href = "";
  }
  get textContent() {
    return this._text + this.children.map((c) => c.textContent).join(" ");
  }
  set textContent(v) {
    this._text = v ?? "";
    this.children = [];
  }
  appendChild(c) {
    this.children.push(c);
    return c;
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k === "href") this.href = String(v);
  }
  addEventListener(t, f) {
    (this._l[t] ||= []).push(f);
  }
  fire(t) {
    for (const f of this._l[t] || []) f({ preventDefault() {} });
  }
  all(tag, out = []) {
    for (const c of this.children) {
      if (c.tagName === tag.toUpperCase()) out.push(c);
      c.all(tag, out);
    }
    return out;
  }
}

const freshRoot = () => {
  const r = new FakeEl("div");
  r.ownerDocument = { createElement: (t) => new FakeEl(t) };
  return r;
};

const memStorage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};

describe("V65 — 3-step onboarding card, Theory in reference, Ring copy, tags intact", () => {
  test("onboarding card copy is verbatim and <= 60 words", () => {
    assert.equal(
      ONBOARDING_CARD.lede,
      "Small rings of indie devs boost each other's posts in their own words — no accounts, no auto-posting.",
    );
    assert.equal(
      ONBOARDING_CARD.steps,
      "1. Start or join a ring → 2. Drop your post link → 3. Boost in your own words",
    );
    assert.equal(ONBOARDING_CARD.ctaLabel, "Start my ring");
    assert.ok(onboardingCardWordCount() <= 60, `expected <=60 words, got ${onboardingCardWordCount()}`);
    assert.ok(countWords(ONBOARDING_CARD.lede + " " + ONBOARDING_CARD.steps) <= 60);
  });

  test("mount('intro') renders one 3-step card with Start my ring CTA and no Theory link", () => {
    const root = freshRoot();
    mountIntro(root, "intro");
    assert.ok(root.textContent.includes(ONBOARDING_CARD.lede));
    assert.ok(root.textContent.includes(ONBOARDING_CARD.steps));
    const links = root.all("a");
    assert.equal(links.length, 1);
    assert.equal(links[0].textContent, "Start my ring");
    assert.equal(links[0].attrs.href, "#/rings");
    assert.ok(!links.some((a) => (a.attrs.href || "").includes("theory")));
  });

  test("Theory remains reachable as reference material and supports Tools/Docs route", () => {
    const theory = getIntroPage("theory");
    assert.ok(theory);
    assert.equal(isReferencePage("theory"), true);
    assert.equal(isReferencePage("intro"), false);
    assert.equal(introPageIdForRoute("#/intro/theory"), "theory");
    assert.equal(introPageIdForRoute(THEORY_DOCS_ROUTE), "theory");
    const theoryText = theory.sections.flatMap((s) => s.paragraphs).join(" ");
    assert.match(theoryText, /32%/);
    assert.match(theoryText, /17%/);
    assert.match(theoryText, /\$53,088/);
  });

  test("Ring copy standardization drops 'Rings and Campaigns' pileup and keeps tag hooks", () => {
    const allIntroText = INTRO_PAGES.map((p) =>
      [p.title, p.lede, ...p.sections.flatMap((s) => [s.heading, ...s.paragraphs])].join(" "),
    ).join("\n");
    assert.doesNotMatch(allIntroText, /Rings and Campaigns/i);
    assert.equal(getIntroPage("how").title, "How rings work");
    const howText = getIntroPage("how").sections.flatMap((s) => s.paragraphs).join(" ");
    assert.match(howText, /tags/i, "tag/discoverability hooks must stay");
  });
});

describe("V66 — Field Journal hidden until first assist", () => {
  const realRingWithAssist = {
    id: "cmp_real1",
    posts: [{ id: "pst_1", assists: [{ handle: "@Ada", status: "contributed" }] }],
  };
  const demoRingWithAssist = {
    id: "cmp_demo1",
    demo: true,
    posts: [{ id: "pst_1", assists: [{ handle: "@ada", status: "contributed" }] }],
  };

  test("hidden on first-run, ringless, and read-only states", () => {
    let j = createJournal();
    assert.equal(shouldShowJournal(j), false);
    j = markPageRead(j, "intro");
    j = markDiscovered(j, "cmp_1");
    assert.equal(shouldShowJournal(j), false);
    assert.equal(shouldShowJournal(j, { campaigns: [demoRingWithAssist], me: { handle: "@ada" } }), false);
  });

  test("shown after first assist via journal flag, record('assist'), or real ring assist", () => {
    const j = markFirstAssist(createJournal());
    assert.equal(shouldShowJournal(j), true);

    const st = memStorage();
    const rec = record("assist", {}, st);
    assert.equal(rec.journal.firstAssist, true);
    assert.equal(shouldShowJournal(rec.journal), true);

    assert.equal(
      shouldShowJournal(createJournal(), { campaigns: [realRingWithAssist], me: { handle: "ada" } }),
      true,
    );
    assert.equal(shouldShowJournal(createJournal(), { forceShow: true }), true);
  });

  test("mount() renders nothing before first assist and renders after record('assist')", () => {
    const st = memStorage();
    const root = freshRoot();
    const handle = mountJournal(root, { storage: st, pageIds: ["intro"] });
    assert.equal(root.hidden, true);
    assert.equal(root.children.length, 0);
    assert.equal(root.textContent, "");

    record("assist", {}, st);
    handle.refresh();
    assert.equal(root.hidden, false);
    assert.ok(root.textContent.includes("Field journal"));
  });
});

describe("V68(a) — Breadcrumb shows each intro page's own title", () => {
  test("each intro page resolves its own breadcrumb title instead of defaulting to 'What Cabal is'", () => {
    const introTarget = backTargetForRoute({ view: "intro", pageId: "intro" });
    const howTarget = backTargetForRoute({ view: "intro", pageId: "how" });
    const theoryTarget = backTargetForRoute({ view: "intro", pageId: "theory" });

    assert.equal(introTarget.title, "How rings work");
    assert.equal(howTarget.title, "How rings work");
    assert.equal(theoryTarget.title, "The theory");
    assert.equal(theoryTarget.href, "#/tools");
    assert.equal(theoryTarget.label, "Tools");

    for (const t of [introTarget, howTarget, theoryTarget]) {
      assert.notEqual(t.title, "What Cabal is");
    }

    const custom = backTargetForRoute({ view: "intro", pageId: "theory" }, { title: "Custom" });
    assert.equal(custom.title, "Custom");

    const newFmt = backTargetForRoute({ view: "campaigns-new" });
    assert.equal(newFmt.title, "New post format");
  });
});

describe("V68(b) — Prefilled editable Disclosure reminder replaces /disclos/i regex", () => {
  test("prefill constant is verbatim and valid guidance without 'disclos' is accepted", () => {
    assert.equal(DEFAULT_DISCLOSURE_REMINDER, "Mention you're posting with your dev ring.");
    const res = buildFormatFromForm({
      tagline: "Weekly clip",
      description: "One short clip per week.",
      howTo: "Post one clip and say what changed this week.",
      disclosure: "Say you're posting with your dev ring.",
      tags: "devlog, clips",
    });
    assert.equal(res.ok, true);
    assert.equal(res.format.disclosure, "Say you're posting with your dev ring.");
    assert.deepEqual(res.format.tags, ["devlog", "clips"]);
  });

  test("omitted disclosure defaults to prefill; explicitly emptied disclosure is rejected", () => {
    const defaulted = buildFormatFromForm({
      tagline: "Weekly clip",
      description: "One short clip per week.",
      howTo: "Post one clip.",
    });
    assert.equal(defaulted.ok, true);
    assert.equal(defaulted.format.disclosure, DEFAULT_DISCLOSURE_REMINDER);

    const emptied = buildFormatFromForm({
      tagline: "Weekly clip",
      description: "One short clip per week.",
      howTo: "Post one clip.",
      disclosure: "   ",
    });
    assert.equal(emptied.ok, false);
    assert.ok(emptied.errors.disclosure);
  });

  test("mountCreate prefills Disclosure reminder, keeps Tags, and ships creator edits", () => {
    const root = freshRoot();
    let created = null;
    mountCreate(root, { onCreate: (f) => { created = f; } });
    const inputs = root.all("input").concat(root.all("textarea"));
    const byName = (n) => inputs.find((i) => i.name === n);

    assert.ok(byName("tags"), "tags field stays");
    assert.equal(byName("disclosure").value, DEFAULT_DISCLOSURE_REMINDER);

    byName("tagline").value = "Friday build";
    byName("description").value = "Share a Friday screenshot.";
    byName("howTo").value = "Post one screenshot and explain what broke.";
    byName("disclosure").value = "Note that you're boosting with your indie ring.";
    byName("tags").value = "screenshots, cozy";
    root.all("form")[0].fire("submit");

    assert.ok(created);
    assert.equal(created.disclosure, "Note that you're boosting with your indie ring.");
    assert.deepEqual(created.tags, ["screenshots", "cozy"]);

    const detailRoot = freshRoot();
    mountFormat(detailRoot, { format: created, rings: [] });
    assert.ok(detailRoot.textContent.includes(created.disclosure));
    assert.ok(detailRoot.textContent.includes("screenshots · cozy"));
  });
});

describe("V69 — Post format creation gated to 2+ dev rings and renamed", () => {
  const oneDevRing = {
    id: "cmp_solo",
    members: [{ name: "Ada", handle: "@ada" }],
  };
  const demoTwoDevRing = {
    id: "cmp_demo",
    demo: true,
    members: [{ handle: "@ada" }, { handle: "@ben" }],
  };
  const twoDevOneRemoved = {
    id: "cmp_rem",
    members: [{ handle: "@ada" }, { handle: "@ben" }],
    removedMembers: [{ handle: "@ben" }],
  };
  const twoDevRing = {
    id: "cmp_two",
    members: [{ handle: "@ada" }, { handle: "@ben" }],
  };

  test("copy uses 'New post format' and verbatim subline", () => {
    assert.equal(CREATE_TEMPLATE_COPY.heading, "New post format");
    assert.equal(
      CREATE_TEMPLATE_COPY.lede,
      "A reusable idea any ring can try in their own words.",
    );
    assert.equal(MIN_DEVS_FOR_FORMAT, 2);
  });

  test("canCreateFormat requires at least one real ring with 2+ active devs", () => {
    assert.equal(canCreateFormat([]), false);
    assert.equal(canCreateFormat([demoTwoDevRing]), false);
    assert.equal(canCreateFormat([oneDevRing]), false);
    assert.equal(canCreateFormat([twoDevOneRemoved]), false);
    assert.equal(canCreateFormat([twoDevRing]), true);
    assert.equal(canCreateFormat([twoDevRing], { handle: "@outsider" }), false);
    assert.equal(canCreateFormat([twoDevRing], { handle: "@ada" }), true);
  });

  test("mountCreate hides the form for ringless or 1-dev users and shows it for 2+ dev rings", () => {
    const ringless = freshRoot();
    mountCreate(ringless, { rings: [] });
    assert.equal(ringless.all("form").length, 0);

    const solo = freshRoot();
    mountCreate(solo, { rings: [oneDevRing], me: { handle: "@ada" } });
    assert.equal(solo.all("form").length, 0);

    const ready = freshRoot();
    mountCreate(ready, { rings: [twoDevRing], me: { handle: "@ada" } });
    assert.equal(ready.all("form").length, 1);
    assert.ok(ready.textContent.includes("New post format"));
    assert.ok(ready.textContent.includes("A reusable idea any ring can try in their own words."));
  });
});
