// V43b — Nostr sync for the sustained ring with shared campaign keypair + removal
// (spec: cabal-bench/redesign-sustained-ring.md §16, §17).
// Pure functions + a vanilla-WebSocket relay client + mount() for the sync panel.
// No npm deps, no backend. DOM only in mount().
//
// KEY / PRIVACY RULES (hard):
//  - The keypair belongs to the CAMPAIGN, never the user. No accounts, no per-user
//    vault, no key onboarding, no nsec shown to the user.
//  - The campaign `key` lives on the campaign object (localStorage) and in the invite
//    link URL fragment ONLY. It is NEVER published in any relay event, NEVER put in a
//    URL query param, NEVER logged, NEVER in data/campaigns.json or campaigns.atom.
//  - Anything on a public relay is public, and Nostr events cannot be reliably deleted.

import {
  getPublicKey, generateSecretKey, isValidSecretKey, sign, verify, sha256,
  bytesToHex, hexToBytes,
} from "./nostr-schnorr.mjs";

export const KIND_CAMPAIGN = 30078;
export const KIND_NOTE = 1;
export const STORAGE_KEYS = Object.freeze({
  relays: "cabal.v2.relays",
});

// V47: relay.nostr.band was dropped — it timed out twice from a live browser
// (Nov 23 2026) while damus and nos.lol answered. Add it back only after a
// fresh live check. KNOWN_DEAD_RELAYS is what the tests pin the defaults against.
export const DEFAULT_RELAYS = Object.freeze([
  "wss://relay.damus.io",
  "wss://nos.lol",
]);
export const KNOWN_DEAD_RELAYS = Object.freeze(["wss://relay.nostr.band"]);

export const PRIVACY_LINE = "Anything on a public relay is public, and it can't be reliably deleted.";

export const COPY = Object.freeze({
  privacy: PRIVACY_LINE,
});

// ---------------------------------------------------------------------------
// bech32 (BIP-173 checksum, NIP-19 usage: no 90-char limit)
// ---------------------------------------------------------------------------
const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values) {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk >>> 0;
}
const hrpExpand = (hrp) => [
  ...[...hrp].map((c) => c.charCodeAt(0) >>> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31),
];
function convertBits(data, from, to, pad) {
  let acc = 0, bits = 0;
  const out = [], maxv = (1 << to) - 1;
  for (const v of data) {
    if (v < 0 || v >> from) return null;
    acc = (acc << from) | v; bits += from;
    while (bits >= to) { bits -= to; out.push((acc >> bits) & maxv); }
  }
  if (pad) { if (bits) out.push((acc << (to - bits)) & maxv); }
  else if (bits >= from || ((acc << (to - bits)) & maxv)) return null;
  return out;
}
export function bech32Encode(hrp, bytes) {
  const data = convertBits([...bytes], 8, 5, true);
  const chk = polymod([...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
  const check = [0, 1, 2, 3, 4, 5].map((i) => (chk >>> (5 * (5 - i))) & 31);
  return hrp + "1" + [...data, ...check].map((d) => CHARSET[d]).join("");
}
/** -> { hrp, bytes } or null on any malformed/mis-checksummed input. */
export function bech32Decode(str) {
  if (typeof str !== "string") return null;
  const s = str.trim();
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return null;
  const l = s.toLowerCase();
  const pos = l.lastIndexOf("1");
  if (pos < 1 || pos + 7 > l.length) return null;
  const hrp = l.slice(0, pos);
  const data = [];
  for (const c of l.slice(pos + 1)) {
    const i = CHARSET.indexOf(c);
    if (i < 0) return null;
    data.push(i);
  }
  if (polymod([...hrpExpand(hrp), ...data]) !== 1) return null;
  const bytes = convertBits(data.slice(0, -6), 5, 8, false);
  return bytes ? { hrp, bytes: Uint8Array.from(bytes) } : null;
}

export const npubEncode = (pubHex) => bech32Encode("npub", hexToBytes(pubHex));
export function npubDecode(npub) {
  const d = bech32Decode(npub);
  return d && d.hrp === "npub" && d.bytes.length === 32 ? bytesToHex(d.bytes) : null;
}

/** NIP-19 naddr for a campaign: the short pointer a #c= link can carry. */
export function naddrEncode({ identifier, pubkey, kind = KIND_CAMPAIGN, relays = [] }) {
  const enc = new TextEncoder();
  const tlv = (t, v) => [t, v.length, ...v];
  const k = [(kind >>> 24) & 255, (kind >>> 16) & 255, (kind >>> 8) & 255, kind & 255];
  const bytes = [
    ...tlv(0, enc.encode(identifier)),
    ...relays.flatMap((r) => tlv(1, enc.encode(r))),
    ...tlv(2, hexToBytes(pubkey)),
    ...tlv(3, k),
  ];
  return bech32Encode("naddr", Uint8Array.from(bytes));
}
export function naddrDecode(str) {
  const d = bech32Decode(str);
  if (!d || d.hrp !== "naddr") return null;
  const out = { identifier: null, pubkey: null, kind: null, relays: [] };
  const b = d.bytes, dec = new TextDecoder();
  for (let i = 0; i < b.length;) {
    const t = b[i], len = b[i + 1];
    if (i + 2 + len > b.length) return null;
    const v = b.slice(i + 2, i + 2 + len);
    if (t === 0) out.identifier = dec.decode(v);
    else if (t === 1) out.relays.push(dec.decode(v));
    else if (t === 2 && len === 32) out.pubkey = bytesToHex(v);
    else if (t === 3 && len === 4) out.kind = ((v[0] << 24) | (v[1] << 16) | (v[2] << 8) | v[3]) >>> 0;
    i += 2 + len;
  }
  return out.identifier != null && out.pubkey && out.kind != null ? out : null;
}

// ---------------------------------------------------------------------------
// Campaign keypair (shared per campaign; invisible to users)
// ---------------------------------------------------------------------------
// Seam with V43a: `campaign.key` is an opaque 64-char lowercase hex secp256k1
// secret key stored on the campaign object (persisted in cabal.v2.campaigns).
//  - On create: pass `key: generateCampaignKey().key` to createCampaign().
//  - On join via invite link: the fragment carries the key, stored on campaign.key.
//  - On discovery (public list / naddr without key): campaign.key is absent (read-only).

export function isValidCampaignKey(key) {
  return typeof key === "string" && /^[0-9a-f]{64}$/.test(key) && isValidSecretKey(key);
}

export function hasCampaignKey(campaign) {
  return Boolean(campaign && isValidCampaignKey(campaign.key));
}

/** Generate a fresh campaign keypair: { key, pubkey }. Pure; never touches storage. */
export function generateCampaignKey() {
  const key = generateSecretKey();
  return { key, pubkey: getPublicKey(key) };
}

/**
 * Derive { key, pubkey } from campaign.key when valid, or generate a fresh
 * keypair when missing. Pure: never mutates `campaign`.
 */
export function campaignKeypair(campaign) {
  if (hasCampaignKey(campaign)) {
    return { key: campaign.key, pubkey: getPublicKey(campaign.key) };
  }
  return generateCampaignKey();
}

/** Authoritative pubkey for a campaign: derived from campaign.key, else campaign.nostr.pubkey. */
export function campaignPubkey(campaign) {
  if (hasCampaignKey(campaign)) return getPublicKey(campaign.key);
  return typeof campaign?.nostr?.pubkey === "string" && /^[0-9a-f]{64}$/.test(campaign.nostr.pubkey)
    ? campaign.nostr.pubkey
    : null;
}

/**
 * Short-link URL fragment for a campaign (#c=<naddr>[&k=<key>]).
 * The key lives in the URL fragment ONLY — never in a query string (?k=...).
 */
export function campaignLinkFragment(campaign, relays = []) {
  const pubkey = campaignPubkey(campaign);
  if (!pubkey || !campaign?.id) throw new Error("campaignLinkFragment needs a campaign id and pubkey");
  const naddr = naddrEncode({ identifier: `cabal:${campaign.id}`, pubkey, relays });
  return hasCampaignKey(campaign) ? `#c=${naddr}&k=${campaign.key}` : `#c=${naddr}`;
}

/**
 * Parse a #c=<naddr>[&k=<key>] fragment (or full URL). Reads ONLY the fragment
 * after `#`, ignoring any query string so a key in `?` is never accepted.
 */
export function parseCampaignLinkFragment(input) {
  if (typeof input !== "string") return null;
  const hashIdx = input.indexOf("#");
  const frag = hashIdx >= 0 ? input.slice(hashIdx + 1) : input;
  const params = new URLSearchParams(frag);
  const naddr = params.get("c");
  if (!naddr) return null;
  const decoded = naddrDecode(naddr);
  if (!decoded || !decoded.identifier.startsWith("cabal:")) return null;
  const rawKey = params.get("k");
  const key = isValidCampaignKey(rawKey) ? rawKey : null;
  return { naddr, decoded, campaignId: decoded.identifier.slice(6), pubkey: decoded.pubkey, relays: decoded.relays, key };
}

// ---------------------------------------------------------------------------
// Storage helpers (relays only — no per-user key store)
// ---------------------------------------------------------------------------
function storageOf(storage) {
  if (storage) return storage;
  try { if (globalThis.localStorage?.getItem) return globalThis.localStorage; } catch { /* none */ }
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const readJson = (st, k, fb) => { try { const r = st.getItem(k); return r == null ? fb : JSON.parse(r); } catch { return fb; } };
const writeJson = (st, k, v) => { try { st.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

// ---------------------------------------------------------------------------
// Events (NIP-01) — all signed with the CAMPAIGN key
// ---------------------------------------------------------------------------
export const campaignAddress = (pubkey, campaignId) => `${KIND_CAMPAIGN}:${pubkey}:cabal:${campaignId}`;
const nowSec = () => Math.floor(Date.now() / 1000);

export async function eventId(ev) {
  const ser = JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]);
  return bytesToHex(await sha256(ser));
}

/** template {kind,tags,content,created_at?} + campaign key -> signed event. */
export async function signEvent(template, skHex) {
  const pubkey = getPublicKey(skHex);
  const ev = {
    pubkey, created_at: template.created_at ?? nowSec(), kind: template.kind,
    tags: template.tags ?? [], content: template.content ?? "",
  };
  ev.id = await eventId(ev);
  ev.sig = await sign(ev.id, skHex);
  return ev;
}

/** Structure + id + signature check. Never throws. */
export async function verifyEvent(ev) {
  try {
    if (!ev || typeof ev !== "object") return false;
    if (!/^[0-9a-f]{64}$/.test(ev.id ?? "") || !/^[0-9a-f]{64}$/.test(ev.pubkey ?? "") || !/^[0-9a-f]{128}$/.test(ev.sig ?? "")) return false;
    if (!Number.isInteger(ev.created_at) || !Number.isInteger(ev.kind) || typeof ev.content !== "string") return false;
    if (!Array.isArray(ev.tags) || !ev.tags.every((t) => Array.isArray(t) && t.every((x) => typeof x === "string"))) return false;
    if ((await eventId(ev)) !== ev.id) return false;
    return await verify(ev.sig, ev.id, ev.pubkey);
  } catch { return false; }
}

// Public sync fields only. Both `nostr` (local bookkeeping) and `key` (the
// shared campaign write credential) are ALWAYS stripped before publishing.
const stripLocal = (o) => { const { nostr, key, ...rest } = o ?? {}; return rest; };

/**
 * Campaign event: kind 30078, d = cabal:<id>. Content = campaign v2 JSON
 * (including `createdBy` and `removedMembers` when present) WITHOUT `key`
 * or `nostr`. Signed with the campaign key.
 */
export function campaignEvent(campaign, { createdAt } = {}) {
  const c = stripLocal(campaign);
  c.posts = (campaign.posts ?? []).map((p) => ({
    ...stripLocal(p),
    assists: (p.assists ?? []).map(stripLocal),
  }));
  return {
    kind: KIND_CAMPAIGN,
    created_at: createdAt ?? nowSec(),
    tags: [["d", `cabal:${campaign.id}`], ["t", "cabal"]],
    content: JSON.stringify(c),
  };
}

/**
 * Removal event: kind 30078 republish of the campaign with updated `members`
 * and `removedMembers`, WITHOUT `key`, and guaranteed strictly newer
 * `created_at` than the previous campaign event when `createdAt` is omitted.
 */
export function removalEvent(campaign, { createdAt } = {}) {
  const minCreatedAt = (campaign?.nostr?.createdAt ?? 0) + 1;
  const ts = createdAt ?? Math.max(nowSec(), minCreatedAt);
  return campaignEvent(campaign, { createdAt: ts });
}

/** Post event: kind 1, `a` -> campaign. Content = post JSON (no assists, no key). */
export function postEvent(campaign, post, { campaignPubkey: pkOpt, createdAt } = {}) {
  const pk = pkOpt ?? campaignPubkey(campaign);
  if (!pk) throw new Error("postEvent needs the campaign's pubkey");
  const { assists, ...rest } = stripLocal(post);
  return {
    kind: KIND_NOTE,
    created_at: createdAt ?? nowSec(),
    tags: [["a", campaignAddress(pk, campaign.id)], ["t", "cabal"], ["cabal-post", post.id]],
    content: JSON.stringify(rest),
  };
}

/**
 * Enscryption event: kind 1, `e` -> post event (when its id is known), `a` -> campaign.
 * Carries `cabal-post` = the post's id so merge matches even when the post only
 * lived inside the campaign JSON.
 */
export function encryptionEvent(campaign, post, assist, { campaignPubkey: pkOpt, postEventId, createdAt } = {}) {
  const pk = pkOpt ?? campaignPubkey(campaign);
  if (!pk) throw new Error("encryptionEvent needs the campaign's pubkey");
  const evId = postEventId ?? post?.nostr?.eventId;
  const tags = [];
  if (evId) tags.push(["e", evId]);
  tags.push(["a", campaignAddress(pk, campaign.id)], ["t", "cabal"], ["cabal-post", post.id]);
  const { handle, note, url, quoteText, status, contributedAt } = stripLocal(assist);
  return {
    kind: KIND_NOTE, created_at: createdAt ?? nowSec(), tags,
    content: JSON.stringify({ handle, status, contributedAt, ...(note != null && { note }), ...(url && { url }), ...(quoteText && { quoteText }) }),
  };
}

const tagVal = (ev, name) => ev.tags.find((t) => t[0] === name)?.[1];
const parseJson = (s) => { try { const v = JSON.parse(s); return v && typeof v === "object" && !Array.isArray(v) ? v : null; } catch { return null; } };

/** Signed event -> { type, campaignId, campaignPubkey, postId?, data } | null. */
export function decodeEvent(ev) {
  if (!ev || !Array.isArray(ev.tags)) return null;
  if (ev.kind === KIND_CAMPAIGN) {
    const d = tagVal(ev, "d");
    if (!d || !d.startsWith("cabal:")) return null;
    const data = parseJson(ev.content);
    return data ? { type: "campaign", campaignId: d.slice(6), campaignPubkey: ev.pubkey, data } : null;
  }
  if (ev.kind === KIND_NOTE) {
    const a = tagVal(ev, "a");
    const m = /^30078:([0-9a-f]{64}):cabal:(.+)$/.exec(a ?? "");
    const postId = tagVal(ev, "cabal-post");
    const data = parseJson(ev.content);
    if (!m || !data || !postId) return null;
    return { type: "handle" in data ? "assist" : "post", campaignId: m[2], campaignPubkey: m[1], postId, postEventId: tagVal(ev, "e"), data };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Merge (pure, idempotent) + client-side removal enforcement (§16b, §17c)
// ---------------------------------------------------------------------------
const PLATFORMS = ["x", "bluesky", "threads", "reddit", "instagram", "tiktok", "youtube", "other"];
const isHttp = (u) => { try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; } };
const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : undefined);
const iso = (v) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : undefined);
const cloneCampaign = (c) => JSON.parse(JSON.stringify(c));
const handleKey = (h) => String(h ?? "").trim().toLowerCase();

function cleanPost(d, fallbackCreated) {
  if (!/^pst_[a-z0-9]{3,32}$/.test(d?.id ?? "") || !str(d.author, 80) || !isHttp(d.url)) return null;
  const p = {
    id: d.id, author: str(d.author, 80), platform: PLATFORMS.includes(d.platform) ? d.platform : "other",
    url: d.url, createdAt: iso(d.createdAt) ?? fallbackCreated,
  };
  for (const [k, max] of [["authorName", 80], ["text", 2000], ["kind", 20]]) { const v = str(d[k], max); if (v) p[k] = v; }
  return p;
}
function cleanAssist(d) {
  const handle = str(d?.handle, 80)?.trim();
  if (!handle || !iso(d.contributedAt)) return null;
  const a = { handle, status: "contributed", contributedAt: d.contributedAt };
  if (d.url && isHttp(d.url)) a.url = d.url;
  for (const [k, max] of [["quoteText", 2000], ["note", 280]]) { const v = str(d[k], max); if (v != null) a[k] = v; }
  return a;
}
function cleanRemovedMembers(list) {
  if (!Array.isArray(list)) return [];
  const byHandle = new Map();
  for (const r of list) {
    const handle = str(r?.handle, 80)?.trim();
    const removedAt = iso(r?.removedAt);
    if (!handle || !removedAt) continue;
    const removedBy = str(r?.removedBy, 80)?.trim();
    const entry = { handle, removedAt, ...(removedBy ? { removedBy } : {}) };
    const k = handleKey(handle);
    const prev = byHandle.get(k);
    if (!prev || Date.parse(removedAt) >= Date.parse(prev.removedAt)) byHandle.set(k, entry);
  }
  return [...byHandle.values()];
}

/**
 * True when `handle` is in `campaign.removedMembers` AND `timestamp`
 * (Unix seconds number or ISO string) is strictly after `removedAt`.
 * Past writes (timestamp <= removedAt) return false so history stays.
 */
export function isRemovedAt(campaign, handle, timestamp) {
  if (!campaign || !handle || !Array.isArray(campaign.removedMembers)) return false;
  const key = handleKey(handle);
  const entry = campaign.removedMembers.find((r) => r && handleKey(r.handle) === key);
  if (!entry) return false;
  const removedMs = Date.parse(entry.removedAt);
  if (Number.isNaN(removedMs)) return false;
  const tsMs = typeof timestamp === "number" ? timestamp * 1000 : Date.parse(timestamp);
  if (Number.isNaN(tsMs)) return false;
  return tsMs > removedMs;
}

function pruneRemovedFutureWrites(c) {
  if (!Array.isArray(c.removedMembers) || !c.removedMembers.length) return;
  c.posts = (c.posts ?? []).filter((p) => !isRemovedAt(c, p.author, p.nostr?.createdAt ?? p.createdAt));
  for (const p of c.posts) {
    if (Array.isArray(p.assists)) {
      p.assists = p.assists.filter((a) => !isRemovedAt(c, a.handle, a.nostr?.createdAt ?? a.contributedAt));
    }
  }
}

/**
 * applyRelayEvents(localCampaigns, events, opts?) -> { campaigns, applied, rejected, seenIds }
 *  - All events for a campaign must be signed with the campaign's keypair.
 *  - Idempotent and order-independent. Dedupes by event id.
 *  - Campaign event replaces metadata (including `members`, `createdBy`,
 *    `removedMembers`) only when `created_at` is newer.
 *  - Local `campaign.key` is NEVER overwritten or adopted from a relay event.
 *  - Removal enforcement (§17c): future writes (posts/assists) from handles
 *    in `removedMembers` with `created_at` after `removedAt` are dropped;
 *    past content stays.
 */
export function applyRelayEvents(localCampaigns, events, opts = {}) {
  const campaigns = (Array.isArray(localCampaigns) ? localCampaigns : []).map(cloneCampaign);
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  const seen = new Set();
  const rejected = [];
  let applied = 0;
  const decoded = [];
  for (const ev of Array.isArray(events) ? events : []) {
    if (!ev?.id || seen.has(ev.id)) continue;
    seen.add(ev.id);
    const d = decodeEvent(ev);
    if (!d) { rejected.push({ id: ev.id, reason: "undecodable" }); continue; }
    decoded.push({ ev, d });
  }
  const rank = { campaign: 0, post: 1, assist: 2 };
  decoded.sort((x, y) => rank[x.d.type] - rank[y.d.type] || x.ev.created_at - y.ev.created_at || (x.ev.id < y.ev.id ? -1 : 1));

  const sameAuthority = (c, pk) => {
    const known = campaignPubkey(c);
    return !known || known === pk;
  };

  for (const { ev, d } of decoded) {
    if (d.type === "campaign") {
      const raw = d.data;
      if (raw.id !== undefined && raw.id !== d.campaignId) { rejected.push({ id: ev.id, reason: "id-mismatch" }); continue; }
      let c = byId.get(d.campaignId);
      if (!c) {
        if (opts.wantIds && !opts.wantIds.includes(d.campaignId)) { rejected.push({ id: ev.id, reason: "not-wanted" }); continue; }
        c = { id: d.campaignId, posts: [], members: [], removedMembers: [], createdAt: iso(raw.createdAt) ?? new Date(ev.created_at * 1000).toISOString() };
        campaigns.push(c); byId.set(c.id, c);
      } else if (!sameAuthority(c, ev.pubkey)) { rejected.push({ id: ev.id, reason: "wrong-author" }); continue; }
      const have = c.nostr?.createdAt ?? 0;
      const first = !c.nostr;
      if (!first && ev.created_at <= have) { rejected.push({ id: ev.id, reason: "stale" }); continue; }
      const localKey = c.key;
      // metadata replace (never `key`, never the posts array wholesale)
      for (const k of ["game", "title", "members", "window", "anchorPost", "demo"]) if (k in raw) c[k] = raw[k];
      if (typeof raw.createdBy === "string" && raw.createdBy.trim()) c.createdBy = str(raw.createdBy, 80).trim();
      if ("removedMembers" in raw) c.removedMembers = cleanRemovedMembers(raw.removedMembers);
      if (typeof raw.createdAt === "string" && !c.createdAt) c.createdAt = raw.createdAt;
      if (localKey !== undefined) c.key = localKey; else delete c.key;
      c.nostr = { pubkey: ev.pubkey, eventId: ev.id, createdAt: ev.created_at };
      c.posts = c.posts ?? [];
      for (const rp of Array.isArray(raw.posts) ? raw.posts : []) {
        const p = cleanPost(rp, c.createdAt);
        if (!p) continue;
        if (isRemovedAt(c, p.author, p.createdAt)) continue;
        const i = c.posts.findIndex((x) => x.id === p.id);
        const assists = (Array.isArray(rp.assists) ? rp.assists : []).map(cleanAssist).filter(Boolean);
        if (i < 0) c.posts.push({ ...p, assists: [] });
        const post = c.posts.find((x) => x.id === p.id);
        post.assists = post.assists ?? [];
        for (const a of assists) {
          if (isRemovedAt(c, a.handle, a.contributedAt)) continue;
          if (!post.assists.some((x) => handleKey(x.handle) === handleKey(a.handle))) post.assists.push(a);
        }
      }
      pruneRemovedFutureWrites(c);
      c.posts.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || (a.id < b.id ? -1 : 1));
      if (opts.normalize) {
        const n = opts.normalize(c);
        if (n) {
          if (localKey !== undefined) n.key = localKey; else delete n.key;
          byId.set(c.id, n);
          campaigns[campaigns.indexOf(c)] = n;
        }
      }
      applied++;
      continue;
    }

    const c = byId.get(d.campaignId);
    if (!c) { rejected.push({ id: ev.id, reason: "orphan" }); continue; }
    // Shared campaign key: every event must be signed by the campaign's pubkey.
    if (ev.pubkey !== d.campaignPubkey || !sameAuthority(c, ev.pubkey)) {
      rejected.push({ id: ev.id, reason: "wrong-author" });
      continue;
    }
    if (d.type === "post") {
      const p = cleanPost(d.data, new Date(ev.created_at * 1000).toISOString());
      if (!p || p.id !== d.postId) { rejected.push({ id: ev.id, reason: "bad-post" }); continue; }
      if (isRemovedAt(c, p.author, ev.created_at)) { rejected.push({ id: ev.id, reason: "removed-member" }); continue; }
      const i = c.posts.findIndex((x) => x.id === p.id);
      const meta = { pubkey: ev.pubkey, eventId: ev.id, createdAt: ev.created_at };
      if (i < 0) { c.posts.push({ ...p, assists: [], nostr: meta }); applied++; }
      else {
        const old = c.posts[i];
        if (old.nostr?.createdAt >= ev.created_at && old.nostr?.eventId !== ev.id) { rejected.push({ id: ev.id, reason: "stale" }); continue; }
        c.posts[i] = { ...old, ...p, assists: old.assists ?? [], nostr: meta }; applied++;
      }
      c.posts.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || (a.id < b.id ? -1 : 1));
    } else {
      let post = c.posts.find((x) => x.id === d.postId) ?? (d.postEventId ? c.posts.find((x) => x.nostr?.eventId === d.postEventId) : null);
      if (!post) { rejected.push({ id: ev.id, reason: "orphan-post" }); continue; }
      const a = cleanAssist(d.data);
      if (!a) { rejected.push({ id: ev.id, reason: "bad-assist" }); continue; }
      if (isRemovedAt(c, a.handle, ev.created_at)) { rejected.push({ id: ev.id, reason: "removed-member" }); continue; }
      const r = upsertAssist(post, a, ev.pubkey, ev.created_at, ev.id);
      if (r === true) applied++; else rejected.push({ id: ev.id, reason: r });
    }
  }
  return { campaigns, applied, rejected, seenIds: [...seen] };
}

function upsertAssist(post, a, pubkey, createdAt, eventId) {
  post.assists = post.assists ?? [];
  const i = post.assists.findIndex((x) => handleKey(x.handle) === handleKey(a.handle));
  const meta = { pubkey, createdAt, ...(eventId && { eventId }) };
  if (i < 0) { post.assists.push({ ...a, nostr: meta }); return true; }
  const old = post.assists[i];
  if (old.nostr && old.nostr.createdAt >= createdAt && old.nostr.eventId !== eventId) return "stale";
  post.assists[i] = { ...old, ...a, nostr: meta };
  return true;
}

/**
 * Offline fallback: a link snapshot (campaign decoded from #c=) is just a
 * campaign. It loads with no relay at all, and later relay events merge on
 * top without clobbering it. Returns the campaigns list including the snapshot.
 */
export function loadSnapshot(localCampaigns, snapshot) {
  if (!snapshot || typeof snapshot !== "object" || !snapshot.id) return localCampaigns ?? [];
  const list = Array.isArray(localCampaigns) ? localCampaigns : [];
  return list.some((c) => c.id === snapshot.id) ? list : [...list, cloneCampaign(snapshot)];
}

/** Relay filters to fetch a campaign. Without the campaign pubkey we find the campaign event first. */
export function filtersForCampaign(campaignId, pubkey) {
  const f = [{ kinds: [KIND_CAMPAIGN], "#d": [`cabal:${campaignId}`] }];
  if (pubkey) {
    f[0].authors = [pubkey];
    f.push({ kinds: [KIND_NOTE], authors: [pubkey], "#a": [campaignAddress(pubkey, campaignId)] });
  }
  return f;
}

// ---------------------------------------------------------------------------
// Relay list (localStorage cabal.v2.relays)
// ---------------------------------------------------------------------------
export function normalizeRelayUrl(u) {
  try {
    const url = new URL(String(u).trim());
    if (url.protocol !== "wss:" && url.protocol !== "ws:") return null;
    if (url.protocol === "ws:" && !/^(localhost|127\.0\.0\.1)$/.test(url.hostname)) return null;
    return url.href.replace(/\/$/, "");
  } catch { return null; }
}
/** { configured:boolean, relays:string[] } — "never configured" is distinct from an empty list the user chose. */
export function loadRelays(storage) {
  const st = storageOf(storage);
  const raw = readJson(st, STORAGE_KEYS.relays, null);
  if (!Array.isArray(raw)) return { configured: false, relays: [] };
  return { configured: true, relays: [...new Set(raw.map(normalizeRelayUrl).filter(Boolean))] };
}
export function saveRelays(relays, storage) {
  const list = [...new Set((relays ?? []).map(normalizeRelayUrl).filter(Boolean))];
  writeJson(storageOf(storage), STORAGE_KEYS.relays, list);
  return list;
}
export const addRelay = (url, storage) => {
  const u = normalizeRelayUrl(url);
  if (!u) return { ok: false, error: "Relay addresses start with wss://" };
  return { ok: true, relays: saveRelays([...loadRelays(storage).relays, u], storage) };
};
export const removeRelay = (url, storage) => saveRelays(loadRelays(storage).relays.filter((r) => r !== url), storage);
/** Opt-in: the user taps "Use the suggested relays". Nothing is published until they do. */
export const useDefaultRelays = (storage) => saveRelays([...DEFAULT_RELAYS], storage);

// ---------------------------------------------------------------------------
// Relay client (vanilla WebSocket; best-effort; a down relay never throws)
// ---------------------------------------------------------------------------
export function createRelayClient({ relays = [], WebSocketImpl = globalThis.WebSocket, timeoutMs = 6000, onStatus } = {}) {
  const conns = new Map();
  const state = {};
  const setState = (u, s) => { state[u] = s; try { onStatus?.({ ...state }); } catch { /* ui bug must not break sync */ } };

  function connect(url) {
    if (conns.has(url)) return conns.get(url).ready;
    const c = { ws: null, listeners: new Set() };
    c.ready = new Promise((resolve) => {
      let settled = false;
      const done = (ok) => { if (!settled) { settled = true; clearTimeout(timer); setState(url, ok ? "connected" : "unreachable"); if (!ok) conns.delete(url); resolve(ok ? c : null); } };
      const timer = setTimeout(() => { try { c.ws?.close(); } catch { /* ignore */ } done(false); }, timeoutMs);
      setState(url, "connecting");
      try {
        if (!WebSocketImpl) return done(false);
        c.ws = new WebSocketImpl(url);
        c.ws.onopen = () => done(true);
        c.ws.onerror = () => done(false);
        c.ws.onclose = () => { if (!settled) done(false); else { conns.delete(url); setState(url, "unreachable"); } };
        c.ws.onmessage = (m) => { let msg; try { msg = JSON.parse(m.data); } catch { return; } for (const l of c.listeners) l(msg); };
      } catch { done(false); }
    });
    conns.set(url, c);
    return c.ready;
  }
  const rid = () => Math.random().toString(36).slice(2, 10);

  return {
    status: () => ({ ...state }),
    async publish(ev) {
      const results = {};
      await Promise.all(relays.map(async (url) => {
        const c = await connect(url);
        if (!c) { results[url] = { ok: false, message: "unreachable" }; return; }
        results[url] = await new Promise((resolve) => {
          const t = setTimeout(() => { c.listeners.delete(l); resolve({ ok: false, message: "no reply" }); }, timeoutMs);
          const l = (msg) => { if (msg[0] === "OK" && msg[1] === ev.id) { clearTimeout(t); c.listeners.delete(l); resolve({ ok: !!msg[2], message: String(msg[3] ?? "") }); } };
          c.listeners.add(l);
          try { c.ws.send(JSON.stringify(["EVENT", ev])); } catch { clearTimeout(t); c.listeners.delete(l); resolve({ ok: false, message: "send failed" }); }
        });
      }));
      return results;
    },
    async fetch(filters, { waitMs = timeoutMs } = {}) {
      const byId = new Map();
      await Promise.all(relays.map(async (url) => {
        const c = await connect(url);
        if (!c) return;
        const sub = rid();
        await new Promise((resolve) => {
          const pending = [];
          const finish = async () => { clearTimeout(t); c.listeners.delete(l); try { c.ws.send(JSON.stringify(["CLOSE", sub])); } catch { /* ignore */ } await Promise.all(pending); resolve(); };
          const t = setTimeout(finish, waitMs);
          const l = (msg) => {
            if (msg[1] !== sub) return;
            if (msg[0] === "EVENT" && msg[2] && !byId.has(msg[2].id)) {
              pending.push(verifyEvent(msg[2]).then((ok) => { if (ok) byId.set(msg[2].id, msg[2]); }));
            } else if (msg[0] === "EOSE" || msg[0] === "CLOSED") finish();
          };
          c.listeners.add(l);
          try { c.ws.send(JSON.stringify(["REQ", sub, ...filters])); } catch { finish(); }
        });
      }));
      return [...byId.values()];
    },
    close() { for (const c of conns.values()) { try { c.ws?.close(); } catch { /* ignore */ } } conns.clear(); },
  };
}

/** Honest one-line status: "never configured" | "unreachable" | "connected (n of m)" | "not tried yet". */
export function relayStatus(configured, relays, statusMap) {
  if (!configured || !relays.length) return { label: "Never configured", kind: "none" };
  const vals = relays.map((r) => statusMap?.[r]);
  const up = vals.filter((v) => v === "connected").length;
  if (up) return { label: `Connected to ${up} of ${relays.length}`, kind: "ok" };
  if (vals.every((v) => v === "unreachable")) return { label: "Relays unreachable — your ring still works from this browser", kind: "down" };
  if (vals.some((v) => v === "connecting")) return { label: "Connecting…", kind: "wait" };
  return { label: "Not tried yet", kind: "idle" };
}

/**
 * One sync pass for one campaign: fetch -> merge. Returns the new campaigns
 * list; on any relay trouble it returns local state untouched (best-effort).
 */
export async function syncCampaign(client, localCampaigns, campaignId, pubkey, opts = {}) {
  const local = localCampaigns ?? [];
  try {
    const known = pubkey ?? campaignPubkey(local.find((c) => c.id === campaignId));
    let events = await client.fetch(filtersForCampaign(campaignId, known));
    if (!known) {
      const camp = events.find((e) => e.kind === KIND_CAMPAIGN);
      if (camp) events = events.concat(await client.fetch(filtersForCampaign(campaignId, camp.pubkey)));
    }
    return applyRelayEvents(local, events, { wantIds: [campaignId], ...opts });
  } catch {
    return { campaigns: local, applied: 0, rejected: [], seenIds: [] };
  }
}

/**
 * Sign and publish a campaign + posts/assists using the campaign's shared key.
 * If `opts.handle` is given, only posts/assists for that handle are published
 * alongside the campaign event; otherwise all posts/assists are published.
 * Throws when the campaign has no write key (e.g. read-only discovered ring).
 */
export async function publishCampaign(client, campaign, opts = {}) {
  if (!hasCampaignKey(campaign)) {
    throw new Error("Read-only ring — open the invite link from a member to publish.");
  }
  const { key, pubkey } = campaignKeypair(campaign);
  const handle = opts.handle ?? opts.me?.handle;
  const includeCampaign = opts.includeCampaignEvent !== false;
  const out = [];
  if (includeCampaign) out.push(await signEvent(campaignEvent(campaign), key));
  for (const p of campaign.posts ?? []) {
    let pev = p.nostr?.eventId;
    if (!handle || handleKey(p.author) === handleKey(handle)) {
      const e = await signEvent(postEvent(campaign, p, { campaignPubkey: pubkey }), key);
      out.push(e);
      pev = e.id;
    }
    for (const a of p.assists ?? []) {
      if (!handle || handleKey(a.handle) === handleKey(handle)) {
        out.push(await signEvent(encryptionEvent(campaign, p, a, { campaignPubkey: pubkey, postEventId: pev }), key));
      }
    }
  }
  const results = [];
  for (const ev of out) results.push({ id: ev.id, kind: ev.kind, relays: await client.publish(ev) });
  return results;
}

/**
 * Publish a creator removal as a kind 30078 campaign event republish (§17c).
 * Uses the campaign's shared key, strips `key` from content, guarantees a
 * strictly newer `created_at` so every client adopts the updated `members`
 * and `removedMembers` without rotating the invite link.
 */
export async function publishRemoval(client, campaign, opts = {}) {
  if (!hasCampaignKey(campaign)) {
    throw new Error("Read-only ring — invite link key is required to publish a removal.");
  }
  if (opts.by && campaign.createdBy && handleKey(opts.by) !== handleKey(campaign.createdBy)) {
    throw new Error("Only the campaign creator can publish a removal.");
  }
  const { key } = campaignKeypair(campaign);
  const ev = await signEvent(removalEvent(campaign, { createdAt: opts.createdAt }), key);
  const relays = await client.publish(ev);
  return { event: ev, id: ev.id, kind: ev.kind, relays };
}

// ---------------------------------------------------------------------------
// mount(rootEl, ctx) — the sync panel (relay status, relay list, publish
// state, membership state, one-line privacy statement).
// NO key UI, NO onboarding. Coordinator wires it into app.js/index.html.
// ctx: { storage?, client?, campaign?, getCampaigns?, me?, onMerged?, WebSocketImpl? }
// ---------------------------------------------------------------------------
export function mount(rootEl, ctx = {}) {
  const doc = rootEl.ownerDocument;
  let statusMap = {};
  let message = "";
  const el = (tag, props = {}, ...kids) => {
    const n = doc.createElement(tag);
    for (const [k, v] of Object.entries(props)) { if (k === "class") n.className = v; else if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); }
    for (const k of kids) n.append(k);
    return n;
  };
  const clientFor = () => {
    const { relays } = loadRelays(ctx.storage);
    return ctx.client ?? createRelayClient({ relays, WebSocketImpl: ctx.WebSocketImpl, onStatus: (s) => { statusMap = s; render(); } });
  };
  const activeCampaigns = () => {
    if (ctx.campaign) return [ctx.campaign];
    return ctx.getCampaigns?.() ?? [];
  };

  function relaySection() {
    const { configured, relays } = loadRelays(ctx.storage);
    const s = relayStatus(configured, relays, statusMap);
    const box = el("section", { class: "nostr-relays" }, el("h3", {}, "Relays"), el("p", { class: `relay-${s.kind}` }, s.label));
    const ul = el("ul", {});
    for (const r of relays) ul.append(el("li", {}, `${r} — ${statusMap[r] ?? "not tried yet"} `, el("button", { type: "button", onclick: () => { removeRelay(r, ctx.storage); render(); } }, "Remove")));
    box.append(ul);
    if (!configured) box.append(el("button", { type: "button", onclick: () => { useDefaultRelays(ctx.storage); render(); } }, "Use the suggested relays"));
    const inp = el("input", { type: "text", placeholder: "wss://relay.example.com" });
    const err = el("p", { class: "warn" });
    box.append(inp, el("button", { type: "button", onclick: () => { const r = addRelay(inp.value, ctx.storage); if (!r.ok) err.textContent = r.error; else render(); } }, "Add relay"), err);
    return box;
  }

  function membershipSection() {
    const camps = activeCampaigns();
    const box = el("section", { class: "nostr-membership" }, el("h3", {}, "Ring sync & membership"));
    if (!camps.length) {
      box.append(el("p", { class: "muted" }, "No rings loaded yet."));
      return box;
    }
    const ul = el("ul", {});
    const myHandle = ctx.me?.handle;
    for (const c of camps) {
      const writable = hasCampaignKey(c);
      const removed = Array.isArray(c.removedMembers) ? c.removedMembers : [];
      const meRemoved = myHandle && removed.some((r) => handleKey(r.handle) === handleKey(myHandle));
      const access = meRemoved ? "removed (read-only)" : (writable ? "write access via invite link" : "read-only");
      const pubState = c.nostr?.createdAt ? `last synced ${new Date(c.nostr.createdAt * 1000).toISOString()}` : "not published yet";
      const memberHandles = (c.members ?? []).map((m) => m.handle).filter(Boolean).join(", ") || "none";
      const removedText = removed.length ? ` · Removed: ${removed.map((r) => r.handle).join(", ")}` : "";
      ul.append(el("li", {}, `${c.title || c.id} — ${access}; ${pubState}. Members: ${memberHandles}${removedText}`));
    }
    box.append(ul);
    return box;
  }

  function actionSection() {
    const box = el("section", { class: "nostr-sync" }, el("h3", {}, "Sync"));
    const { relays } = loadRelays(ctx.storage);
    const camps = activeCampaigns();
    const canPublish = relays.length > 0 && camps.some(hasCampaignKey);
    box.append(el("button", { type: "button", ...(relays.length ? {} : { disabled: "" }), onclick: async () => {
      message = "Syncing…"; render();
      const client = clientFor();
      try {
        let list = camps; let n = 0;
        for (const c of camps) { const r = await syncCampaign(client, list, c.id); list = r.campaigns; n += r.applied; }
        ctx.onMerged?.(list);
        message = `Synced. ${n} update${n === 1 ? "" : "s"} merged. Your local ring is never overwritten by older data.`;
      } catch { message = "Couldn't reach the relays. Your ring still works from this browser."; }
      render();
    } }, "Fetch updates"));
    box.append(el("button", { type: "button", ...(canPublish ? {} : { disabled: "" }), onclick: async () => {
      message = "Publishing…"; render();
      try {
        const handle = ctx.me?.handle;
        let ok = 0, total = 0;
        for (const c of camps) {
          if (!hasCampaignKey(c)) continue;
          for (const r of await publishCampaign(clientFor(), c, { handle })) {
            for (const x of Object.values(r.relays)) { total++; if (x.ok) ok++; }
          }
        }
        message = `Published to relays: ${ok} of ${total} accepted. It is public, and it can't be reliably deleted.`;
      } catch (e) { message = String(e?.message ?? "Publishing failed."); }
      render();
    } }, "Publish my ring"));
    box.append(el("p", { class: "muted", role: "status" }, message));
    return box;
  }

  function render() {
    rootEl.replaceChildren(
      el("div", { class: "nostr-panel" }, el("h2", {}, "Sync (Nostr)"), el("p", { class: "privacy" }, PRIVACY_LINE), relaySection(), membershipSection(), actionSection()),
    );
  }
  render();
  return { render, destroy() { rootEl.replaceChildren(); } };
}
