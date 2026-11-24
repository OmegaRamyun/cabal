// V21/V38 — Campaign object + link intent (sustained-ring model, v2).
// Pure functions only. No DOM, no storage, no network, no posting.
// Spec: cabal-bench/redesign-sustained-ring.md (sections 1-4).
// Campaign shape v2:
//   { id, game: { name, links: { steam?, itch?, x? }, tags: string[] },
//     title,
//     posts: [{ id: 'pst_xxxxxxxx', author, authorName?, platform, url, text?,
//               kind?, createdAt,
//               assists: [{ handle, status: 'contributed', contributedAt,
//                           url?, quoteText?, note? }] }],   // oldest first
//     anchorPost,            // legacy mirror of posts[0]: { platform, url, text, author }
//     members: [{ name, handle, platform? }],                // roster only
//     window: { start, end } | null,                         // DEPRECATED, ignored by UI
//     createdAt, demo? }
// The old anchor-only shape (anchorPost + members with status) is still
// accepted everywhere and migrated by normalizeCampaign.

import { formatIdsForRing } from "./campaign-formats.mjs";

export const PLATFORMS = Object.freeze(["x", "bluesky", "threads"]);
// Display labels for ring posts (labels only, never integrations).
export const POST_PLATFORMS = Object.freeze([
  "x", "bluesky", "threads", "reddit", "instagram", "tiktok", "youtube", "other",
]);
export const POST_KINDS = Object.freeze(["announcement", "devlog", "clip", "other"]);
export const NOTE_MAX = 280;
export const LINK_LONG_LIMIT = 2000;

const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const lc = (v) => String(v ?? "").trim().toLowerCase();
const COMPOSER_PLATFORMS = new Set(["x", "bluesky"]);

function clone(v) {
  return v === undefined ? undefined : structuredClone(v);
}

function randomId(prefix = "cmp") {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  const buf = new Uint8Array(8);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(buf);
    for (const b of buf) s += chars[b % 36];
  } else {
    for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * 36)];
  }
  return `${prefix}_${s}`;
}

// Deterministic pst_ id (8 lowercase alphanumerics) so migrating the same
// old-shape campaign twice yields the same post id (FNV-1a, two lanes).
function derivedPostId(seed) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  let s = "";
  for (let i = 0; i < 4; i++) { s += chars[h1 % 36]; h1 = Math.floor(h1 / 36); }
  for (let i = 0; i < 4; i++) { s += chars[h2 % 36]; h2 = Math.floor(h2 / 36); }
  return `pst_${s}`;
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

const validDate = (v) => isNonEmptyString(v) && !Number.isNaN(Date.parse(v));

/** Validate one assist; pushes messages prefixed with `where`. */
function validateAssist(a, where, errors) {
  if (!isObj(a)) { errors.push(`${where}: not an object`); return; }
  if (!isNonEmptyString(a.handle)) errors.push(`${where}.handle: missing`);
  if (!validDate(a.contributedAt)) errors.push(`${where}.contributedAt: missing or not a valid date`);
  if (a.url !== undefined && a.url !== null && a.url !== "" && !isHttpUrl(a.url)) {
    errors.push(`${where}.url: must be an http(s) URL`);
  }
  if (a.note !== undefined && a.note !== null) {
    if (typeof a.note !== "string") errors.push(`${where}.note: must be text`);
    else if (a.note.length > NOTE_MAX) errors.push(`${where}.note: max ${NOTE_MAX} characters`);
  }
}

/**
 * validatePost(post, { strict? }) -> string[]. Requires id, author, platform
 * (non-empty string), url (http/https), createdAt (valid date), and any
 * assists valid. `strict` (used for NEW posts: addPost / createCampaign
 * input) additionally requires `text` for x/bluesky posts, because the
 * similarity gate scores against it. Decoding stays lenient.
 */
export function validatePost(post, { strict = false, where = "post" } = {}) {
  const errors = [];
  if (!isObj(post)) return [`${where}: not an object`];
  if (!isNonEmptyString(post.id)) errors.push(`${where}.id: missing`);
  if (!isNonEmptyString(post.author)) errors.push(`${where}.author: missing`);
  if (!isNonEmptyString(post.platform)) errors.push(`${where}.platform: missing`);
  if (!isHttpUrl(post.url)) errors.push(`${where}.url: must be an http(s) URL`);
  if (!validDate(post.createdAt)) errors.push(`${where}.createdAt: missing or not a valid date`);
  if (strict && COMPOSER_PLATFORMS.has(post.platform) && !isNonEmptyString(post.text)) {
    errors.push(`${where}.text: required for x/bluesky posts`);
  }
  if (post.assists !== undefined) {
    if (!Array.isArray(post.assists)) errors.push(`${where}.assists: must be an array`);
    else post.assists.forEach((a, i) => validateAssist(a, `${where}.assists[${i}]`, errors));
  }
  return errors;
}

/** Setup validation (V62): game name required; store links and tags are optional. */
export function validateGameSetup(game) {
  const errors = [];
  if (!game || !isNonEmptyString(game.name)) {
    errors.push("Game name is required.");
  }
  return errors;
}

/**
 * validateCampaign(c) -> string[] (empty = valid). Accepts BOTH shapes
 * plus postless rings (V62).
 * Requires: game.name, title, members >= 1 each with name (handle optional),
 * valid createdAt. Store links and initial posts / anchorPost are optional;
 * when posts or a legacy anchorPost are present, they are validated.
 * A non-null window needs valid start/end dates with start <= end.
 * Member `status` is legacy: when present it must be 'posted' or 'pending'.
 */
export function validateCampaign(c) {
  const errors = [];
  if (!c || typeof c !== "object") return ["campaign: missing or not an object"];
  if (!isNonEmptyString(c.id)) errors.push("id: missing");
  if (!isNonEmptyString(c.title)) errors.push("title: missing");
  if (!c.game || typeof c.game !== "object") {
    errors.push("game: missing");
  } else {
    if (!isNonEmptyString(c.game.name)) errors.push("game.name: missing");
    if (c.game.tags !== undefined && !Array.isArray(c.game.tags)) {
      errors.push("game.tags: must be an array");
    }
  }
  if (Array.isArray(c.posts) && c.posts.length > 0) {
    const seen = new Set();
    c.posts.forEach((p, i) => {
      errors.push(...validatePost(p, { where: `posts[${i}]` }));
      if (isObj(p) && isNonEmptyString(p.id)) {
        if (seen.has(p.id)) errors.push(`posts[${i}].id: duplicate`);
        seen.add(p.id);
      }
    });
  } else if (c.posts !== undefined && !Array.isArray(c.posts)) {
    errors.push("posts: must be an array");
  } else if (c.anchorPost !== undefined && c.anchorPost !== null) {
    if (!isObj(c.anchorPost)) {
      errors.push("anchorPost: must be an object");
    } else {
      if (!PLATFORMS.includes(c.anchorPost.platform)) {
        errors.push("anchorPost.platform: must be one of x, bluesky, threads");
      }
      if (!isNonEmptyString(c.anchorPost.url)) errors.push("anchorPost.url: missing");
      if (!isNonEmptyString(c.anchorPost.text)) errors.push("anchorPost.text: missing");
      if (!isNonEmptyString(c.anchorPost.author)) errors.push("anchorPost.author: missing");
    }
  }
  if (c.window !== null && c.window !== undefined) {
    const start = Date.parse(c.window.start);
    const end = Date.parse(c.window.end);
    if (Number.isNaN(start)) errors.push("window.start: not a valid date");
    if (Number.isNaN(end)) errors.push("window.end: not a valid date");
    if (!Number.isNaN(start) && !Number.isNaN(end) && start > end) {
      errors.push("window: start must be on or before end");
    }
  }
  if (!Array.isArray(c.members) || c.members.length < 1) {
    errors.push("members: at least one member is required");
  } else {
    c.members.forEach((m, i) => {
      if (!m || typeof m !== "object") { errors.push(`members[${i}]: not an object`); return; }
      if (!isNonEmptyString(m.name)) errors.push(`members[${i}].name: missing`);
      if (m.handle !== undefined && typeof m.handle !== "string") {
        errors.push(`members[${i}].handle: must be a string`);
      }
      if (m.status !== undefined && m.status !== "posted" && m.status !== "pending") {
        errors.push(`members[${i}].status: must be 'posted' or 'pending'`);
      }
    });
  }
  if (!validDate(c.createdAt)) {
    errors.push("createdAt: missing or not a valid date");
  }
  if (c.createdBy !== undefined && !isNonEmptyString(c.createdBy)) {
    errors.push("createdBy: must be a non-empty string");
  }
  if (c.key !== undefined && !isNonEmptyString(c.key)) {
    errors.push("key: must be a non-empty string");
  }
  if (c.removedMembers !== undefined) {
    if (!Array.isArray(c.removedMembers)) {
      errors.push("removedMembers: must be an array");
    } else {
      c.removedMembers.forEach((r, i) => {
        if (!isObj(r) || !isNonEmptyString(r.handle)) errors.push(`removedMembers[${i}].handle: missing`);
      });
    }
  }
  if (c.formatIds !== undefined && !Array.isArray(c.formatIds)) {
    errors.push("formatIds: must be an array");
  }
  return errors;
}

function postFromAnchor(c) {
  const a = c.anchorPost;
  return {
    id: derivedPostId(`${c.id ?? ""}|${a.url ?? ""}`),
    author: a.author,
    platform: a.platform,
    url: a.url,
    ...(a.text !== undefined ? { text: a.text } : {}),
    kind: "announcement",
    createdAt: c.createdAt,
    assists: [],
  };
}

function cleanNote(note) {
  if (typeof note !== "string") return undefined;
  const t = note.trim().slice(0, NOTE_MAX);
  return t || undefined;
}

function upsertAssist(post, assist) {
  const key = lc(assist.handle);
  const list = Array.isArray(post.assists) ? post.assists : [];
  const i = list.findIndex((a) => lc(a?.handle) === key);
  if (i === -1) post.assists = [...list, assist];
  else post.assists = list.map((a, j) => (j === i ? assist : a));
}

/**
 * normalizeCampaign(c) -> v2 campaign (NEW object, input untouched). Pure;
 * never throws — malformed input comes back unchanged (cloned when possible)
 * for validateCampaign to report. Idempotent.
 *  - posts present: kept (each gains assists: [] / notes clipped to 280);
 *    anchorPost derived from posts[0] when missing.
 *  - posts missing, anchorPost present: posts = [postFromAnchor] with a
 *    deterministic pst_ id and createdAt = campaign.createdAt.
 *  - member state migrates: status 'posted' -> an assist on posts[0]
 *    (contributedAt = postedAt or createdAt, url = quoteUrl, quoteText);
 *    'pending' -> plain roster entry. status/quoteUrl/postedAt/quoteText
 *    are stripped from the roster. `window` passes through untouched.
 */
export function normalizeCampaign(c) {
  try {
    if (!isObj(c)) return c;
    const next = clone(c);
    applyRemovalDefaults(next);
    applyFormatDefaults(next);
    if (!Array.isArray(next.posts) || next.posts.length === 0) {
      if (isObj(next.anchorPost)) next.posts = [postFromAnchor(next)];
      else {
        if (Array.isArray(next.members) && next.posts === undefined) next.posts = [];
        return next;
      }
    }
    next.posts = next.posts.filter(isObj).map((p) => {
      const post = { ...p };
      const assists = Array.isArray(p.assists) ? p.assists.filter(isObj) : [];
      post.assists = assists.map((a) => {
        const out = { ...a, status: a.status || "contributed" };
        if (typeof out.note === "string") {
          const n = cleanNote(out.note);
          if (n) out.note = n; else delete out.note;
        }
        return out;
      });
      return post;
    });
    if (next.posts.length === 0) { const orig = clone(c); applyRemovalDefaults(orig); applyFormatDefaults(orig); return orig; }
    if (!isObj(next.anchorPost)) {
      const p0 = next.posts[0];
      next.anchorPost = {
        platform: p0.platform, url: p0.url,
        ...(p0.text !== undefined ? { text: p0.text } : {}),
        author: p0.author,
      };
    }
    if (Array.isArray(next.members)) {
      const first = next.posts[0];
      next.members = next.members.map((m) => {
        if (!isObj(m)) return m;
        const { status, quoteUrl, postedAt, quoteText, ...roster } = m;
        if (status === "posted" && isNonEmptyString(m.handle)) {
          const exists = (first.assists || []).some((a) => lc(a.handle) === lc(m.handle));
          if (!exists) {
            first.assists.push({
              handle: m.handle,
              status: "contributed",
              contributedAt: postedAt || next.createdAt,
              ...(quoteUrl ? { url: quoteUrl } : {}),
              ...(quoteText ? { quoteText } : {}),
            });
          }
        }
        return roster;
      });
    }
    return next;
  } catch {
    return c;
  }
}

/**
 * Removal-model defaults (spec 17b), applied in place on a clone:
 * createdBy pins to members[0].handle the first time it is seen (so a later
 * removal/reorder of the roster can't change who the creator is);
 * removedMembers defaults to []. Unknown fields (nostr sidecar, key) are
 * left alone.
 */
function applyRemovalDefaults(next) {
  if (!Array.isArray(next.members)) return; // not campaign-shaped: pass through untouched
  if (!isNonEmptyString(next.createdBy)) {
    const h = Array.isArray(next.members) && isObj(next.members[0]) ? next.members[0].handle : null;
    if (isNonEmptyString(h)) next.createdBy = h;
  }
  next.removedMembers = Array.isArray(next.removedMembers)
    ? next.removedMembers.filter((r) => isObj(r) && isNonEmptyString(r.handle))
    : [];
}

/**
 * Multi-template migration (V58): legacy `formatId` moves to the first entry
 * of `formatIds`; rings without one get `formatIds: []`; legacy `formatId` key
 * is dropped so `formatIds` is the sole canonical stored form.
 */
function applyFormatDefaults(next) {
  const isCampaignShaped =
    Array.isArray(next.members) ||
    Array.isArray(next.posts) ||
    isObj(next.anchorPost) ||
    "formatId" in next ||
    "formatIds" in next;
  if (!isCampaignShaped) return;
  next.formatIds = formatIdsForRing(next);
  delete next.formatId;
}

/**
 * createCampaign({ game, title, anchorPost?, posts?, window, creator?, me?, members?, demo? })
 * Validates, assigns id + createdAt. The creator is members[0] (roster
 * only — no per-member status in v2). Supply `posts` (array of post input)
 * or the legacy `anchorPost` (becomes posts[0]); with `posts`, anchorPost
 * mirrors posts[0]. New campaigns should pass window: null (open-ended).
 * Throws an Error listing the validation failures.
 */
export function createCampaign(input = {}) {
  const { game, title, anchorPost, window: win = null, demo } = input;
  const creator = input.creator ?? input.me ?? null;
  let members = [];
  if (Array.isArray(input.members) && input.members.length > 0) {
    members = input.members.map((m) => ({
      name: m.name,
      handle: isNonEmptyString(m.handle) ? m.handle.trim() : "",
      ...(m.platform ? { platform: m.platform } : {}),
    }));
  } else if (creator) {
    members = [{
      name: creator.name,
      handle: isNonEmptyString(creator.handle) ? creator.handle.trim() : "",
      ...(creator.platform ? { platform: creator.platform } : {}),
    }];
  }
  const createdAt = new Date().toISOString();
  const id = randomId("cmp");
  const base = {
    id,
    game: {
      name: game?.name,
      links: { ...(game?.links || {}) },
      tags: Array.isArray(game?.tags) ? [...game.tags] : [],
    },
    title,
    window: win ? { start: win.start, end: win.end } : null,
    members,
    createdAt,
    ...(isNonEmptyString(input.key) ? { key: input.key } : {}),
    ...(input.formatId !== undefined ? { formatId: input.formatId } : {}),
    ...(input.formatIds !== undefined ? { formatIds: input.formatIds } : {}),
    ...(demo === true ? { demo: true } : {}),
  };
  const errors = [];
  if (Array.isArray(input.posts) && input.posts.length > 0) {
    const ids = new Set();
    base.posts = input.posts.map((p, i) => {
      const post = buildPost(p, createdAt);
      if (ids.has(post.id)) post.id = randomId("pst");
      ids.add(post.id);
      errors.push(...validatePost(post, { strict: true, where: `posts[${i}]` }));
      return post;
    });
  } else if (anchorPost && isObj(anchorPost)) {
    base.anchorPost = { ...anchorPost };
  } else {
    base.posts = [];
  }
  const campaign = normalizeCampaign(base);
  errors.push(...validateCampaign(campaign));
  if (errors.length > 0) {
    throw new Error(`Invalid campaign: ${[...new Set(errors)].join("; ")}`);
  }
  return campaign;
}

function buildPost(input, nowIso) {
  const i = isObj(input) ? input : {};
  const url = typeof i.url === "string" ? i.url.trim() : i.url;
  const text = typeof i.text === "string" ? i.text.trim() : undefined;
  return {
    id: isNonEmptyString(i.id) ? i.id.trim() : randomId("pst"),
    author: typeof i.author === "string" ? i.author.trim() : i.author,
    ...(isNonEmptyString(i.authorName) ? { authorName: i.authorName.trim() } : {}),
    platform: isNonEmptyString(i.platform) ? i.platform.trim().toLowerCase() : detectPlatform(url),
    url,
    ...(text ? { text } : {}),
    kind: POST_KINDS.includes(i.kind) ? i.kind : "other",
    createdAt: isNonEmptyString(i.createdAt) ? i.createdAt : nowIso,
    assists: Array.isArray(i.assists) ? clone(i.assists) : [],
  };
}

/**
 * addPost(campaign, postInput) -> NEW campaign with the post appended.
 * Assigns a pst_ id + createdAt when missing; platform defaults to
 * detectPlatform(url). Throws like createCampaign when the post is invalid
 * (x/bluesky posts need text — the gate scores against it). anchorPost is
 * left alone (it mirrors posts[0]).
 */
export function addPost(campaign, postInput) {
  const next = normalizeCampaign(campaign);
  const post = buildPost(postInput, new Date().toISOString());
  const errors = validatePost(post, { strict: true });
  if (Array.isArray(next?.posts) && next.posts.some((p) => p.id === post.id)) {
    errors.push("post.id: already used in this campaign");
  }
  if (errors.length > 0) throw new Error(`Invalid post: ${errors.join("; ")}`);
  if (!Array.isArray(next?.posts)) throw new Error("Invalid post: campaign has no posts");
  next.posts = [...next.posts, post];
  return next;
}

/** addMember(campaign, { name, handle, platform? }) -> NEW campaign, no mutation. No-op (same content, new object) if the handle is already a member (case-insensitive). Roster only: no status. */
export function addMember(campaign, member) {
  const next = clone(campaign);
  const handle = String(member?.handle ?? "").trim();
  if (!handle) return next;
  const exists = (next.members || []).some(
    (m) => String(m.handle).trim().toLowerCase() === handle.toLowerCase(),
  );
  if (exists) return next;
  if (isRemoved(next, handle)) return next; // creator removal: join refused (spec 17b)
  next.members = [...(next.members || []), {
    name: member.name, handle,
    ...(member.platform ? { platform: member.platform } : {}),
  }];
  return next;
}

/** createdBy with the members[0] fallback for campaigns not yet normalized. */
function creatorOf(campaign) {
  if (isNonEmptyString(campaign?.createdBy)) return campaign.createdBy;
  const m0 = campaign?.members?.[0];
  return isNonEmptyString(m0?.handle) ? m0.handle : "";
}

/** isRemoved(campaign, handle) — case-insensitive lookup in removedMembers. */
export function isRemoved(campaign, handle) {
  const h = lc(handle);
  if (!h || !Array.isArray(campaign?.removedMembers)) return false;
  return campaign.removedMembers.some((r) => lc(r?.handle) === h);
}

/** isMember(campaign, handle) — case-insensitive lookup in the current roster. */
export function isMember(campaign, handle) {
  const h = lc(handle);
  if (!h || !Array.isArray(campaign?.members)) return false;
  return campaign.members.some((m) => lc(m?.handle) === h);
}

/**
 * removeMember(campaign, handle, { by, now? }) -> NEW campaign, no mutation.
 * Only `by` === createdBy (case-insensitive) may remove; otherwise an
 * unchanged copy. The creator cannot remove themself (that would orphan the
 * ring). Drops the handle from the roster, records it in removedMembers
 * (a repeat removal refreshes removedAt/removedBy, never duplicates), and
 * keeps their posts and assists as history. Scoped to this campaign only.
 */
export function removeMember(campaign, handle, { by, now } = {}) {
  const next = clone(campaign);
  const target = String(handle ?? "").trim();
  const creator = creatorOf(next);
  if (!target || !creator || lc(by) !== lc(creator) || lc(target) === lc(creator)) return next;
  if (!isNonEmptyString(next.createdBy)) next.createdBy = creator;
  const removedAt = stampOf(now);
  const list = Array.isArray(next.removedMembers) ? next.removedMembers : [];
  const i = list.findIndex((r) => lc(r?.handle) === lc(target));
  const entry = { handle: i >= 0 ? list[i].handle : target, removedAt, removedBy: creator };
  next.removedMembers = i >= 0 ? list.map((r, j) => (j === i ? entry : r)) : [...list, entry];
  next.members = (next.members || []).filter((m) => lc(m?.handle) !== lc(target));
  return next;
}

function stampOf(now) {
  const parsed = toTime(now ?? new Date());
  return new Date(Number.isNaN(parsed) ? Date.now() : parsed).toISOString();
}

/**
 * markContributed(campaign, postId, handle, { url?, quoteText?, note?, now? })
 * -> NEW campaign; upserts that handle's assist on that post (case-
 * insensitive handle: a second mark UPDATES in place, never duplicates;
 * fields omitted from opts keep their old value, '' clears one). Sets
 * contributedAt. `note` is the Enscryption receipt (spec 2a): plain text,
 * clipped to 280 chars. Unknown postId or blank handle: unchanged copy.
 * Self-reported, unchecked.
 */
export function markContributed(campaign, postId, handle, opts = {}) {
  const next = normalizeCampaign(campaign);
  const who = String(handle ?? "").trim();
  const post = Array.isArray(next?.posts) ? next.posts.find((p) => p.id === postId) : null;
  if (!who || !post) return next;
  const o = isObj(opts) ? opts : {};
  const prev = (post.assists || []).find((a) => lc(a.handle) === lc(who)) || {};
  const assist = { ...prev, handle: prev.handle || who, status: "contributed", contributedAt: stampOf(o.now) };
  if (o.url !== undefined) {
    const u = typeof o.url === "string" ? o.url.trim() : "";
    if (u) assist.url = u; else delete assist.url;
  }
  if (o.quoteText !== undefined) {
    const q = typeof o.quoteText === "string" ? o.quoteText.trim() : "";
    if (q) assist.quoteText = q; else delete assist.quoteText;
  }
  if (o.note !== undefined) {
    const n = cleanNote(o.note);
    if (n) assist.note = n; else delete assist.note;
  }
  upsertAssist(post, assist);
  return next;
}

/**
 * markPosted(campaign, handle, quoteUrl?, now?) — DEPRECATED wrapper kept so
 * nothing breaks mid-round (V39 moves callers to markContributed). Marks
 * that member contributed on posts[0] with quoteUrl as the contribution
 * link. Non-member handle: unchanged copy.
 */
export function markPosted(campaign, handle, quoteUrl, now) {
  const next = normalizeCampaign(campaign);
  const who = lc(handle);
  const isMember = (next?.members || []).some((m) => lc(m?.handle) === who);
  if (!isMember || !Array.isArray(next?.posts) || !next.posts[0]) return next;
  return markContributed(next, next.posts[0].id, String(handle).trim(), {
    ...(quoteUrl ? { url: quoteUrl } : {}),
    now,
  });
}

/** postAssists(post) -> the post's assist array (empty when none). */
export function postAssists(post) {
  return Array.isArray(post?.assists) ? post.assists : [];
}

const timeOf = (iso) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/** latestPost(campaign) -> newest post by createdAt (later storage wins ties), or null. */
export function latestPost(campaign) {
  const posts = normalizeCampaign(campaign)?.posts;
  if (!Array.isArray(posts) || posts.length === 0) return null;
  let best = null, bestT = -Infinity;
  for (const p of posts) {
    const t = timeOf(p?.createdAt);
    if (t !== null && t >= bestT) { best = p; bestT = t; }
  }
  return best ?? posts[posts.length - 1];
}

/**
 * latestActivity(campaign) -> ISO string of the newest post OR assist
 * timestamp; falls back to campaign.createdAt (or "" when that is missing).
 */
export function latestActivity(campaign) {
  const c = normalizeCampaign(campaign);
  let best = null, bestT = -Infinity;
  const see = (iso) => {
    const t = timeOf(iso);
    if (t !== null && t > bestT) { best = iso; bestT = t; }
  };
  for (const p of Array.isArray(c?.posts) ? c.posts : []) {
    see(p?.createdAt);
    for (const a of postAssists(p)) see(a?.contributedAt);
  }
  return best ?? (isNonEmptyString(c?.createdAt) ? c.createdAt : "");
}

/**
 * unassistedPostsFor(campaign, handle) -> posts (newest first) that the
 * handle has not assisted. The handle's OWN posts are excluded: an author
 * does not owe their own post an assist. Feeds the home "your turn" list.
 */
export function unassistedPostsFor(campaign, handle) {
  const who = lc(handle);
  const posts = normalizeCampaign(campaign)?.posts;
  if (!who || !Array.isArray(posts)) return [];
  return posts
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => lc(p.author) !== who && !postAssists(p).some((a) => lc(a?.handle) === who))
    .sort((a, b) => (timeOf(b.p.createdAt) ?? 0) - (timeOf(a.p.createdAt) ?? 0) || b.i - a.i)
    .map(({ p }) => p);
}

// ---- URL recognition (pure: the URL string is the only input) ----

const HOSTS = [
  ["x", ["x.com", "twitter.com"]],
  ["bluesky", ["bsky.app"]],
  ["threads", ["threads.net", "threads.com"]],
  ["reddit", ["reddit.com"]],
  ["instagram", ["instagram.com"]],
  ["tiktok", ["tiktok.com"]],
  ["youtube", ["youtube.com", "youtu.be"]],
];

function parseUrl(url) {
  if (typeof url !== "string") return null;
  let s = url.trim();
  if (!s || /\s/.test(s)) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^/]+:\d+(\/|$)/.test(s)) return null;
    s = `https://${s}`;
  }
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

function platformOfHost(host) {
  const h = host.toLowerCase();
  for (const [platform, domains] of HOSTS) {
    if (domains.some((d) => h === d || h.endsWith(`.${d}`))) return platform;
  }
  return "other";
}

/** detectPlatform(url) -> x|bluesky|threads|reddit|instagram|tiktok|youtube|other. Hostname only; never throws, never fetches. */
export function detectPlatform(url) {
  const u = parseUrl(url);
  return u ? platformOfHost(u.hostname) : "other";
}

/**
 * parsePostUrl(url) -> { platform, author?, title?, text? }. Extracts ONLY
 * what the URL path itself carries: x `/<handle>/status/<id>` -> author;
 * reddit `/r/<sub>/comments/<id>/<slug>` -> title from the slug (best
 * effort, <= 120 chars). Everything else: platform only. Never throws,
 * never fetches. A convenience prefill, never a gate.
 */
export function parsePostUrl(url) {
  try {
    const u = parseUrl(url);
    if (!u) return { platform: "other" };
    const platform = platformOfHost(u.hostname);
    const parts = u.pathname.split("/").filter(Boolean);
    if (platform === "x") {
      const m = parts.length >= 3 && /^status(es)?$/i.test(parts[1]) && /^\w{1,15}$/.test(parts[0]) && parts[0].toLowerCase() !== "i";
      if (m) return { platform, author: `@${parts[0]}` };
    } else if (platform === "bluesky") {
      if (parts.length >= 4 && parts[0].toLowerCase() === "profile" && parts[2].toLowerCase() === "post" && parts[1]) {
        return { platform, author: `@${parts[1].replace(/^@/, "")}` };
      }
    } else if (platform === "threads") {
      if (parts.length >= 3 && parts[0].startsWith("@") && parts[1].toLowerCase() === "post") {
        return { platform, author: parts[0] };
      }
    } else if (platform === "tiktok") {
      if (parts.length >= 3 && parts[0].startsWith("@") && parts[1].toLowerCase() === "video") {
        return { platform, author: parts[0] };
      }
    } else if (platform === "reddit") {
      if (parts.length >= 5 && parts[0].toLowerCase() === "r" && parts[2].toLowerCase() === "comments" && parts[4]) {
        let slug = parts[4];
        try { slug = decodeURIComponent(slug); } catch { /* keep raw slug */ }
        const title = slug.replace(/[-_]+/g, " ").trim().slice(0, 120).trim();
        if (title) return { platform, title };
      }
    }
    return { platform };
  } catch {
    return { platform: "other" };
  }
}

/**
 * relativeTime(iso, now?) -> "just now" | "5m" | "2h" | "3d" | "Nov 20".
 * Feed-style relative timestamps. Invalid or missing input -> "" (the
 * caller hides the timestamp). Dates 7+ days old fall back to month+day.
 */
export function relativeTime(iso, now) {
  const t = Date.parse(iso);
  if (!iso || Number.isNaN(t)) return "";
  const base = toTime(now ?? new Date());
  const diff = base - t;
  if (diff < 0) return "just now";
  const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  if (diff < MIN) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** initials(name) -> up to 2 letters from the first two words ("Mary Jane" -> "MJ"). Handles lose the @. Empty -> "?". */
export function initials(name) {
  const clean = String(name ?? "").replace(/^@/, "").trim();
  if (!clean) return "?";
  const words = clean.split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export const AVATAR_HUES = 6;

/** avatarHue(value) -> 0..5, deterministic per string. Drives the .avatar-hN class. */
export function avatarHue(value) {
  const s = String(value ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % AVATAR_HUES;
}

/**
 * postedCount(campaign) — number of DISTINCT handles with at least one
 * assist anywhere in the ring (case-insensitive). NOT an assist count:
 * counting assists would be a ledger, which the hard don'ts ban. Name kept
 * for discovery; semantics are "ringmates who have contributed".
 */
export function postedCount(campaign) {
  const seen = new Set();
  for (const p of normalizeCampaign(campaign)?.posts ?? []) {
    for (const a of postAssists(p)) {
      const h = lc(a?.handle);
      if (h) seen.add(h);
    }
  }
  return seen.size;
}

function toTime(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string" || typeof v === "number") return new Date(v).getTime();
  return Date.now();
}

/** isLive(campaign, now?) — the window contains now; a campaign with no window is always live. */
export function isLive(campaign, now) {
  const t = toTime(now ?? new Date());
  if (!campaign?.window) return true;
  const start = Date.parse(campaign.window.start);
  const end = Date.parse(campaign.window.end);
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return t >= start && t <= end;
}

/** isUpcoming(campaign, now?) — the window starts in the future. No window: never upcoming. */
export function isUpcoming(campaign, now) {
  const t = toTime(now ?? new Date());
  if (!campaign?.window) return false;
  const start = Date.parse(campaign.window.start);
  if (Number.isNaN(start)) return false;
  return t < start;
}

// ---- base64url, portable (works in Node and browsers; no Buffer/btoa) ----
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 !== undefined) out += B64[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 !== undefined) out += B64[b2 & 0x3f];
  }
  return out.replace(/\+/g, "-").replace(/\//g, "_");
}

function base64urlDecode(str) {
  const clean = String(str).replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 === 1) {
    throw new Error("invalid base64url");
  }
  const bytes = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18)
      | (B64.indexOf(clean[i + 1] || "A") << 12)
      | (B64.indexOf(clean[i + 2] || "A") << 6)
      | B64.indexOf(clean[i + 3] || "A");
    if (n < 0 && clean[i] !== "=") throw new Error("invalid base64url");
    bytes.push((n >> 16) & 0xff);
    if (clean[i + 2] && clean[i + 2] !== "=") bytes.push((n >> 8) & 0xff);
    if (clean[i + 3] && clean[i + 3] !== "=") bytes.push(n & 0xff);
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/**
 * Link format: `<base>#c=<base64url(JSON)>[&k=<encodeURIComponent(key)>]`.
 * The campaign key rides in its OWN fragment param (`k`), never inside the
 * JSON payload and never in a query string. Fragments are not sent to the
 * server. The payload JSON is always key-free (encode strips `key`), so
 * anything that republishes the payload cannot leak it. base64url has no
 * '&', so `&` safely separates params.
 *
 * encodeCampaignLink(campaign, baseUrl) -> { url, long }. `long` is true
 * when the encoded payload exceeds 2000 chars (the link is still returned).
 */
export function encodeCampaignLink(campaign, baseUrl = "") {
  const { key, ...rest } = isObj(campaign) ? campaign : {};
  const payload = base64urlEncode(JSON.stringify(isObj(campaign) ? rest : campaign));
  const k = isNonEmptyString(key) ? `&k=${encodeURIComponent(key)}` : "";
  return { url: `${baseUrl}#c=${payload}${k}`, long: payload.length > LINK_LONG_LIMIT };
}

/**
 * decodeCampaignLink(hash) -> { campaign } or { error } — never throws.
 * Accepts a bare '#c=...' hash, a bare 'c=...' fragment, or a full URL
 * containing '#c='. A `k=` fragment param becomes campaign.key. Invalid
 * base64 / JSON / validation all yield { error } (messages never echo the
 * key).
 */
export function decodeCampaignLink(hash) {
  try {
    if (typeof hash !== "string" || !hash) return { error: "missing campaign link" };
    const idx = hash.indexOf("#c=");
    const frag = idx >= 0 ? hash.slice(idx + 1) : hash.startsWith("c=") ? hash : null;
    if (!frag) return { error: "no campaign payload in link" };
    const params = {};
    for (const part of frag.split("&")) {
      const eq = part.indexOf("=");
      if (eq > 0 && !(part.slice(0, eq) in params)) params[part.slice(0, eq)] = part.slice(eq + 1);
    }
    if (!params.c) return { error: "no campaign payload in link" };
    const campaign = normalizeCampaign(JSON.parse(base64urlDecode(params.c)));
    if (isNonEmptyString(params.k)) {
      let key = params.k;
      try { key = decodeURIComponent(params.k); } catch { /* keep raw */ }
      campaign.key = key;
    }
    const errors = validateCampaign(campaign);
    if (errors.length > 0) return { error: `invalid campaign: ${errors.join("; ")}` };
    return { campaign };
  } catch (e) {
    return { error: `could not decode campaign link: ${e.message}` };
  }
}
