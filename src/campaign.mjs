// V21 — Campaign object + link intent.
// Pure functions only. No DOM, no storage, no network, no posting.
// Campaign shape (frozen, see tasks/V21-campaign-core.md):
//   { id, game: { name, links: { steam?, itch?, x? }, tags: string[] },
//     title, anchorPost: { platform: 'x'|'bluesky'|'threads', url, text, author },
//     window: { start, end } | null,
//     members: [{ name, handle, platform?, status: 'posted'|'pending', quoteUrl? }],
//     createdAt, demo? }

export const PLATFORMS = Object.freeze(["x", "bluesky", "threads"]);
export const LINK_LONG_LIMIT = 2000;

const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;

function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

function randomId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  const buf = new Uint8Array(8);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(buf);
    for (const b of buf) s += chars[b % 36];
  } else {
    for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * 36)];
  }
  return `cmp_${s}`;
}

/**
 * validateCampaign(c) -> string[] (empty = valid).
 * Requires: game.name, at least one of game.links.steam / game.links.itch,
 * anchorPost.url + text + author (+ a known platform), title, members >= 1
 * each with name + handle. A non-null window needs valid start/end dates
 * with start <= end.
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
    const links = c.game.links || {};
    if (!isNonEmptyString(links.steam) && !isNonEmptyString(links.itch)) {
      errors.push("game.links: at least one of steam or itch is required");
    }
    if (c.game.tags !== undefined && !Array.isArray(c.game.tags)) {
      errors.push("game.tags: must be an array");
    }
  }
  if (!c.anchorPost || typeof c.anchorPost !== "object") {
    errors.push("anchorPost: missing");
  } else {
    if (!PLATFORMS.includes(c.anchorPost.platform)) {
      errors.push("anchorPost.platform: must be one of x, bluesky, threads");
    }
    if (!isNonEmptyString(c.anchorPost.url)) errors.push("anchorPost.url: missing");
    if (!isNonEmptyString(c.anchorPost.text)) errors.push("anchorPost.text: missing");
    if (!isNonEmptyString(c.anchorPost.author)) errors.push("anchorPost.author: missing");
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
      if (!isNonEmptyString(m.handle)) errors.push(`members[${i}].handle: missing`);
      if (m.status !== "posted" && m.status !== "pending") {
        errors.push(`members[${i}].status: must be 'posted' or 'pending'`);
      }
    });
  }
  if (!isNonEmptyString(c.createdAt) || Number.isNaN(Date.parse(c.createdAt))) {
    errors.push("createdAt: missing or not a valid date");
  }
  return errors;
}

/**
 * createCampaign({ game, title, anchorPost, window, creator?, me?, members?, demo? })
 * Validates, assigns id + createdAt. The creator is members[0] with status
 * 'pending'. The creator is supplied as `creator` (or `me`, same shape
 * { name, handle, platform? }); a `members` array may be passed instead, in
 * which case its first entry is the creator and is forced to 'pending'.
 * Throws an Error listing the validation failures.
 */
export function createCampaign(input = {}) {
  const { game, title, anchorPost, window: win = null, demo } = input;
  const creator = input.creator ?? input.me ?? null;
  let members = [];
  if (Array.isArray(input.members) && input.members.length > 0) {
    members = input.members.map((m) => ({
      name: m.name, handle: m.handle,
      ...(m.platform ? { platform: m.platform } : {}),
      status: "pending",
      ...(m.quoteUrl ? { quoteUrl: m.quoteUrl } : {}),
    }));
  } else if (creator) {
    members = [{
      name: creator.name, handle: creator.handle,
      ...(creator.platform ? { platform: creator.platform } : {}),
      status: "pending",
    }];
  }
  const campaign = {
    id: randomId(),
    game: {
      name: game?.name,
      links: { ...(game?.links || {}) },
      tags: Array.isArray(game?.tags) ? [...game.tags] : [],
    },
    title,
    anchorPost: anchorPost ? { ...anchorPost } : undefined,
    window: win ? { start: win.start, end: win.end } : null,
    members,
    createdAt: new Date().toISOString(),
    ...(demo === true ? { demo: true } : {}),
  };
  const errors = validateCampaign(campaign);
  if (errors.length > 0) {
    throw new Error(`Invalid campaign: ${errors.join("; ")}`);
  }
  return campaign;
}

/** addMember(campaign, { name, handle, platform? }) -> NEW campaign, no mutation. No-op (same content, new object) if the handle is already a member (case-insensitive). */
export function addMember(campaign, member) {
  const next = clone(campaign);
  const handle = String(member?.handle ?? "").trim();
  if (!handle) return next;
  const exists = (next.members || []).some(
    (m) => String(m.handle).trim().toLowerCase() === handle.toLowerCase(),
  );
  if (exists) return next;
  next.members = [...(next.members || []), {
    name: member.name, handle,
    ...(member.platform ? { platform: member.platform } : {}),
    status: "pending",
  }];
  return next;
}

/** markPosted(campaign, handle, quoteUrl?) -> NEW campaign; that member's status becomes 'posted'. Unknown handle: returns an unchanged copy. */
export function markPosted(campaign, handle, quoteUrl) {
  const next = clone(campaign);
  const target = String(handle ?? "").trim().toLowerCase();
  next.members = (next.members || []).map((m) => {
    if (String(m.handle).trim().toLowerCase() !== target) return m;
    const updated = { ...m, status: "posted" };
    if (quoteUrl) updated.quoteUrl = quoteUrl;
    return updated;
  });
  return next;
}

export function postedCount(campaign) {
  return (campaign?.members || []).filter((m) => m.status === "posted").length;
}

export function pendingMembers(campaign) {
  return (campaign?.members || []).filter((m) => m.status !== "posted");
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
 * encodeCampaignLink(campaign, baseUrl) -> { url, long }.
 * url is baseUrl + '#c=' + base64url(JSON). long is true when the encoded
 * payload exceeds 2000 chars (the link is still returned).
 */
export function encodeCampaignLink(campaign, baseUrl = "") {
  const payload = base64urlEncode(JSON.stringify(campaign));
  return { url: `${baseUrl}#c=${payload}`, long: payload.length > LINK_LONG_LIMIT };
}

/**
 * decodeCampaignLink(hash) -> { campaign } or { error } — never throws.
 * Accepts a bare '#c=...' hash, a bare 'c=...' fragment, or a full URL
 * containing '#c='. Invalid base64 / JSON / validation all yield { error }.
 */
export function decodeCampaignLink(hash) {
  try {
    if (typeof hash !== "string" || !hash) return { error: "missing campaign link" };
    const idx = hash.indexOf("#c=");
    const payload = idx >= 0 ? hash.slice(idx + 3) : hash.startsWith("c=") ? hash.slice(2) : null;
    if (!payload) return { error: "no campaign payload in link" };
    const campaign = JSON.parse(base64urlDecode(payload));
    const errors = validateCampaign(campaign);
    if (errors.length > 0) return { error: `invalid campaign: ${errors.join("; ")}` };
    return { campaign };
  } catch (e) {
    return { error: `could not decode campaign link: ${e.message}` };
  }
}
