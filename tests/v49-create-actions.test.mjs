// V49 acceptance: obvious creation on both views.
// DOM-only behaviour (real click path, layout) is in tasks/V49-create-actions.md.
import { test } from "node:test";
import assert from "node:assert/strict";

import { createFormat, validateFormat, buildFormatFromForm, parseFormatTags, mountCreate, FORMAT_ID_RE } from "../src/campaign-formats.mjs";
import { loadUserFormats, saveUserFormats, addUserFormat, mergeFormats, USER_FORMATS_KEY } from "../src/user-formats.mjs";
import { mount as mountDiscovery, NEW_TEMPLATE_LABEL, NEW_TEMPLATE_ROUTE } from "../src/discovery.mjs";
import { START_RING } from "../src/home.mjs";

const good = {
  tagline: "Weekly devlog",
  description: "One short update a week.",
  howTo: "Post one update. Add a disclosure line that you are in a ring.",
};

const memStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
};

test("createFormat: missing tagline/description/howTo rejected, valid gets fmt_ id", () => {
  for (const k of ["tagline", "description", "howTo"]) {
    assert.throws(() => createFormat({ ...good, [k]: "  " }), new RegExp(`${k}: missing`));
  }
  const f = createFormat(good);
  assert.match(f.id, FORMAT_ID_RE);
  assert.deepEqual(validateFormat(f), []);
});

test("buildFormatFromForm: per-field errors, disclosure required, tags parsed", () => {
  const empty = buildFormatFromForm({});
  assert.equal(empty.ok, false);
  assert.deepEqual(Object.keys(empty.errors).sort(), ["description", "howTo", "tagline"]);
  const noDisc = buildFormatFromForm({ ...good, howTo: "Post one update." });
  assert.equal(noDisc.ok, false);
  assert.ok(noDisc.errors.howTo.includes("disclosure"));
  const ok = buildFormatFromForm({ ...good, tags: " Devlog, devlog, Clips ," });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.format.tags, ["devlog", "clips"]);
  assert.match(ok.format.id, FORMAT_ID_RE);
  assert.deepEqual(parseFormatTags(""), []);
});

test("user-format store: round-trip, bad data tolerated, id-only merge", () => {
  const st = memStore();
  assert.deepEqual(loadUserFormats(st), []);
  const a = createFormat(good);
  const b = createFormat({ ...good, tagline: "Other" });
  saveUserFormats([a, b, { id: "nope" }, a], st);
  assert.deepEqual(loadUserFormats(st).map((f) => f.id), [a.id, b.id]);
  assert.equal(USER_FORMATS_KEY, "cabal.v2.formats");
  st.setItem(USER_FORMATS_KEY, "{not json");
  assert.deepEqual(loadUserFormats(st), []);
  const c = createFormat(good);
  assert.equal(addUserFormat(c, st).length, 1);

  const seed = [{ id: "fmt_seed0001", tagline: "Same" }, { id: "fmt_seed0002", tagline: "Two" }];
  const user = [{ id: "fmt_user0001", tagline: "Same" }, { id: "fmt_seed0001", tagline: "Clash" }];
  const merged = mergeFormats(seed, user);
  assert.deepEqual(merged.map((f) => f.id), ["fmt_seed0001", "fmt_seed0002", "fmt_user0001"]);
  assert.equal(merged[0].tagline, "Same"); // seed wins on id clash; same tagline kept
});

// --- fake DOM ---
class FakeEl {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.className = ""; this._text = ""; this._l = {}; this.value = ""; this.hidden = false; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(" "); }
  set textContent(v) { this._text = v ?? ""; this.children = []; }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(t, f) { (this._l[t] ||= []).push(f); }
  fire(t) { (this._l[t] || []).forEach((f) => f({ preventDefault() {} })); }
  all(tag, out = []) { for (const c of this.children) { if (c.tagName === tag.toUpperCase()) out.push(c); c.all(tag, out); } return out; }
}
const fresh = () => { const r = new FakeEl("div"); r.ownerDocument = { createElement: (t) => new FakeEl(t) }; return r; };
const field = (root, name) => root.all("input").concat(root.all("textarea")).find((i) => i.name === name);

test("create form: required fields block submit; valid submit calls onCreate then onCreated", () => {
  const root = fresh();
  const calls = [];
  mountCreate(root, { onCreate: (f) => calls.push(["create", f]), onCreated: (f) => calls.push(["created", f]) });
  const form = root.all("form")[0];
  assert.ok(root.textContent.includes("New campaign template"));
  assert.equal(field(root, "tagline").required, true);
  assert.equal(field(root, "tags").required, false);

  form.fire("submit");
  assert.equal(calls.length, 0);
  assert.ok(root.textContent.includes("Give the template a short name."));

  field(root, "tagline").value = good.tagline;
  field(root, "description").value = good.description;
  field(root, "howTo").value = good.howTo;
  field(root, "tags").value = "devlog";
  form.fire("submit");
  assert.deepEqual(calls.map((c) => c[0]), ["create", "created"]);
  assert.equal(calls[0][1].tagline, "Weekly devlog");
  assert.match(calls[1][1].id, FORMAT_ID_RE);
});

test("create form: onCreate throwing shows an error and skips onCreated", () => {
  const root = fresh();
  let created = false;
  mountCreate(root, { onCreate() { throw new Error("disk full"); }, onCreated() { created = true; } });
  field(root, "tagline").value = good.tagline;
  field(root, "description").value = good.description;
  field(root, "howTo").value = good.howTo;
  root.all("form")[0].fire("submit");
  assert.equal(created, false);
  assert.ok(root.textContent.includes("disk full"));
});

test("Campaigns view: New campaign template button + explainer, calls onNewTemplate or sets the route", () => {
  const root = fresh();
  let n = 0;
  mountDiscovery(root, { campaigns: [], formats: [], onNewTemplate: () => n++ });
  const btn = root.all("button").find((b) => b.textContent === NEW_TEMPLATE_LABEL);
  assert.ok(btn);
  assert.ok(root.textContent.includes("any ring can pick it up"));
  btn.fire("click");
  assert.equal(n, 1);

  const loc = { hash: "" };
  const r2 = fresh();
  mountDiscovery(r2, { campaigns: [], formats: [], location: loc });
  r2.all("button").find((b) => b.textContent === NEW_TEMPLATE_LABEL).fire("click");
  assert.equal(loc.hash, "#/campaigns/new");
  assert.equal(NEW_TEMPLATE_ROUTE, "#/campaigns/new");
});

test("Rings view copy: 'Start a ring' with a one-line what-it-is and what-happens-next", () => {
  assert.equal(START_RING.button, "Start a ring");
  assert.match(START_RING.help, /ring is/);
  assert.match(START_RING.help, /pick your game/);
  assert.match(START_RING.help, /invite the ring/);
  assert.match(START_RING.help, /amplify/);
});
