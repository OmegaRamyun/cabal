// V45 — Campaign formats: reusable meme formats any ring can run.
// A FORMAT is not a ring and not Stage 1's structural CAMPAIGN_TEMPLATES
// (src/templates.mjs). It is a shape to fill in your own words: tagline,
// description, how-to (structure + disclosure guidance, never ready-to-paste
// copy), example uses, tags. Pure functions in the core; DOM only in mount().
// No storage, no network, no scores for people.

const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const lc = (v) => String(v ?? "").trim().toLowerCase();

export const FORMAT_ID_RE = /^fmt_[a-z0-9]{8}$/;

// Same random scheme as cmp_ / pst_ ids in src/campaign.mjs.
function randomFormatId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  const buf = new Uint8Array(8);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(buf);
    for (const b of buf) s += chars[b % 36];
  } else {
    for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * 36)];
  }
  return `fmt_${s}`;
}

function isHttpUrl(s) {
  if (typeof s !== "string" || !/^https?:\/\//i.test(s.trim())) return false;
  try {
    const u = new URL(s.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Tolerant read of a format-shaped value. Never throws on malformed input.
 * Missing examples/tags -> [], missing description/howTo -> "". Tags are
 * trimmed + lowercased; malformed example entries are dropped.
 */
export function normalizeFormat(f) {
  const src = isObj(f) ? f : {};
  const examples = (Array.isArray(src.examples) ? src.examples : [])
    .filter(isObj)
    .map((e) => ({
      url: typeof e.url === "string" ? e.url.trim() : "",
      platform: typeof e.platform === "string" ? e.platform.trim().toLowerCase() : "",
      note: typeof e.note === "string" ? e.note : "",
    }));
  const tags = (Array.isArray(src.tags) ? src.tags : [])
    .map((t) => lc(t))
    .filter(Boolean);
  return {
    id: typeof src.id === "string" ? src.id.trim() : "",
    tagline: typeof src.tagline === "string" ? src.tagline.trim() : "",
    description: typeof src.description === "string" ? src.description : "",
    howTo: typeof src.howTo === "string" ? src.howTo : "",
    examples,
    tags: [...new Set(tags)],
    ...(src.demo === true ? { demo: true } : {}),
  };
}

/** Returns a list of error strings ([] when valid). Does not throw. */
export function validateFormat(format) {
  if (!isObj(format)) return ["format: missing or not an object"];
  const errors = [];
  if (!FORMAT_ID_RE.test(String(format.id ?? ""))) {
    errors.push("id: must be fmt_ + 8 lowercase alphanumerics");
  }
  if (!isNonEmptyString(format.tagline)) errors.push("tagline: missing");
  if (!isNonEmptyString(format.description)) errors.push("description: missing");
  if (!isNonEmptyString(format.howTo)) errors.push("howTo: missing");
  if (format.examples !== undefined && !Array.isArray(format.examples)) {
    errors.push("examples: must be an array");
  } else {
    (format.examples || []).forEach((e, i) => {
      if (!isObj(e)) return errors.push(`examples[${i}]: not an object`);
      if (!isHttpUrl(e.url)) errors.push(`examples[${i}].url: must be an http(s) URL`);
      if (!isNonEmptyString(e.platform)) errors.push(`examples[${i}].platform: missing`);
    });
  }
  if (format.tags !== undefined) {
    if (!Array.isArray(format.tags)) errors.push("tags: must be an array");
    else if (format.tags.some((t) => typeof t !== "string" || t !== t.trim().toLowerCase() || !t)) {
      errors.push("tags: must be non-empty lowercase strings");
    }
  }
  return errors;
}

/**
 * createFormat(input) — builds a valid format or throws
 * `Invalid format: ...` listing every failure (createCampaign discipline).
 */
export function createFormat(input = {}) {
  const src = isObj(input) ? input : {};
  const format = normalizeFormat({
    ...src,
    id: isNonEmptyString(src.id) ? src.id : randomFormatId(),
  });
  const errors = validateFormat(format);
  if (errors.length > 0) throw new Error(`Invalid format: ${errors.join("; ")}`);
  return format;
}

/** A ring's format id, or null. Untemplated rings are normal, not an error. */
export function formatIdForRing(ring) {
  const id = isObj(ring) ? ring.formatId : null;
  return isNonEmptyString(id) ? id.trim() : null;
}

/** Rings whose formatId matches (case-insensitive); rings without one ignored. */
export function ringsRunningFormat(formatId, rings) {
  if (!isNonEmptyString(formatId)) return [];
  const want = lc(formatId);
  return (Array.isArray(rings) ? rings : []).filter((r) => {
    const id = formatIdForRing(r);
    return id !== null && lc(id) === want;
  });
}

// Accepts a Map(id -> count), an array of [id, count] pairs, an array of
// { id, count } objects, or a plain object. Counts must be finite >= 0.
// V48: also accepts the V46 shape — values of { rings: Set, assists: n }
// (or { count, assists }) — where the count is the distinct-ring count
// and assists ride along for the tiebreak. Anything else is ignored.
function toUsageDetail(usage) {
  if (usage === undefined || usage === null) return null;
  const out = new Map();
  const put = (id, count, assists = 0) => {
    if (typeof id !== "string") return;
    if (!Number.isFinite(count) || count < 0) return;
    out.set(lc(id), {
      count,
      assists: Number.isFinite(assists) && assists >= 0 ? assists : 0,
    });
  };
  const readEntry = (id, v) => {
    if (Number.isFinite(v)) return put(id, v, 0);
    if (!isObj(v)) return;
    const rings =
      v.rings instanceof Set
        ? v.rings.size
        : Number.isFinite(v.rings)
          ? v.rings
          : Number.isFinite(v.count)
            ? v.count
            : null;
    if (rings === null) return;
    put(id, rings, Number.isFinite(v.assists) ? v.assists : 0);
  };
  if (usage instanceof Map) for (const [id, v] of usage) readEntry(id, v);
  else if (Array.isArray(usage)) {
    for (const e of usage) {
      if (Array.isArray(e)) readEntry(e[0], e[1]);
      else if (isObj(e)) readEntry(e.id, e.count !== undefined ? { count: e.count, assists: e.assists } : e);
    }
  } else if (isObj(usage)) for (const [id, v] of Object.entries(usage)) readEntry(id, v);
  else return null;
  return out;
}

export { toUsageDetail };

function toUsageMap(usage) {
  const detail = toUsageDetail(usage);
  if (!detail) return null;
  const out = new Map();
  for (const [id, d] of detail) out.set(id, d.count);
  return out;
}

export { toUsageMap };

const ringMemberTotal = (formatId, rings) =>
  ringsRunningFormat(formatId, rings).reduce(
    (n, r) => n + (Array.isArray(r.members) ? r.members.length : 0), 0);

/**
 * formatsForDiscovery(formats, { usage, rings }) — display order.
 * With usage (V46 shape, id -> distinct-ring count): most-used first,
 * member-count order as tiebreak, then id. Without usage: the member-count
 * order alone (members of locally-known rings running the format; with no
 * rings either, id order). Never invents a count: this returns an ordering
 * only; callers show "used by N rings" solely from real usage data.
 */
export function formatsForDiscovery(formats, { usage, rings } = {}) {
  const list = (Array.isArray(formats) ? formats : [])
    .filter((f) => isObj(f) && isNonEmptyString(f.id));
  const u = toUsageDetail(usage);
  const members = new Map(list.map((f) => [f.id, ringMemberTotal(f.id, rings)]));
  const used = (f) => (u ? (u.get(lc(f.id))?.count ?? 0) : 0);
  const assists = (f) => (u ? (u.get(lc(f.id))?.assists ?? 0) : 0);
  return [...list].sort(
    (a, b) =>
      used(b) - used(a) ||
      assists(b) - assists(a) ||
      members.get(b.id) - members.get(a.id) ||
      String(a.id).localeCompare(String(b.id)),
  );
}

/** "used by N ring(s)" only when real usage data has this id; else null. */
export function usageLabel(formatId, usage) {
  const u = toUsageMap(usage);
  if (!u || !u.has(lc(formatId))) return null;
  const n = u.get(lc(formatId));
  // V48 verifier fix: never show "used by 0 rings" — a format with
  // kind-1 assists but no kind-30078 campaign event has count 0, and
  // "0 rings" would dress an unproven template up as counted.
  if (!n || n <= 0) return null;
  return `used by ${n} ring${n === 1 ? "" : "s"}`;
}

// ---- DOM (mount only) ----
function el(doc, tag, text, cls) {
  const n = doc.createElement(tag);
  if (text != null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

/**
 * mount(rootEl, ctx) ctx: { format | (formats + formatId), rings, usage,
 * startHref, navigate }
 * Renders tagline, description, how-to, example uses (http(s) links with
 * platform labels), and the rings running it. Read-only: no storage.
 * The "Start a ring" link is a plain link; format preselection in the
 * creation flow is NOT wired (see tasks/V45 note for V48).
 */
export function mount(rootEl, ctx = {}) {
  const doc = rootEl.ownerDocument;
  rootEl.textContent = "";
  let raw = ctx.format;
  if (!raw && Array.isArray(ctx.formats)) {
    raw = ctx.formats.find((f) => lc(f?.id) === lc(ctx.formatId));
  }
  if (!raw) {
    rootEl.appendChild(el(doc, "p", "That format was not found.", "empty-state"));
    return;
  }
  const f = normalizeFormat(raw);
  const rings = ringsRunningFormat(f.id, ctx.rings);

  const head = el(doc, "h2", f.tagline, "format-tagline");
  rootEl.appendChild(head);
  if (f.demo) rootEl.appendChild(el(doc, "span", "DEMO", "demo-badge"));
  const used = usageLabel(f.id, ctx.usage);
  if (used) rootEl.appendChild(el(doc, "p", used, "format-usage"));
  // V48: the honest-limits line travels with the usage count (V46).
  if (used && typeof ctx.usageNote === "string" && ctx.usageNote) {
    rootEl.appendChild(el(doc, "p", ctx.usageNote, "format-usage-note"));
  }
  if (f.description) rootEl.appendChild(el(doc, "p", f.description, "format-description"));
  if (f.tags.length) rootEl.appendChild(el(doc, "p", f.tags.join(", "), "format-tags"));

  rootEl.appendChild(el(doc, "h3", "How to run it"));
  rootEl.appendChild(el(doc, "p", f.howTo || "No guidance yet.", "format-howto"));

  rootEl.appendChild(el(doc, "h3", "Example uses"));
  const exList = el(doc, "ul", null, "format-examples");
  const safe = f.examples.filter((e) => isHttpUrl(e.url));
  if (!safe.length) exList.appendChild(el(doc, "li", "No examples yet.", "empty-state"));
  for (const e of safe) {
    const li = el(doc, "li");
    li.appendChild(el(doc, "span", e.platform || "link", "format-platform"));
    const a = el(doc, "a", e.note || e.url);
    a.href = e.url.trim();
    a.rel = "noopener noreferrer";
    li.appendChild(a);
    exList.appendChild(li);
  }
  rootEl.appendChild(exList);

  rootEl.appendChild(el(doc, "h3", "Rings running it"));
  const ringList = el(doc, "ul", null, "format-rings");
  if (!rings.length) ringList.appendChild(el(doc, "li", "No rings are running this format yet.", "empty-state"));
  for (const r of rings) {
    const li = el(doc, "li");
    const btn = el(doc, "button", r.title || r.id);
    btn.type = "button";
    btn.addEventListener("click", () => {
      if (typeof ctx.navigate === "function") ctx.navigate(r);
    });
    li.appendChild(btn);
    if (r.demo) li.appendChild(el(doc, "span", "DEMO", "demo-badge"));
    ringList.appendChild(li);
  }
  rootEl.appendChild(ringList);

  const start = el(doc, "a", "Start a ring");
  start.href = typeof ctx.startHref === "string" ? ctx.startHref : "#/rings";
  start.className = "format-start";
  rootEl.appendChild(el(doc, "p", null)).appendChild(start);
}

// ---- V49: create a template (pure core + mount) ----

export const CREATE_TEMPLATE_COPY = {
  heading: "New campaign template",
  lede:
    "A template is a format, not a caption: the shape of a post and how to disclose it. " +
    "When you save it, it appears in Campaigns and any ring can pick it up and run it in its own words.",
  submit: "Save template",
  cancel: "Cancel",
};

/** "a, B, a" -> ["a","b"]. Trimmed, lowercased, deduped, empties dropped. */
export function parseFormatTags(text) {
  const parts = Array.isArray(text) ? text : String(text ?? "").split(",");
  return [...new Set(parts.map((t) => lc(t)).filter(Boolean))];
}

const DISCLOSURE_RE = /disclos/i;

/**
 * Validates the create-form values and builds the format.
 * Returns { ok:true, format } or { ok:false, errors:{ field: message } }.
 * Required: tagline, description, howTo (final check is the shared
 * createFormat/validateFormat, not re-implemented) plus a disclosure
 * mention in howTo (every template ships a disclosure line). Tags optional.
 */
export function buildFormatFromForm(values = {}) {
  const v = isObj(values) ? values : {};
  const errors = {};
  if (!isNonEmptyString(v.tagline)) errors.tagline = "Give the template a short name.";
  if (!isNonEmptyString(v.description)) errors.description = "Say in a sentence or two what this template is.";
  if (!isNonEmptyString(v.howTo)) {
    errors.howTo = "Explain the structure and how ringmates disclose.";
  } else if (!DISCLOSURE_RE.test(v.howTo)) {
    errors.howTo = "Add a disclosure line (say how ringmates disclose they are in a ring).";
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  try {
    const format = createFormat({
      tagline: v.tagline.trim(),
      description: v.description.trim(),
      howTo: v.howTo.trim(),
      tags: parseFormatTags(v.tags),
      examples: [],
    });
    return { ok: true, format };
  } catch (err) {
    return { ok: false, errors: { form: String(err.message || err) } };
  }
}

/**
 * mountCreate(rootEl, ctx) — the "New campaign template" form.
 * ctx: { onCreate(format), onCreated(format), onCancel() }
 * No storage here: the caller saves inside onCreate. onCreated runs only
 * after onCreate returned without throwing.
 */
export function mountCreate(rootEl, ctx = {}) {
  const doc = rootEl.ownerDocument;
  rootEl.textContent = "";
  const C = CREATE_TEMPLATE_COPY;
  rootEl.appendChild(el(doc, "h2", C.heading));
  rootEl.appendChild(el(doc, "p", C.lede, "view-lede"));

  const form = el(doc, "form", null, "format-create-form");
  const errBox = el(doc, "p", null, "form-error");
  errBox.hidden = true;
  form.appendChild(errBox);

  const inputs = {};
  const fieldErr = {};
  const field = (name, label, kind, hint, placeholder) => {
    const wrap = el(doc, "label", label);
    const input = el(doc, kind === "text" ? "input" : "textarea");
    input.name = name;
    if (kind === "text") input.type = "text";
    else input.rows = kind === "long" ? 5 : 3;
    input.value = "";
    input.placeholder = placeholder;
    input.required = name !== "tags";
    wrap.appendChild(input);
    form.appendChild(wrap);
    if (hint) form.appendChild(el(doc, "p", hint, "field-hint"));
    const fe = el(doc, "p", null, "form-error field-error");
    fe.hidden = true;
    form.appendChild(fe);
    inputs[name] = input;
    fieldErr[name] = fe;
  };
  field("tagline", "Template name", "text", null, "e.g. Weekly devlog, one clip");
  field("description", "What is it?", "short", "One or two sentences.", "e.g. Each ringmate shares one short clip of their game from the week.");
  field("howTo", "How a ring runs it", "long",
    "Structure and disclosure only. No ready-to-paste captions: ringmates write their own words.",
    "e.g. Post one clip, say what changed this week, and add a disclosure line that you are in a ring.");
  field("tags", "Tags (optional, comma-separated)", "text", null, "devlog, clips");

  const submit = el(doc, "button", C.submit, "primary");
  submit.type = "submit";
  form.appendChild(submit);
  if (typeof ctx.onCancel === "function") {
    const cancel = el(doc, "button", C.cancel);
    cancel.type = "button";
    cancel.addEventListener("click", () => ctx.onCancel());
    form.appendChild(cancel);
  }

  form.addEventListener("submit", (e) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    for (const n of Object.keys(fieldErr)) { fieldErr[n].textContent = ""; fieldErr[n].hidden = true; }
    errBox.textContent = ""; errBox.hidden = true;
    const result = buildFormatFromForm({
      tagline: inputs.tagline.value,
      description: inputs.description.value,
      howTo: inputs.howTo.value,
      tags: inputs.tags.value,
    });
    if (!result.ok) {
      for (const [name, msg] of Object.entries(result.errors)) {
        if (fieldErr[name]) { fieldErr[name].textContent = msg; fieldErr[name].hidden = false; }
        else { errBox.textContent = msg; errBox.hidden = false; }
      }
      return;
    }
    try {
      if (typeof ctx.onCreate === "function") ctx.onCreate(result.format);
    } catch (err) {
      errBox.textContent = `Could not save: ${err.message || err}`;
      errBox.hidden = false;
      return;
    }
    if (typeof ctx.onCreated === "function") ctx.onCreated(result.format);
  });
  rootEl.appendChild(form);
}
