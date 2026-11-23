// V41 — Nostr sync for the sustained ring (spec: cabal-bench/redesign-sustained-ring.md §16).
// Pure functions + a vanilla-WebSocket relay client + mount() for the sync panel.
// No npm deps, no backend. DOM only in mount().
//
// PRIVACY / KEY RULES (hard): the private key never leaves the browser —
// it is never logged, never put in a URL or link payload, never sent to a
// relay. Only signed events (which carry the public key) are published.
// Anything on a public relay is public, and Nostr events cannot be reliably
// deleted.

import {
  getPublicKey, generateSecretKey, isValidSecretKey, sign, verify, sha256,
  bytesToHex, hexToBytes,
} from "./nostr-schnorr.mjs";

export const KIND_CAMPAIGN = 30078;
export const KIND_NOTE = 1;
export const STORAGE_KEYS = Object.freeze({
  key: "cabal.v2.nostr.key",
  relays: "cabal.v2.relays",
});

export const DEFAULT_RELAYS = Object.freeze([
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
]);

export const PRIVACY_LINE = "Anything on a public relay is public, and it can't be reliably deleted.";

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
export const nsecEncode = (skHex) => bech32Encode("nsec", hexToBytes(skHex));
export function npubDecode(npub) {
  const d = bech32Decode(npub);
  return d && d.hrp === "npub" && d.bytes.length === 32 ? bytesToHex(d.bytes) : null;
}
export function nsecDecode(nsec) {
  const d = bech32Decode(nsec);
  if (!d || d.hrp !== "nsec" || d.bytes.length !== 32) return null;
  const hex = bytesToHex(d.bytes);
  return isValidSecretKey(hex) ? hex : null;
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
// Keys
// ---------------------------------------------------------------------------
function storageOf(storage) {
  if (storage) return storage;
  try { if (globalThis.localStorage?.getItem) return globalThis.localStorage; } catch { /* none */ }
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const readJson = (st, k, fb) => { try { const r = st.getItem(k); return r == null ? fb : JSON.parse(r); } catch { return fb; } };
const writeJson = (st, k, v) => { try { st.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

/** Make a keypair. Pure of storage: caller decides what to persist. */
export function generateKeypair() {
  const sk = generateSecretKey();
  return { sk, pk: getPublicKey(sk), nsec: nsecEncode(sk), npub: npubEncode(getPublicKey(sk)) };
}

/** nsec (bech32) or 64-char hex -> keypair, or null when invalid. */
export function importKey(input) {
  const s = String(input ?? "").trim();
  const sk = s.startsWith("nsec1") ? nsecDecode(s) : (/^[0-9a-f]{64}$/i.test(s) && isValidSecretKey(s.toLowerCase()) ? s.toLowerCase() : null);
  if (!sk) return null;
  const pk = getPublicKey(sk);
  return { sk, pk, nsec: nsecEncode(sk), npub: npubEncode(pk) };
}

/**
 * Key vault over a storage adapter. State machine:
 *   none -> pending (generated, nsec not yet confirmed saved) -> ready
 *   import goes straight to ready (the user already holds that nsec).
 * Signing is refused until the key is `ready`.
 * Stored record: { sk, confirmed, createdAt } under cabal.v2.nostr.key.
 * It is never exported by any function except `revealOnce`.
 */
export function createKeyVault(storage) {
  const st = storageOf(storage);
  const load = () => {
    const r = readJson(st, STORAGE_KEYS.key, null);
    return r && typeof r.sk === "string" && isValidSecretKey(r.sk) ? r : null;
  };
  return {
    status() {
      const r = load();
      if (!r) return { state: "none" };
      return { state: r.confirmed ? "ready" : "pending", npub: npubEncode(getPublicKey(r.sk)), pk: getPublicKey(r.sk) };
    },
    /** Generate + store; returns the nsec for the one-time reveal. */
    generate() {
      const kp = generateKeypair();
      writeJson(st, STORAGE_KEYS.key, { sk: kp.sk, confirmed: false, createdAt: new Date().toISOString() });
      return { nsec: kp.nsec, npub: kp.npub };
    },
    /** The once-only reveal: allowed only while unconfirmed. */
    revealOnce() {
      const r = load();
      return r && !r.confirmed ? nsecEncode(r.sk) : null;
    },
    /** User ticked "I saved it". */
    confirmSaved() {
      const r = load();
      if (!r) return false;
      return writeJson(st, STORAGE_KEYS.key, { ...r, confirmed: true });
    },
    /** Paste an nsec to restore. Returns { ok, npub } or { ok:false, error }. */
    import(input) {
      const kp = importKey(input);
      if (!kp) return { ok: false, error: "That doesn't look like a valid nsec. It should start with nsec1." };
      writeJson(st, STORAGE_KEYS.key, { sk: kp.sk, confirmed: true, createdAt: new Date().toISOString() });
      return { ok: true, npub: kp.npub };
    },
    /** Sign an unsigned event template. Throws unless the key is confirmed. */
    async signEvent(template) {
      const r = load();
      if (!r || !r.confirmed) throw new Error("No confirmed Cabal key — finish key setup first.");
      return signEvent(template, r.sk);
    },
    /** Forget the key on this browser. Without a backup nsec the identity is gone. */
    forget() { try { st.removeItem(STORAGE_KEYS.key); } catch { /* ignore */ } },
  };
}

// ---------------------------------------------------------------------------
// Events (NIP-01)
// ---------------------------------------------------------------------------
export const campaignAddress = (pubkey, campaignId) => `${KIND_CAMPAIGN}:${pubkey}:cabal:${campaignId}`;
const nowSec = () => Math.floor(Date.now() / 1000);

export async function eventId(ev) {
  const ser = JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]);
  return bytesToHex(await sha256(ser));
}

/** template {kind,tags,content,created_at?} + sk -> signed event. */
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

// Public sync fields only. The `nostr` sidecar is local bookkeeping and is
// never published inside content (it is derived from the signed event).
const stripNostr = (o) => { const { nostr, ...rest } = o ?? {}; return rest; };

/**
 * Campaign event: kind 30078, d = cabal:<id>. Content = campaign v2 JSON
 * (local `nostr` sidecars stripped; assists live in post events, but those
 * already inside the campaign JSON travel with it). Only the campaign author
 * can replace it (address includes their pubkey).
 */
export function campaignEvent(campaign, { createdAt } = {}) {
  const c = stripNostr(campaign);
  c.posts = (campaign.posts ?? []).map((p) => ({ ...stripNostr(p), assists: (p.assists ?? []).map(stripNostr) }));
  return {
    kind: KIND_CAMPAIGN,
    created_at: createdAt ?? nowSec(),
    tags: [["d", `cabal:${campaign.id}`], ["t", "cabal"]],
    content: JSON.stringify(c),
  };
}

/** Post event: kind 1, `a` -> campaign. Content = post JSON (no assists; they have their own events). */
export function postEvent(campaign, post, { campaignPubkey, createdAt } = {}) {
  const pk = campaignPubkey ?? campaign?.nostr?.pubkey;
  if (!pk) throw new Error("postEvent needs the campaign author's pubkey");
  const { assists, ...rest } = stripNostr(post);
  return {
    kind: KIND_NOTE,
    created_at: createdAt ?? nowSec(),
    tags: [["a", campaignAddress(pk, campaign.id)], ["t", "cabal"], ["cabal-post", post.id]],
    content: JSON.stringify(rest),
  };
}

/**
 * Enscryption event: kind 1, `e` -> post event (when its id is known), `a` -> campaign.
 * Spec deviation (flagged): a post that only ever lived inside the campaign JSON
 * has no event id, so we also tag `cabal-post` = the post's own id, which is
 * what merge matches on. `e` is added whenever the id is known.
 */
export function encryptionEvent(campaign, post, assist, { campaignPubkey, postEventId, createdAt } = {}) {
  const pk = campaignPubkey ?? campaign?.nostr?.pubkey;
  if (!pk) throw new Error("encryptionEvent needs the campaign author's pubkey");
  const evId = postEventId ?? post?.nostr?.eventId;
  const tags = [];
  if (evId) tags.push(["e", evId]);
  tags.push(["a", campaignAddress(pk, campaign.id)], ["t", "cabal"], ["cabal-post", post.id]);
  const { handle, note, url, quoteText, status, contributedAt } = stripNostr(assist);
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
    // A post's own event never carries `handle`; an assist always does.
    return { type: "handle" in data ? "assist" : "post", campaignId: m[2], campaignPubkey: m[1], postId, postEventId: tagVal(ev, "e"), data };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Merge (pure, idempotent). Relay content is UNTRUSTED: every field is
// re-shaped and size-capped here; URLs must be http(s).
// ---------------------------------------------------------------------------
const PLATFORMS = ["x", "bluesky", "threads", "reddit", "instagram", "tiktok", "youtube", "other"];
const isHttp = (u) => { try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; } };
const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : undefined);
const iso = (v) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : undefined);

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

const cloneCampaign = (c) => JSON.parse(JSON.stringify(c));
const handleKey = (h) => String(h).toLowerCase();

/**
 * applyRelayEvents(localCampaigns, events, opts?) -> { campaigns, applied, rejected, seenIds }
 *  - events must already be signature-verified (the relay client does it);
 *    merge still ignores anything undecodable or malformed.
 *  - Idempotent: merge(merge(s, E), E) deep-equals merge(s, E). Dedupes by event id.
 *  - Campaign event replaces campaign METADATA only when its created_at is newer
 *    than the stored one; posts/assists are unioned and upserted, never dropped,
 *    so local work is never clobbered by a stale (or any) event.
 *  - Identity binding: once a post/assist is bound to a pubkey, another pubkey
 *    cannot overwrite it (stops handle squatting on already-synced entries).
 *  - opts.wantIds: only adopt unknown campaigns with these ids.
 *  - opts.normalize: optional V38 normalizeCampaign hook applied to adopted/updated campaigns.
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

  const sameAuthority = (c, pk) => !c.nostr?.pubkey || c.nostr.pubkey === pk;

  for (const { ev, d } of decoded) {
    if (d.type === "campaign") {
      const raw = d.data;
      if (raw.id !== undefined && raw.id !== d.campaignId) { rejected.push({ id: ev.id, reason: "id-mismatch" }); continue; }
      let c = byId.get(d.campaignId);
      if (!c) {
        if (opts.wantIds && !opts.wantIds.includes(d.campaignId)) { rejected.push({ id: ev.id, reason: "not-wanted" }); continue; }
        c = { id: d.campaignId, posts: [], members: [], createdAt: iso(raw.createdAt) ?? new Date(ev.created_at * 1000).toISOString() };
        campaigns.push(c); byId.set(c.id, c);
      } else if (!sameAuthority(c, ev.pubkey)) { rejected.push({ id: ev.id, reason: "wrong-author" }); continue; }
      const have = c.nostr?.createdAt ?? 0;
      const first = !c.nostr;
      if (!first && ev.created_at <= have) { rejected.push({ id: ev.id, reason: "stale" }); continue; }
      // metadata replace (never the posts array wholesale)
      for (const k of ["game", "title", "members", "window", "anchorPost", "demo"]) if (k in raw) c[k] = raw[k];
      if (typeof raw.createdAt === "string" && !c.createdAt) c.createdAt = raw.createdAt;
      c.nostr = { pubkey: ev.pubkey, eventId: ev.id, createdAt: ev.created_at };
      c.posts = c.posts ?? [];
      for (const rp of Array.isArray(raw.posts) ? raw.posts : []) {
        const p = cleanPost(rp, c.createdAt);
        if (!p) continue;
        const i = c.posts.findIndex((x) => x.id === p.id);
        const assists = (Array.isArray(rp.assists) ? rp.assists : []).map(cleanAssist).filter(Boolean);
        // Embedded posts/assists are the publisher's COPY of other people's
        // entries: they stay unbound (no pubkey) and never overwrite what we
        // already hold. A member's own signed event binds + updates them later.
        if (i < 0) c.posts.push({ ...p, assists: [] });
        const post = c.posts.find((x) => x.id === p.id);
        post.assists = post.assists ?? [];
        for (const a of assists) {
          if (!post.assists.some((x) => handleKey(x.handle) === handleKey(a.handle))) post.assists.push(a);
        }
      }
      c.posts.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || (a.id < b.id ? -1 : 1));
      if (opts.normalize) { const n = opts.normalize(c); if (n) { byId.set(c.id, n); campaigns[campaigns.indexOf(c)] = n; } }
      applied++;
      continue;
    }
    const c = byId.get(d.campaignId);
    if (!c) { rejected.push({ id: ev.id, reason: "orphan" }); continue; }
    if (!sameAuthority(c, d.campaignPubkey)) { rejected.push({ id: ev.id, reason: "wrong-campaign-author" }); continue; }
    if (d.type === "post") {
      const p = cleanPost(d.data, new Date(ev.created_at * 1000).toISOString());
      if (!p || p.id !== d.postId) { rejected.push({ id: ev.id, reason: "bad-post" }); continue; }
      const i = c.posts.findIndex((x) => x.id === p.id);
      const meta = { pubkey: ev.pubkey, eventId: ev.id, createdAt: ev.created_at };
      if (i < 0) { c.posts.push({ ...p, assists: [], nostr: meta }); applied++; }
      else {
        const old = c.posts[i];
        if (old.nostr?.pubkey && old.nostr.pubkey !== ev.pubkey) { rejected.push({ id: ev.id, reason: "post-owned" }); continue; }
        if (old.nostr?.createdAt >= ev.created_at && old.nostr?.eventId !== ev.id) { rejected.push({ id: ev.id, reason: "stale" }); continue; }
        c.posts[i] = { ...old, ...p, assists: old.assists ?? [], nostr: meta }; applied++;
      }
      c.posts.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || (a.id < b.id ? -1 : 1));
    } else {
      let post = c.posts.find((x) => x.id === d.postId) ?? (d.postEventId ? c.posts.find((x) => x.nostr?.eventId === d.postEventId) : null);
      if (!post) { rejected.push({ id: ev.id, reason: "orphan-post" }); continue; }
      const a = cleanAssist(d.data);
      if (!a) { rejected.push({ id: ev.id, reason: "bad-assist" }); continue; }
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
  if (old.nostr?.pubkey && old.nostr.pubkey !== pubkey) return "handle-owned";
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

/** Relay filters to fetch a campaign. Without the author pubkey we can only find the campaign event first. */
export function filtersForCampaign(campaignId, authorPubkey) {
  const f = [{ kinds: [KIND_CAMPAIGN], "#d": [`cabal:${campaignId}`] }];
  if (authorPubkey) {
    f[0].authors = [authorPubkey];
    f.push({ kinds: [KIND_NOTE], "#a": [campaignAddress(authorPubkey, campaignId)] });
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
    if (url.protocol === "ws:" && !/^(localhost|127\.0\.0\.1)$/.test(url.hostname)) return null; // plaintext only for local dev
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
/** Opt-in: the user taps "Use the suggested relays". Nothing is published to anyone until they do. */
export const useDefaultRelays = (storage) => saveRelays([...DEFAULT_RELAYS], storage);

// ---------------------------------------------------------------------------
// Relay client (vanilla WebSocket; best-effort; a down relay never throws)
// ---------------------------------------------------------------------------
/**
 * createRelayClient({ relays, WebSocketImpl?, timeoutMs? })
 *  status(): { [url]: "connecting" | "connected" | "unreachable" }  + summary via relayStatus()
 *  publish(signedEvent) -> Promise<{ [url]: {ok, message} }>
 *  fetch(filters, {waitMs}) -> Promise<verifiedEvents[]> (REQ until EOSE/timeout; deduped by id)
 *  close()
 * Incoming events are signature-verified before being returned.
 */
export function createRelayClient({ relays = [], WebSocketImpl = globalThis.WebSocket, timeoutMs = 6000, onStatus } = {}) {
  const conns = new Map();   // url -> { ws, state, listeners:Set }
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
 * Publishing is separate and always user-initiated (publishCampaign).
 */
export async function syncCampaign(client, localCampaigns, campaignId, authorPubkey, opts = {}) {
  const local = localCampaigns ?? [];
  try {
    const known = authorPubkey ?? local.find((c) => c.id === campaignId)?.nostr?.pubkey;
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

/** Sign and publish the campaign event + every post/assist this key authored. User-initiated only. */
export async function publishCampaign(client, vault, campaign, me = {}) {
  const st = vault.status();
  if (st.state !== "ready") throw new Error("Finish key setup before publishing.");
  const author = campaign.nostr?.pubkey ?? st.pk;
  const out = [];
  if (author === st.pk) out.push(await vault.signEvent(campaignEvent(campaign)));
  for (const p of campaign.posts ?? []) {
    let pev = p.nostr?.eventId;
    if (p.author && me.handle && handleKey(p.author) === handleKey(me.handle) && (!p.nostr?.pubkey || p.nostr.pubkey === st.pk) && author) {
      const e = await vault.signEvent(postEvent(campaign, p, { campaignPubkey: author })); out.push(e); pev = e.id;
    }
    for (const a of p.assists ?? []) {
      if (me.handle && handleKey(a.handle) === handleKey(me.handle) && (!a.nostr?.pubkey || a.nostr.pubkey === st.pk)) {
        out.push(await vault.signEvent(encryptionEvent(campaign, p, a, { campaignPubkey: author, postEventId: pev })));
      }
    }
  }
  const results = [];
  for (const ev of out) results.push({ id: ev.id, kind: ev.kind, relays: await client.publish(ev) });
  return results;
}

// ---------------------------------------------------------------------------
// Onboarding copy (exact strings; the task doc repeats these)
// ---------------------------------------------------------------------------
export const COPY = Object.freeze({
  intro: "To sync your ring across devices, Cabal makes you a key. It is just for Cabal, and it is made right here in your browser.",
  show: "This is your secret key. It is shown once. Copy it somewhere safe now — a password manager is ideal.",
  warn: "If you lose this key, you lose this identity. There is no recovery, no password reset, and nobody to ask. Anyone who has it can post as you.",
  confirm: "I have saved my secret key somewhere safe.",
  importLabel: "Already have a Cabal key? Paste it here to restore it.",
  perBrowser: "A key belongs to one browser. A second browser is a second identity unless you paste the same key there.",
  privacy: PRIVACY_LINE,
});

// ---------------------------------------------------------------------------
// mount(rootEl, ctx) — the sync panel. DOM only here; coordinator wires it in V42.
// ctx: { storage?, client?, getCampaigns?, onChange?, WebSocketImpl? }
// ---------------------------------------------------------------------------
export function mount(rootEl, ctx = {}) {
  const doc = rootEl.ownerDocument;
  const vault = ctx.vault ?? createKeyVault(ctx.storage);
  let statusMap = {};
  let revealed = null;
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

  function keySection() {
    const st = vault.status();
    const box = el("section", { class: "nostr-key" }, el("h3", {}, "Your Cabal key"));
    if (st.state === "ready") {
      box.append(el("p", {}, `Identity: ${st.npub}`), el("p", { class: "muted" }, COPY.perBrowser));
      return box;
    }
    if (st.state === "pending") {
      const nsec = revealed ?? vault.revealOnce();
      box.append(el("p", {}, COPY.show), el("pre", { class: "nostr-nsec" }, nsec), el("p", { class: "warn" }, COPY.warn));
      const cb = el("input", { type: "checkbox", id: "nostr-saved" });
      const done = el("button", { type: "button", disabled: "" }, "Continue");
      cb.addEventListener("change", () => { cb.checked ? done.removeAttribute("disabled") : done.setAttribute("disabled", ""); });
      done.addEventListener("click", () => { if (cb.checked && vault.confirmSaved()) { revealed = null; render(); ctx.onChange?.(); } });
      box.append(el("label", {}, cb, ` ${COPY.confirm}`), done);
      return box;
    }
    box.append(el("p", {}, COPY.intro), el("p", { class: "warn" }, COPY.warn));
    box.append(el("button", { type: "button", onclick: () => { revealed = vault.generate().nsec; render(); } }, "Make my key"));
    const input = el("input", { type: "password", autocomplete: "off", placeholder: "nsec1…" });
    const err = el("p", { class: "warn" });
    box.append(el("label", {}, COPY.importLabel, input), el("button", { type: "button", onclick: () => {
      const r = vault.import(input.value); input.value = "";
      if (!r.ok) { err.textContent = r.error; return; }
      render(); ctx.onChange?.();
    } }, "Restore key"), err);
    return box;
  }

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

  function actionSection() {
    const box = el("section", { class: "nostr-sync" }, el("h3", {}, "Sync"));
    const ready = vault.status().state === "ready";
    const { relays } = loadRelays(ctx.storage);
    box.append(el("button", { type: "button", ...(relays.length ? {} : { disabled: "" }), onclick: async () => {
      message = "Syncing…"; render();
      const client = clientFor();
      try {
        const camps = ctx.getCampaigns?.() ?? [];
        let list = camps; let n = 0;
        for (const c of camps) { const r = await syncCampaign(client, list, c.id); list = r.campaigns; n += r.applied; }
        ctx.onMerged?.(list);
        message = `Synced. ${n} update${n === 1 ? "" : "s"} merged. Your local ring is never overwritten by older data.`;
      } catch { message = "Couldn't reach the relays. Your ring still works from this browser."; }
      render();
    } }, "Fetch updates"));
    if (ready) box.append(el("button", { type: "button", ...(relays.length ? {} : { disabled: "" }), onclick: async () => {
      message = "Publishing…"; render();
      try {
        const me = ctx.me ?? {};
        let ok = 0, total = 0;
        for (const c of ctx.getCampaigns?.() ?? []) for (const r of await publishCampaign(clientFor(), vault, c, me)) for (const x of Object.values(r.relays)) { total++; if (x.ok) ok++; }
        message = `Published to relays: ${ok} of ${total} accepted. It is public, and it can't be reliably deleted.`;
      } catch (e) { message = String(e?.message ?? "Publishing failed."); }
      render();
    } }, "Publish my ring"));
    box.append(el("p", { class: "muted", role: "status" }, message));
    return box;
  }

  function render() {
    rootEl.replaceChildren(
      el("div", { class: "nostr-panel" }, el("h2", {}, "Sync (Nostr)"), el("p", { class: "privacy" }, COPY.privacy), keySection(), relaySection(), actionSection()),
    );
  }
  render();
  return { render, destroy() { rootEl.replaceChildren(); } };
}
