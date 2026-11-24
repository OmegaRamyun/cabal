// Cabal v0.2 — Ring page: sustained-ring feed with Feed / Members / Sync tabs (V22 / V39 / V57).
//
// Detail header: ring title, game subtitle, member avatar stack, and share
// icon-button (copies link + toast). Feed / Members / Sync are tabs so
// protocol plumbing stays tucked inside the Sync tab's collapsed sheet.
//
// Mount contract: mount(rootEl, ctx) where
//   ctx = { store, navigate(view, params), campaign, onTabChange? }
//   store = { game, campaigns, me, saveGame, saveCampaigns, saveMe }

import * as campaignModel from './campaign.mjs';
import { ringSummary, resolveStore } from './home.mjs';
import * as quoteComposer from './quote-composer.mjs';
import * as nostrModel from './nostr.mjs';
import { NAV_ICONS, showToast } from './nav.mjs';
import {
  FORMAT_ID_RE,
  formatIdsForRing,
  adoptTemplate,
  removeTemplate,
  ringsRunningFormat,
  formatsForDiscovery,
  normalizeFormat,
  toUsageMap,
} from './campaign-formats.mjs';
import { loadUserFormats, mergeFormats } from './user-formats.mjs';
import { isListable } from './discovery.mjs';

export const { addMember, postedCount } = campaignModel;
export { ringSummary };

const { encodeCampaignLink, relativeTime, initials, avatarHue } = campaignModel;

export const ENSCRYPTION_MAX_LENGTH = 280;

export const RING_TABS = Object.freeze(['feed', 'members', 'sync']);

export const PLATFORM_OPTIONS = Object.freeze([
  'x',
  'bluesky',
  'threads',
  'reddit',
  'instagram',
  'tiktok',
  'youtube',
  'other',
]);

export const PLATFORM_LABELS = Object.freeze({
  x: 'X',
  bluesky: 'Bluesky',
  threads: 'Threads',
  reddit: 'Reddit',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  other: 'Other',
});

export const PASS_IT_ON_COPY =
  'A ringmate’s post travels further when a real reader passes it on. If one speaks to you, open it and share its link in your own #Ring channel or wherever your people gather. Only what you genuinely like — never an obligation, never a count.';

export const INVITE_PROMPT_COPY = 'Your ring is live. It needs other devs.';
export const RING_COLUMN_CLASS = 'campaign-page--centered';

/** V63: pin the invite prompt card at the top when a ring has exactly 1 member. */
export function shouldShowInvitePrompt(campaign) {
  return Boolean(campaign && Array.isArray(campaign.members) && campaign.members.length === 1);
}

/**
 * V63: hide the empty Templates block on new 1-member rings; show once at
 * least one template is running OR the ring has 2+ devs.
 */
export function shouldShowTemplatesSection(campaign) {
  if (!campaign || typeof campaign !== 'object') return false;
  if (formatIdsForRing(campaign).length > 0) return true;
  return Array.isArray(campaign.members) && campaign.members.length >= 2;
}

// ---------------------------------------------------------------- pure ---

function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

function toTimestamp(iso) {
  const t = Date.parse(iso ?? '');
  return Number.isNaN(t) ? 0 : t;
}

function handleKey(h) {
  return String(h ?? '').trim().toLowerCase();
}

function randomPostId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  const buf = new Uint8Array(8);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(buf);
    for (const b of buf) s += chars[b % 36];
  } else {
    for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * 36)];
  }
  return `pst_${s}`;
}

/** Normalize a ring tab name to 'feed' | 'members' | 'sync'. Pure, tested. */
export function normalizeRingTab(tab) {
  return RING_TABS.includes(tab) ? tab : 'feed';
}

/**
 * memberStackSummary(members, maxVisible?) -> { visible, overflow, total }
 * Pure helper for the ring detail header's overlapping avatar stack.
 */
export function memberStackSummary(members = [], maxVisible = 4) {
  const list = Array.isArray(members) ? members : [];
  const cap = Math.max(1, Number(maxVisible) || 4);
  return {
    visible: list.slice(0, cap),
    overflow: Math.max(0, list.length - cap),
    total: list.length,
  };
}

/** Human display label for a platform key. */
export function platformLabel(platform) {
  const key = String(platform ?? '').trim().toLowerCase();
  return PLATFORM_LABELS[key] || 'Other';
}

/** Second-line post metadata string (platform · kind · time). Pure, tested. */
export function postMetaLine(post, now = new Date()) {
  const parts = [platformLabel(post?.platform)];
  if (post?.kind && post.kind !== 'other') parts.push(post.kind);
  const time = post?.createdAt ? relativeTime(post.createdAt, now) : '';
  if (time) parts.push(time);
  return parts.join(' \u00b7 ');
}

/** Clamp and trim an Enscryption note to max 280 chars. */
export function sanitizeEnscryption(note) {
  return String(note ?? '').trim().slice(0, ENSCRYPTION_MAX_LENGTH);
}

/** Assists on a post (empty array when none). */
export function postAssists(post) {
  if (typeof campaignModel.postAssists === 'function') {
    return campaignModel.postAssists(post);
  }
  return Array.isArray(post?.assists) ? post.assists : [];
}

/**
 * Extract the posts array from a campaign (v2 `posts`, or legacy
 * `anchorPost` wrapped as a single post for backward compat).
 */
export function campaignPosts(campaign) {
  if (!campaign || typeof campaign !== 'object') return [];
  if (Array.isArray(campaign.posts) && campaign.posts.length > 0) {
    return campaign.posts;
  }
  if (campaign.anchorPost && typeof campaign.anchorPost === 'object') {
    return [
      {
        id: 'pst_anchor00',
        author: campaign.anchorPost.author || '',
        platform: campaign.anchorPost.platform || 'other',
        url: campaign.anchorPost.url || '',
        text: campaign.anchorPost.text || '',
        kind: 'announcement',
        createdAt: campaign.createdAt || '',
        assists: [],
      },
    ];
  }
  return [];
}

/** Posts sorted newest first by `createdAt` (descending; later index breaks ties). */
export function feedPosts(campaign) {
  return campaignPosts(campaign)
    .map((post, idx) => ({ post, idx }))
    .sort((a, b) => {
      const diff = toTimestamp(b.post.createdAt) - toTimestamp(a.post.createdAt);
      return diff !== 0 ? diff : b.idx - a.idx;
    })
    .map(({ post }) => post);
}

/**
 * The Enscryption receipt text rendered as the comment body under a post
 * (spec section 2a & 15): `note ?? quoteText ?? ""`.
 */
export function assistReceiptText(assist) {
  if (!assist || typeof assist !== 'object') return '';
  const text = assist.note || assist.quoteText || '';
  return String(text).trim();
}

/** Link label for a contribution URL: "View quote" for x/bluesky, "View share" otherwise. */
export function assistLinkLabel(platform) {
  return quoteComposer.isComposerPlatform(platform) ? 'View quote' : 'View share';
}

/** Find a member's assist on a post (case-insensitive handle match), or null. */
export function myAssistFor(post, handle) {
  const target = handleKey(handle);
  if (!target) return null;
  return postAssists(post).find((a) => handleKey(a?.handle) === target) || null;
}

/**
 * Newest post (in feed order) that has at least one assist with a
 * quotable/shareable contribution URL, or null.
 */
export function newestQuotablePost(campaign) {
  for (const post of feedPosts(campaign)) {
    if (postAssists(post).some((a) => typeof a?.url === 'string' && a.url.trim().length > 0)) {
      return post;
    }
  }
  return null;
}

/**
 * True when at least one post has a quotable/shareable contribution URL
 * (v2), or a legacy member has status 'posted' with a quoteUrl (v1 compat).
 */
export function hasQuotablePost(campaign) {
  if (!campaign || typeof campaign !== 'object') return false;
  if (Array.isArray(campaign.posts) && campaign.posts.length > 0) {
    return newestQuotablePost(campaign) !== null;
  }
  return (campaign.members || []).some((m) => m.status === 'posted' && m.quoteUrl);
}

/**
 * shareLinkFor(campaign, baseUrl, relays = []) -> { url, note, noteClass }.
 * V44 contract preserved for unit tests; UI renders the note as a plain
 * muted note (.ring-share-note) instead of a bold red error.
 */
export function shareLinkFor(campaign, baseUrl = '', relays = []) {
  const payload = encodeCampaignLink(campaign, baseUrl);
  let url = payload.url;
  let note = payload.long ? 'This link is long — some chat apps may trim it.' : '';
  let noteClass = 'form-error';
  try {
    if (campaign?.nostr?.createdAt && nostrModel.hasCampaignKey(campaign)) {
      url = baseUrl + nostrModel.campaignLinkFragment(campaign, relays);
      note = 'Short link — opens the ring from the relays.';
      noteClass = 'muted';
    }
  } catch { /* keep the payload link */ }
  return { url, note, noteClass };
}

/**
 * Passive URL recognition (spec section 4).
 */
export function parsePostUrl(url) {
  if (typeof campaignModel.parsePostUrl === 'function') {
    return campaignModel.parsePostUrl(url);
  }
  try {
    const parsed = new URL(String(url ?? '').trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    let platform = 'other';
    if (host === 'x.com' || host === 'twitter.com') platform = 'x';
    else if (host === 'bsky.app') platform = 'bluesky';
    else if (host === 'threads.net' || host === 'threads.com') platform = 'threads';
    else if (host === 'reddit.com' || host === 'old.reddit.com') platform = 'reddit';
    else if (host === 'instagram.com') platform = 'instagram';
    else if (host === 'tiktok.com') platform = 'tiktok';
    else if (host === 'youtube.com' || host === 'youtu.be') platform = 'youtube';

    const out = { platform };
    if (platform === 'x') {
      const m = parsed.pathname.match(/^\/([^/]+)\/status\/\d+/);
      if (m && m[1] && m[1].toLowerCase() !== 'i') {
        out.author = `@${m[1].replace(/^@/, '')}`;
      }
    } else if (platform === 'reddit') {
      const m = parsed.pathname.match(/^\/r\/[^/]+\/comments\/[^/]+\/([^/]+)/);
      if (m && m[1]) {
        const title = decodeURIComponent(m[1]).replace(/[-_]+/g, ' ').trim().slice(0, 120);
        if (title) out.title = title;
      }
    }
    return out;
  } catch {
    return { platform: 'other' };
  }
}

/** Append a post to a campaign (spec section 3b). */
export function addPostToCampaign(campaign, postInput) {
  if (typeof campaignModel.addPost === 'function') {
    return campaignModel.addPost(campaign, postInput);
  }
  const next = clone(campaign);
  const author = String(postInput?.author ?? '').trim();
  const platform = String(postInput?.platform ?? '').trim().toLowerCase() || 'other';
  const url = String(postInput?.url ?? '').trim();
  if (!author) throw new Error('Invalid post: author is required');
  if (!/^https?:\/\//i.test(url)) throw new Error('Invalid post: url must be http(s)');
  const post = {
    id: String(postInput?.id || '').trim() || randomPostId(),
    author,
    ...(postInput?.authorName ? { authorName: String(postInput.authorName).trim() } : {}),
    platform,
    url,
    ...(postInput?.text ? { text: String(postInput.text).trim() } : {}),
    kind: postInput?.kind || 'other',
    createdAt: postInput?.createdAt || new Date().toISOString(),
    assists: Array.isArray(postInput?.assists) ? clone(postInput.assists) : [],
  };
  next.posts = [...campaignPosts(next), post];
  return next;
}

/** Record/upsert an assist on a post (spec section 3b). */
export function markPostContributed(campaign, postId, handle, details = {}) {
  if (typeof campaignModel.markContributed === 'function') {
    return campaignModel.markContributed(campaign, postId, handle, details);
  }
  const next = clone(campaign);
  const cleanHandle = String(handle ?? '').trim();
  if (!cleanHandle || !postId) return next;
  const target = cleanHandle.toLowerCase();
  const stamp = details.now
    ? new Date(details.now).toISOString()
    : new Date().toISOString();
  const posts = campaignPosts(next);
  let matched = false;
  next.posts = posts.map((p) => {
    if (p.id !== postId) return p;
    matched = true;
    const assists = Array.isArray(p.assists) ? [...p.assists] : [];
    const entry = {
      handle: cleanHandle,
      status: 'contributed',
      contributedAt: stamp,
      ...(details.url ? { url: String(details.url).trim() } : {}),
      ...(details.quoteText ? { quoteText: String(details.quoteText).trim() } : {}),
      ...(details.note ? { note: sanitizeEnscryption(details.note) } : {}),
    };
    const idx = assists.findIndex((a) => handleKey(a?.handle) === target);
    if (idx >= 0) assists[idx] = entry;
    else assists.push(entry);
    return { ...p, assists };
  });
  return matched ? next : clone(campaign);
}

// ------------------------------------------------- creator removal (V43c) ---

export const REMOVED_NOTICE = 'You were removed from this ring. You can still read it.';

function stripAt(h) {
  return String(h ?? '').trim().replace(/^@+/, '');
}

function sameHandle(a, b) {
  const x = stripAt(a).toLowerCase();
  return x !== '' && x === stripAt(b).toLowerCase();
}

/** Display form of a handle: always exactly one leading "@". */
export function atHandle(handle) {
  const h = stripAt(handle);
  return h ? `@${h}` : '';
}

/** Confirm-step copy (spec 17d, verbatim). */
export function removeConfirmCopy(handle) {
  return `Remove ${atHandle(handle)} from this ring? Their past posts stay; they can't add anything new. The invite link stays the same.`;
}

/** True when `handle` is the ring's creator (case-insensitive). */
export function isCreator(campaign, handle) {
  return sameHandle(campaign?.createdBy, handle);
}

/** True when `handle` appears in campaign.removedMembers. */
export function isRemovedHandle(campaign, handle) {
  if (typeof campaignModel.isRemoved === 'function') {
    return !!campaignModel.isRemoved(campaign, handle);
  }
  return (campaign?.removedMembers || []).some((r) => sameHandle(r?.handle, handle));
}

/** Removed entries for the roster, in stored order. */
export function removedRoster(campaign) {
  return (campaign?.removedMembers || [])
    .filter((r) => r && stripAt(r.handle))
    .map((r) => ({ handle: r.handle, removedAt: r.removedAt, removedBy: r.removedBy }));
}

/** Remove button shows only for the creator, on other, non-removed members. */
export function canRemoveMember(campaign, me, memberHandle) {
  if (!me?.handle || !isCreator(campaign, me.handle)) return false;
  if (sameHandle(me.handle, memberHandle)) return false;
  return !isRemovedHandle(campaign, memberHandle);
}

/** Compose / add-post / contribute controls are hidden when removed. */
export function controlsHidden(campaign, me) {
  return !!me?.handle && isRemovedHandle(campaign, me.handle);
}

/** Remove a member (creator-only). Returns a NEW campaign. */
export function removeMemberFromCampaign(campaign, handle, { by, now } = {}) {
  if (typeof campaignModel.removeMember === 'function') {
    return campaignModel.removeMember(campaign, handle, { by, now });
  }
  const next = clone(campaign);
  if (!isCreator(next, by) || !stripAt(handle)) return next;
  const stamp = now || new Date().toISOString();
  next.members = (next.members || []).filter((m) => !sameHandle(m.handle, handle));
  const removed = Array.isArray(next.removedMembers) ? next.removedMembers : [];
  const idx = removed.findIndex((r) => sameHandle(r.handle, handle));
  const entry = { handle: String(handle).trim(), removedAt: stamp, removedBy: String(by).trim() };
  if (idx >= 0) removed[idx] = { ...removed[idx], removedAt: stamp };
  else removed.push(entry);
  next.removedMembers = removed;
  return next;
}

// ------------------------------------------ ring templates section (V59) ---

const fmtLc = (v) => String(v ?? '').trim().toLowerCase();

/** Any non-removed member of the ring may adopt a template. */
export function canAdoptTemplate(campaign, me) {
  if (!campaign || typeof campaign !== 'object') return false;
  if (!me?.handle || !stripAt(me.handle)) return false;
  if (isRemovedHandle(campaign, me.handle)) return false;
  return (campaign.members || []).some((m) => sameHandle(m?.handle, me.handle));
}

/** Only the ring creator may remove a running template. */
export function canRemoveTemplate(campaign, me) {
  if (!campaign || typeof campaign !== 'object') return false;
  if (!me?.handle || !stripAt(me.handle)) return false;
  return isCreator(campaign, me.handle);
}

/** Confirm-step copy for removing a template (past history stays). */
export function removeTemplateConfirmCopy(tagline) {
  const name = String(tagline ?? '').trim() || 'this template';
  return `Stop running "${name}" in this ring? Past posts and assists stay; the template just stops being listed as running.`;
}

/**
 * runningTemplateChips(campaign, formats?, me?) -> chip descriptors for the
 * ring page's Templates section. Each chip links to its format page and sets
 * `removable: true` only for the ring creator.
 */
export function runningTemplateChips(campaign, formats = [], me = null) {
  const ids = formatIdsForRing(campaign);
  const byId = new Map();
  for (const f of Array.isArray(formats) ? formats : []) {
    if (f && typeof f === 'object' && typeof f.id === 'string' && f.id.trim()) {
      byId.set(fmtLc(f.id), normalizeFormat(f));
    }
  }
  const removable = canRemoveTemplate(campaign, me);
  return ids.map((id) => {
    const found = byId.get(id);
    return {
      id,
      tagline: (found && found.tagline) || id,
      href: `#/format/${encodeURIComponent(id)}`,
      removable,
      demo: found?.demo === true,
    };
  });
}

/**
 * pickableFormatsForRing(campaign, { formats, userFormats, rings, usage })
 * -> formats the user can browse/adopt from inside a ring: listable formats
 * (at least one listable ring runs them or positive relay usage) PLUS the
 * user's own formats. Non-running formats come before already-running ones.
 */
export function pickableFormatsForRing(
  campaign,
  { formats = [], userFormats = [], rings = [], usage = null } = {},
) {
  const running = new Set(formatIdsForRing(campaign));
  const listableRings = (Array.isArray(rings) ? rings : []).filter(isListable);
  const usageMap = toUsageMap(usage);
  const userIds = new Set(
    (Array.isArray(userFormats) ? userFormats : [])
      .filter((f) => f && typeof f === 'object' && typeof f.id === 'string' && f.id.trim())
      .map((f) => fmtLc(f.id)),
  );
  const merged = mergeFormats(formats, userFormats);
  const admitted = merged.filter((f) => {
    const id = fmtLc(f?.id);
    if (!FORMAT_ID_RE.test(id)) return false;
    if (userIds.has(id)) return true;
    const localCount = ringsRunningFormat(id, listableRings).length;
    const relayCount = usageMap && usageMap.has(id) ? usageMap.get(id) : 0;
    return localCount >= 1 || relayCount >= 1;
  });
  const ordered = formatsForDiscovery(admitted, { usage, rings: listableRings });
  const available = [];
  const already = [];
  for (const raw of ordered) {
    const f = normalizeFormat(raw);
    const id = fmtLc(f.id);
    const entry = {
      format: f,
      id,
      tagline: f.tagline || id,
      description: f.description || '',
      alreadyRunning: running.has(id),
      isOwn: userIds.has(id),
      demo: f.demo === true,
    };
    if (entry.alreadyRunning) already.push(entry);
    else available.push(entry);
  }
  return [...available, ...already];
}

/**
 * adoptTemplateInRing(campaign, formatId, me) -> { ok, campaign, changed, reason? }.
 * Enforces member-only adoption and delegates to V58's adoptTemplate.
 */
export function adoptTemplateInRing(campaign, formatId, me) {
  if (!campaign || typeof campaign !== 'object') {
    return { ok: false, campaign, changed: false, reason: 'invalid-ring' };
  }
  const id = fmtLc(formatId);
  if (!FORMAT_ID_RE.test(id)) {
    return { ok: false, campaign, changed: false, reason: 'invalid-format' };
  }
  if (!canAdoptTemplate(campaign, me)) {
    return { ok: false, campaign, changed: false, reason: 'not-a-member' };
  }
  const before = formatIdsForRing(campaign);
  const updated = adoptTemplate(campaign, id);
  return { ok: true, campaign: updated, changed: !before.includes(id) };
}

/**
 * removeTemplateFromRing(campaign, formatId, me) -> { ok, campaign, changed, reason? }.
 * Enforces creator-only removal and delegates to V58's removeTemplate.
 * Past posts and assists are untouched.
 */
export function removeTemplateFromRing(campaign, formatId, me) {
  if (!campaign || typeof campaign !== 'object') {
    return { ok: false, campaign, changed: false, reason: 'invalid-ring' };
  }
  const id = fmtLc(formatId);
  if (!FORMAT_ID_RE.test(id)) {
    return { ok: false, campaign, changed: false, reason: 'invalid-format' };
  }
  if (!canRemoveTemplate(campaign, me)) {
    return { ok: false, campaign, changed: false, reason: 'not-creator' };
  }
  const before = formatIdsForRing(campaign);
  const updated = removeTemplate(campaign, id);
  return { ok: true, campaign: updated, changed: before.includes(id) };
}

let cachedSeedFormats = null;
let cachedStaticRings = null;

async function fetchSeedFormatsOnce() {
  if (cachedSeedFormats) return cachedSeedFormats;
  if (typeof globalThis.fetch !== 'function') return [];
  try {
    const res = await globalThis.fetch('data/formats.json');
    const data = await res.json();
    cachedSeedFormats = Array.isArray(data?.formats) ? data.formats : [];
  } catch {
    cachedSeedFormats = [];
  }
  return cachedSeedFormats;
}

async function fetchStaticRingsOnce() {
  if (cachedStaticRings) return cachedStaticRings;
  if (typeof globalThis.fetch !== 'function') return [];
  try {
    const res = await globalThis.fetch('data/campaigns.json');
    const data = await res.json();
    cachedStaticRings = Array.isArray(data?.campaigns) ? data.campaigns : [];
  } catch {
    cachedStaticRings = [];
  }
  return cachedStaticRings;
}

// ----------------------------------------------------------------- DOM ---

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function syncCampaignToStore(store, campaign, updated) {
  const list = [...(store.campaigns || [])];
  const idx = list.findIndex((c) => c.id === campaign.id);
  if (idx >= 0) list[idx] = updated;
  else list.push(updated);
  store.saveCampaigns(list);
  store.campaigns = list;
  campaign.members = updated.members;
  if (updated.removedMembers) campaign.removedMembers = updated.removedMembers;
  if (updated.posts) campaign.posts = updated.posts;
  if (updated.anchorPost) campaign.anchorPost = updated.anchorPost;
  if (Array.isArray(updated.formatIds)) campaign.formatIds = updated.formatIds;
  delete campaign.formatId;
}

function renderCommentsHtml(post) {
  const assists = postAssists(post);
  if (assists.length === 0) return '';
  const linkLabel = assistLinkLabel(post.platform);
  const items = assists
    .map((a) => {
      const receipt = assistReceiptText(a);
      const time = a.contributedAt ? relativeTime(a.contributedAt) : '';
      const hasUrl = typeof a.url === 'string' && a.url.trim().length > 0;
      const body = receipt
        ? `<span class="comment-author">${esc(a.handle)}</span>: <span class="comment-text">${esc(receipt)}</span>`
        : `<span class="comment-author">${esc(a.handle)}</span> <span class="comment-text">Contributed</span>`;
      const link = hasUrl
        ? ` &middot; <a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(linkLabel)}</a>`
        : '';
      const stamp = time ? ` <span class="member-time">${esc(time)}</span>` : '';
      return `<li class="post-comment">${body}${link}${stamp}</li>`;
    })
    .join('');
  return `<ul class="post-comments">${items}</ul>`;
}

function renderPostActionHtml(post, alreadyMember, me) {
  if (!alreadyMember) return '';
  const mine = myAssistFor(post, me.handle);
  if (mine) {
    const hasUrl = typeof mine.url === 'string' && mine.url.trim().length > 0;
    const linkLabel = assistLinkLabel(post.platform);
    return `<p class="post-my-status">Contributed${
      hasUrl
        ? ` &middot; <a href="${esc(mine.url)}" target="_blank" rel="noopener noreferrer">${esc(linkLabel)}</a>`
        : ''
    }</p>`;
  }
  if (quoteComposer.isComposerPlatform(post.platform)) {
    return `<div class="post-composer" data-composer-post="${esc(post.id)}"></div>`;
  }
  return `<form class="post-contribute-form cabal-form" data-contribute-post="${esc(post.id)}">
    <label>What did you do?
      <input type="text" name="note" maxlength="${ENSCRYPTION_MAX_LENGTH}" placeholder="e.g. Upvoted, left a comment, shared to #Ring" autocomplete="off">
    </label>
    <label>Share link (optional)
      <input type="text" name="url" placeholder="https://..." autocomplete="off">
    </label>
    <div class="cabal-form-footer">
      <button type="submit" class="primary btn-sm">I contributed</button>
    </div>
  </form>`;
}

async function copyShareUrl(url, doc) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      showToast('Invite link copied', { doc });
      return true;
    }
  } catch { /* fallback below */ }
  try {
    const tmp = doc.createElement('textarea');
    tmp.value = url;
    tmp.setAttribute('readonly', '');
    tmp.style.position = 'fixed';
    tmp.style.opacity = '0';
    doc.body.appendChild(tmp);
    tmp.select();
    doc.execCommand('copy');
    tmp.remove();
    showToast('Invite link copied', { doc });
    return true;
  } catch {
    showToast('Could not copy link — open Show raw link to copy manually', { doc });
    return false;
  }
}

export function mount(rootEl, ctx) {
  const store = resolveStore(ctx);
  const campaign = ctx && ctx.campaign;
  let mountedComposers = [];
  let activeTab = normalizeRingTab(ctx?.initialTab);
  let loadedSeedFormats = Array.isArray(ctx?.formats) ? ctx.formats : cachedSeedFormats || [];
  let loadedStaticRings = Array.isArray(ctx?.rings) ? ctx.rings : cachedStaticRings || [];
  let activePicker = null;
  let mounted = true;

  function closeTemplatePicker() {
    if (!activePicker) return;
    const { backdrop, sheet, onKey } = activePicker;
    activePicker = null;
    if (onKey && rootEl.ownerDocument && typeof rootEl.ownerDocument.removeEventListener === 'function') {
      rootEl.ownerDocument.removeEventListener('keydown', onKey);
    }
    if (typeof backdrop.remove === 'function') backdrop.remove();
    if (typeof sheet.remove === 'function') sheet.remove();
  }

  function currentUserFormats() {
    return Array.isArray(ctx?.userFormats) ? ctx.userFormats : loadUserFormats();
  }

  function allKnownFormats() {
    return mergeFormats(loadedSeedFormats, currentUserFormats());
  }

  function allKnownRings() {
    const local = Array.isArray(store.campaigns) ? store.campaigns : [];
    const byId = new Map();
    for (const r of loadedStaticRings) if (r && r.id) byId.set(r.id, r);
    for (const r of local) if (r && r.id) byId.set(r.id, r);
    if (campaign && campaign.id) byId.set(campaign.id, campaign);
    return [...byId.values()];
  }

  function teardownComposers() {
    closeTemplatePicker();
    for (const h of mountedComposers) {
      if (h && typeof h.destroy === 'function') h.destroy();
    }
    mountedComposers = [];
  }

  function applyTab(tab) {
    activeTab = normalizeRingTab(tab);
    rootEl.querySelectorAll('[data-ring-tab]').forEach((btn) => {
      const selected = btn.dataset.ringTab === activeTab;
      btn.setAttribute('aria-selected', String(selected));
    });
    rootEl.querySelectorAll('[data-ring-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.ringPanel !== activeTab;
    });
    if (typeof ctx?.onTabChange === 'function') {
      ctx.onTabChange(activeTab);
    }
  }

  function render() {
    teardownComposers();
    if (!campaign) {
      rootEl.innerHTML =
        '<section class="campaign-page"><p class="empty-state">No ring here — open one from a link or from Home.</p></section>';
      return;
    }

    const game = campaign.game || store.game || { name: 'Untitled game', links: {}, tags: [] };
    const me = store.me || {};
    const iAmRemoved = controlsHidden(campaign, me);
    const isLocalSoloCreator =
      !iAmRemoved &&
      !me.handle &&
      Boolean(store.game?.name) &&
      Array.isArray(campaign.members) &&
      campaign.members.length === 1 &&
      !campaign.members[0]?.handle &&
      campaign.members[0]?.name === store.game.name;
    const alreadyMember =
      !iAmRemoved &&
      (isLocalSoloCreator ||
        (campaign.members || []).some(
          (m) => me.handle && handleKey(m.handle) === handleKey(me.handle),
        ));
    const posts = feedPosts(campaign);
    const quotable = newestQuotablePost(campaign);
    const baseUrl =
      typeof window !== 'undefined' ? window.location.href.split('#')[0] : '';
    const relayConfig = nostrModel.loadRelays();
    const share = shareLinkFor(campaign, baseUrl, relayConfig.relays);
    const stack = memberStackSummary(campaign.members || [], 4);
    const showInvitePrompt = shouldShowInvitePrompt(campaign);
    const showTemplates = shouldShowTemplatesSection(campaign);

    const links = game.links || {};
    const gameLinks = [
      links.steam ? `<a class="platform-chip" href="${esc(links.steam)}" target="_blank" rel="noopener noreferrer">Steam</a>` : '',
      links.itch ? `<a class="platform-chip" href="${esc(links.itch)}" target="_blank" rel="noopener noreferrer">itch.io</a>` : '',
      links.x ? `<a class="platform-chip" href="${esc(links.x)}" target="_blank" rel="noopener noreferrer">X</a>` : '',
    ]
      .filter(Boolean)
      .join('');

    const avatarStackHtml = stack.visible
      .map(
        (m) =>
          `<span class="avatar avatar-sm avatar-h${avatarHue(m.handle || m.name)}" title="${esc(m.name || m.handle)}">${esc(initials(m.name || m.handle))}</span>`,
      )
      .join('') +
      (stack.overflow > 0 ? `<span class="avatar avatar-sm avatar-overflow">+${stack.overflow}</span>` : '');

    const feedHtml = posts.length
      ? posts
          .map((post) => {
            const authorLabel = post.authorName || post.author;
            const metaLine = postMetaLine(post);
            const showPassOn = quotable && quotable.id === post.id;
            const isOwnPost =
              me.handle && handleKey(post.author) === handleKey(me.handle);
            return `<article class="post-card feed-post" data-post-id="${esc(post.id)}" data-platform="${esc(post.platform)}">
              <div class="post-head">
                <span class="avatar avatar-h${avatarHue(post.author)}">${esc(initials(post.authorName || post.author))}</span>
                <div class="post-head-meta">
                  <span class="post-author">${esc(authorLabel)}</span>
                  <span class="post-time">${esc(metaLine)}</span>
                </div>
              </div>
              ${post.text ? `<blockquote>&ldquo;${esc(post.text)}&rdquo;</blockquote>` : ''}
              <p class="anchor-meta"><a href="${esc(post.url)}" target="_blank" rel="noopener noreferrer">View post</a></p>
              ${renderCommentsHtml(post)}
              ${renderPostActionHtml(post, alreadyMember, me)}
              ${
                showPassOn
                  ? `<div class="ring-pass-on-bar">
                      ${isOwnPost ? '' : `<button type="button" class="btn-sm" data-pass-on-post="${esc(post.id)}">I passed it on</button>`}
                      <details class="pass-on-details">
                        <summary>About passing it on</summary>
                        <p class="ring-pass-on">${esc(PASS_IT_ON_COPY)}</p>
                      </details>
                    </div>`
                  : ''
              }
            </article>`;
          })
          .join('')
      : '<p class="empty-state">No posts in this ring yet.</p>';

    const platformOptionsHtml = PLATFORM_OPTIONS.map(
      (p) => `<option value="${esc(p)}">${esc(platformLabel(p))}</option>`,
    ).join('');

    const relayChipText = relayConfig.relays.length
      ? `${relayConfig.relays.length} relay${relayConfig.relays.length === 1 ? '' : 's'} configured`
      : 'Local only \u00b7 relays not configured';

    const canAdopt = canAdoptTemplate(campaign, me);
    const templateChips = runningTemplateChips(campaign, allKnownFormats(), me);
    const templatesHtml = showTemplates
      ? `<section class="ring-templates" aria-label="Ring templates">
          <div class="ring-templates-head">
            <h3 class="section-eyebrow">Templates</h3>
            ${canAdopt ? '<button type="button" id="ring-adopt-template-btn" class="btn-sm">Browse &amp; adopt template</button>' : ''}
          </div>
          ${
            templateChips.length
              ? `<ul class="ring-template-chips">${templateChips
                  .map(
                    (c) => `<li class="template-chip" data-template-id="${esc(c.id)}">
                      <a class="template-chip-link" href="${esc(c.href)}" data-open-format="${esc(c.id)}">${esc(c.tagline)}</a>
                      ${c.removable ? `<button type="button" class="template-chip-remove" data-remove-template="${esc(c.id)}" data-template-tagline="${esc(c.tagline)}" aria-label="Remove ${esc(c.tagline)}">&times;</button>` : ''}
                    </li>`,
                  )
                  .join('')}</ul>`
              : '<p class="ring-templates-empty">No templates running yet.</p>'
          }
        </section>`
      : '';

    const invitePromptHtml = showInvitePrompt
      ? `<aside class="ring-invite-prompt" id="ring-invite-prompt" aria-label="Invite other devs">
          <p class="ring-invite-prompt-copy"><strong>Your ring is live.</strong> It needs other devs.</p>
          <div class="ring-invite-prompt-row">
            <input type="text" readonly class="ring-invite-prompt-input" id="ring-invite-prompt-link" value="${esc(share.url)}" aria-label="Ring invite link">
            <button type="button" id="ring-invite-prompt-copy" class="primary btn-sm">${NAV_ICONS.copy}<span>Copy invite link</span></button>
          </div>
          ${share.note ? `<p class="ring-share-note">${esc(share.note)}</p>` : ''}
        </aside>`
      : '';

    rootEl.innerHTML = `
      <section class="campaign-page ${RING_COLUMN_CLASS}">
        ${invitePromptHtml}
        <header class="cabal-page-header ring-header">
          <div class="cabal-page-header-main">
            <div class="ring-title-row">
              <h2>${esc(campaign.title)}</h2>
              ${campaign.demo ? '<span class="demo-badge">DEMO</span>' : ''}
            </div>
            <div class="ring-subtitle-row">
              <span class="ring-game-name">${esc(game.name)}</span>
              ${gameLinks}
              ${game.tags && game.tags.length ? `<span class="game-tags">${game.tags.map(esc).join(' &middot; ')}</span>` : ''}
            </div>
            <div class="ring-header-members">
              <div class="avatar-stack" aria-label="${stack.total} members">${avatarStackHtml}</div>
              <span class="ring-member-count">${stack.total} ${stack.total === 1 ? 'dev' : 'devs'}</span>
            </div>
          </div>
          <div class="cabal-page-header-actions">
            <button type="button" id="ring-header-share" class="btn-sm ring-share-icon-btn" aria-label="Copy ring invite link">
              ${NAV_ICONS.share}<span>Share</span>
            </button>
          </div>
        </header>

        ${templatesHtml}

        ${iAmRemoved ? `<p class="ring-removed-notice">${esc(REMOVED_NOTICE)}</p>` : ''}

        <div class="ring-tabs" role="tablist" aria-label="Ring sections">
          <button type="button" class="ring-tab" role="tab" data-ring-tab="feed" aria-selected="${activeTab === 'feed'}">Feed (${posts.length})</button>
          <button type="button" class="ring-tab" role="tab" data-ring-tab="members" aria-selected="${activeTab === 'members'}">Members (${stack.total})</button>
          <button type="button" class="ring-tab" role="tab" data-ring-tab="sync" aria-selected="${activeTab === 'sync'}">Sync</button>
        </div>

        <div class="ring-panel" role="tabpanel" data-ring-panel="feed" ${activeTab !== 'feed' ? 'hidden' : ''}>
          ${
            alreadyMember
              ? `<details class="add-post-disclosure">
                  <summary class="btn-sm primary">Add a post</summary>
                  <form id="add-post-form" class="cabal-form">
                    <p class="form-error" id="add-post-errors" hidden></p>
                    <label>Post URL
                      <input type="url" name="url" required placeholder="Paste any post URL (X, Reddit, Instagram, YouTube, …)" autocomplete="off">
                    </label>
                    <div class="cabal-form-row">
                      <label>Platform
                        <select name="platform">${platformOptionsHtml}</select>
                      </label>
                      <label>Author
                        <input type="text" name="author" required value="${esc(me.handle || '')}" placeholder="@handle" autocomplete="off">
                      </label>
                    </div>
                    <label>Post text or context
                      <textarea name="text" rows="2" placeholder="Post text (required for X / Bluesky) or a line of context"></textarea>
                    </label>
                    <label>Kind
                      <select name="kind">
                        <option value="other">Other</option>
                        <option value="announcement">Announcement</option>
                        <option value="devlog">Devlog</option>
                        <option value="clip">Clip</option>
                      </select>
                    </label>
                    <div class="cabal-form-footer">
                      <button type="submit" class="primary btn-md">Add post</button>
                    </div>
                  </form>
                </details>`
              : ''
          }
          <section class="campaign-feed">
            ${feedHtml}
          </section>
        </div>

        <div class="ring-panel" role="tabpanel" data-ring-panel="members" ${activeTab !== 'members' ? 'hidden' : ''}>
          <section class="ring">
            <h3 class="section-eyebrow">Members (${stack.total})</h3>
            ${
              (campaign.members || []).length || removedRoster(campaign).length
                ? `<ul class="ring-list">${(campaign.members || [])
                    .map(
                      (m) => `<li class="ring-member">
                        <span class="avatar avatar-h${avatarHue(m.handle || m.name)}">${esc(initials(m.name || m.handle))}</span>
                        <span class="member-name">${esc(m.name)}</span>
                        ${m.handle ? `<span class="member-handle">${esc(m.handle)}</span>` : ''}
                        ${canRemoveMember(campaign, me, m.handle) ? `<button type="button" class="member-remove btn-sm" data-remove-member="${esc(m.handle)}">Remove</button>` : ''}
                      </li>`,
                    )
                    .join('')}${removedRoster(campaign)
                    .map(
                      (r) => `<li class="ring-member ring-member-removed">
                        <span class="member-handle">${esc(atHandle(r.handle))} &mdash; removed</span>
                      </li>`,
                    )
                    .join('')}</ul>`
                : '<p class="empty-state">No members yet — be the first to join.</p>'
            }
          </section>

          <section class="ring-join">
            ${
              alreadyMember
                ? '<p class="status-pill status-pill--active">You&rsquo;re in this ring</p>'
                : iAmRemoved
                ? ''
                : `<h3 class="section-eyebrow">Join this ring</h3>
            <p class="view-lede">No account needed. Add your name and handle to join this ring.</p>
            <form id="ring-join-form" class="cabal-form">
              <p class="form-error" id="join-errors" hidden></p>
              <div class="cabal-form-row">
                <label>Your name
                  <input type="text" name="name" value="${esc(me.name || '')}" required autocomplete="off">
                </label>
                <label>Your handle
                  <input type="text" name="handle" value="${esc(me.handle || '')}" required autocomplete="off" placeholder="@yourhandle">
                </label>
              </div>
              <div class="cabal-form-footer">
                <button type="submit" class="primary btn-md">Join ring</button>
              </div>
            </form>`
            }
          </section>

          <section class="campaign-share">
            <h3 class="section-eyebrow">Share this ring</h3>
            <p class="view-lede">Anyone with this link opens this ring and can join.</p>
            <div class="ring-share-actions">
              <button type="button" id="campaign-share-copy" class="btn-md">${NAV_ICONS.copy}<span>Copy invite link</span></button>
            </div>
            ${share.note ? `<p class="ring-share-note">${esc(share.note)}</p>` : ''}
            <details class="share-raw-details">
              <summary>Show raw link</summary>
              <input type="text" readonly value="${esc(share.url)}" id="campaign-share-link" aria-label="Ring invite link">
            </details>
          </section>
        </div>

        <div class="ring-panel" role="tabpanel" data-ring-panel="sync" ${activeTab !== 'sync' ? 'hidden' : ''}>
          <section class="ring-sync-intro">
            <div class="section-head-row">
              <h3 class="section-eyebrow">Relay sync</h3>
              <span class="relay-status-chip">${esc(relayChipText)}</span>
            </div>
            <p class="view-lede">Optional Nostr relay sync keeps ring posts updated across browsers. Open settings below to configure relays or publish.</p>
          </section>
        </div>
      </section>`;

    // Wire tab switching
    rootEl.querySelectorAll('[data-ring-tab]').forEach((btn) => {
      btn.addEventListener('click', () => applyTab(btn.dataset.ringTab));
    });
    if (typeof ctx?.onTabChange === 'function') {
      ctx.onTabChange(activeTab);
    }

    // Wire header Share icon-button, V63 pinned invite card, & Members-tab Copy button -> clipboard + toast
    const doc = rootEl.ownerDocument;
    const headerShareBtn = rootEl.querySelector('#ring-header-share');
    if (headerShareBtn) {
      headerShareBtn.addEventListener('click', () => copyShareUrl(share.url, doc));
    }
    const wireCopyBtn = (btn) => {
      if (!btn) return;
      btn.addEventListener('click', async () => {
        const ok = await copyShareUrl(share.url, doc);
        const span = btn.querySelector('span');
        if (ok && span) {
          span.textContent = 'Copied!';
          setTimeout(() => {
            span.textContent = 'Copy invite link';
          }, 2000);
        }
      });
    };
    wireCopyBtn(rootEl.querySelector('#ring-invite-prompt-copy'));
    wireCopyBtn(rootEl.querySelector('#campaign-share-copy'));
    const inviteLinkInput = rootEl.querySelector('#ring-invite-prompt-link');
    if (inviteLinkInput) {
      inviteLinkInput.addEventListener('focus', () => {
        if (typeof inviteLinkInput.select === 'function') inviteLinkInput.select();
      });
    }

    // Wire "Add a post" form with passive URL prefill + full manual editability.
    const addPostForm = rootEl.querySelector('#add-post-form');
    if (addPostForm) {
      const urlInput = addPostForm.querySelector('input[name="url"]');
      const platformSelect = addPostForm.querySelector('select[name="platform"]');
      const authorInput = addPostForm.querySelector('input[name="author"]');
      const textInput = addPostForm.querySelector('textarea[name="text"]');
      const touched = { platform: false, author: false, text: false };

      platformSelect.addEventListener('change', () => { touched.platform = true; });
      authorInput.addEventListener('input', () => { touched.author = true; });
      textInput.addEventListener('input', () => { touched.text = true; });

      const prefillFromUrl = () => {
        const parsed = parsePostUrl(urlInput.value);
        if (!touched.platform && parsed.platform) {
          platformSelect.value = PLATFORM_OPTIONS.includes(parsed.platform)
            ? parsed.platform
            : 'other';
        }
        if (!touched.author && parsed.author) {
          authorInput.value = parsed.author;
        }
        if (!touched.text && (parsed.text || parsed.title)) {
          textInput.value = parsed.text || parsed.title;
        }
      };
      urlInput.addEventListener('input', prefillFromUrl);
      urlInput.addEventListener('change', prefillFromUrl);

      addPostForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = new FormData(addPostForm);
        const url = String(data.get('url') || '').trim();
        const platform = String(data.get('platform') || 'other').trim().toLowerCase();
        const author = String(data.get('author') || '').trim();
        const text = String(data.get('text') || '').trim();
        const kind = String(data.get('kind') || 'other').trim();
        const errEl = rootEl.querySelector('#add-post-errors');
        const errors = [];
        if (!/^https?:\/\//i.test(url)) errors.push('Enter a valid http(s) post URL.');
        if (!author) errors.push('Author handle is required.');
        if (quoteComposer.isComposerPlatform(platform) && !text) {
          errors.push('Post text is required for X and Bluesky posts so the similarity gate can check drafts.');
        }
        if (errors.length) {
          errEl.textContent = errors.join(' ');
          errEl.hidden = false;
          return;
        }
        try {
          let updated = addPostToCampaign(campaign, {
            url,
            platform,
            author,
            ...(me.name && handleKey(author) === handleKey(me.handle) ? { authorName: me.name } : {}),
            ...(text ? { text } : {}),
            kind,
          });
          // V62: if the solo creator skipped handle during ring creation,
          // save their handle once here and prefill it everywhere afterward.
          if (!me.handle && author) {
            const nextMe = { name: me.name || game.name, handle: author };
            if (typeof store.saveMe === 'function') {
              store.saveMe(nextMe);
              store.me = nextMe;
            }
            if (Array.isArray(updated.members) && updated.members.length === 1 && !updated.members[0].handle) {
              updated = {
                ...updated,
                createdBy: updated.createdBy || author,
                members: [{ ...updated.members[0], handle: author }],
              };
            }
          }
          syncCampaignToStore(store, campaign, updated);
          render();
        } catch (err) {
          errEl.textContent = err.message;
          errEl.hidden = false;
        }
      });
    }

    // Wire inline X / Bluesky composers for unassisted composer-tier posts.
    rootEl.querySelectorAll('[data-composer-post]').forEach((slot) => {
      const postId = slot.dataset.composerPost;
      const post = posts.find((p) => p.id === postId);
      if (!post) return;
      const handle = quoteComposer.mount(slot, {
        campaign,
        post,
        me: store.me,
        compact: true,
        onPosted: (quoteUrl, draft) => {
          const updated = markPostContributed(campaign, post.id, me.handle, {
            url: quoteUrl || undefined,
            quoteText: String(draft || '').trim() || undefined,
          });
          syncCampaignToStore(store, campaign, updated);
          // V66: completing an assist unlocks the Field Journal.
          if (typeof ctx.onAssist === 'function') ctx.onAssist({ campaignId: campaign.id, postId: post.id });
          render();
        },
      });
      mountedComposers.push(handle);
    });

    // Wire generic "I contributed" forms for non-X/Bluesky posts.
    rootEl.querySelectorAll('[data-contribute-post]').forEach((form) => {
      const postId = form.dataset.contributePost;
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = new FormData(form);
        const note = sanitizeEnscryption(data.get('note'));
        const url = String(data.get('url') || '').trim();
        const updated = markPostContributed(campaign, postId, me.handle, {
          ...(url ? { url } : {}),
          ...(note ? { note } : {}),
        });
        syncCampaignToStore(store, campaign, updated);
        // V66: completing an assist unlocks the Field Journal.
        if (typeof ctx.onAssist === 'function') ctx.onAssist({ campaignId: campaign.id, postId });
        render();
      });
    });

    // "I passed it on" — self-reported receipt for the pass-it-on milestone.
    rootEl.querySelectorAll('[data-pass-on-post]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (typeof ctx.onPassOn === 'function') {
          ctx.onPassOn({ campaignId: campaign.id, postId: btn.dataset.passOnPost });
        }
        btn.disabled = true;
        btn.textContent = 'Passed on — noted.';
      });
    });

    // Creator-only Remove: confirm step, then local state only.
    rootEl.querySelectorAll('[data-remove-member]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const handle = btn.dataset.removeMember;
        if (!canRemoveMember(campaign, me, handle)) return;
        const ok =
          typeof globalThis.confirm === 'function'
            ? globalThis.confirm(removeConfirmCopy(handle))
            : false;
        if (!ok) return;
        const updated = removeMemberFromCampaign(campaign, handle, { by: me.handle });
        syncCampaignToStore(store, campaign, updated);
        if (typeof ctx.onMemberRemoved === 'function') {
          ctx.onMemberRemoved({ campaignId: campaign.id, handle });
        }
        render();
      });
    });

    // Wire template chip navigation, creator-only removal, and browse/adopt picker.
    rootEl.querySelectorAll('[data-open-format]').forEach((link) => {
      link.addEventListener('click', (e) => {
        if (typeof ctx?.navigate === 'function') {
          e.preventDefault();
          ctx.navigate('format', { formatId: link.dataset.openFormat });
        }
      });
    });

    rootEl.querySelectorAll('[data-remove-template]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const formatId = btn.dataset.removeTemplate;
        const tagline = btn.dataset.templateTagline || formatId;
        if (!canRemoveTemplate(campaign, me)) return;
        const ok =
          typeof globalThis.confirm === 'function'
            ? globalThis.confirm(removeTemplateConfirmCopy(tagline))
            : false;
        if (!ok) return;
        const res = removeTemplateFromRing(campaign, formatId, me);
        if (!res.ok || !res.changed) return;
        syncCampaignToStore(store, campaign, res.campaign);
        if (typeof ctx?.onTemplateRemoved === 'function') {
          ctx.onTemplateRemoved({ campaignId: campaign.id, formatId, campaign: res.campaign });
        }
        showToast('Template removed', { doc });
        render();
      });
    });

    const adoptTemplateBtn = rootEl.querySelector('#ring-adopt-template-btn');
    if (adoptTemplateBtn) {
      adoptTemplateBtn.addEventListener('click', () => {
        closeTemplatePicker();
        const entries = pickableFormatsForRing(campaign, {
          formats: loadedSeedFormats,
          userFormats: currentUserFormats(),
          rings: allKnownRings(),
          usage: ctx?.usage || null,
        });

        const backdrop = doc.createElement('div');
        backdrop.className = 'adopt-picker-backdrop is-open';
        const sheet = doc.createElement('div');
        sheet.className = 'adopt-picker-sheet is-open';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');
        sheet.setAttribute('aria-label', 'Adopt a template');

        const listHtml = entries.length
          ? `<ul class="adopt-picker-list">${entries
              .map(
                (item) => `<li class="adopt-picker-item">
                  <button type="button" class="adopt-picker-row" data-pick-format="${esc(item.id)}" ${item.alreadyRunning ? 'disabled' : ''}>
                    <span class="adopt-picker-row-main">
                      <span class="adopt-picker-row-title">${esc(item.tagline)}</span>
                      ${item.description ? `<span class="adopt-picker-row-sub">${esc(item.description)}</span>` : ''}
                    </span>
                    <span class="adopt-picker-row-badges">
                      ${item.isOwn ? '<span class="status-pill">Yours</span>' : ''}
                      ${item.demo ? '<span class="demo-badge">DEMO</span>' : ''}
                      ${item.alreadyRunning ? '<span class="status-pill status-pill--active">Running</span>' : ''}
                    </span>
                  </button>
                </li>`,
              )
              .join('')}</ul>`
          : '<p class="empty-state">No templates available yet. Create one to run it in this ring.</p>';

        sheet.innerHTML = `
          <div class="adopt-sheet-handle-area"><span class="adopt-sheet-handle"></span></div>
          <div class="adopt-picker-head">
            <h3 class="adopt-picker-title">Adopt a template</h3>
            <button type="button" class="btn-sm adopt-picker-close">Close</button>
          </div>
          <div class="adopt-picker-body">
            ${listHtml}
          </div>
          <div class="adopt-picker-foot">
            <a class="section-head-link" href="#/campaigns/new">New post format</a>
          </div>
        `;

        sheet.querySelector('.adopt-sheet-handle-area')?.addEventListener('click', closeTemplatePicker);
        sheet.querySelector('.adopt-picker-close')?.addEventListener('click', closeTemplatePicker);
        sheet.querySelector('.adopt-picker-foot a')?.addEventListener('click', closeTemplatePicker);
        sheet.querySelectorAll('[data-pick-format]').forEach((rowBtn) => {
          rowBtn.addEventListener('click', () => {
            const fmtId = rowBtn.dataset.pickFormat;
            const res = adoptTemplateInRing(campaign, fmtId, me);
            if (!res.ok) return;
            if (res.changed) {
              syncCampaignToStore(store, campaign, res.campaign);
              if (typeof ctx?.onTemplateAdopted === 'function') {
                ctx.onTemplateAdopted({ campaignId: campaign.id, formatId: fmtId, campaign: res.campaign });
              }
              showToast('Template adopted', { doc });
            }
            closeTemplatePicker();
            render();
          });
        });

        backdrop.addEventListener('click', closeTemplatePicker);
        const onKey = (ev) => {
          if (ev && ev.key === 'Escape') closeTemplatePicker();
        };
        if (typeof doc.addEventListener === 'function') {
          doc.addEventListener('keydown', onKey);
        }
        (doc.body || rootEl).appendChild(backdrop);
        (doc.body || rootEl).appendChild(sheet);
        activePicker = { backdrop, sheet, onKey };
      });
    }

    // Wire Join form.
    const joinForm = rootEl.querySelector('#ring-join-form');
    if (joinForm) {
      joinForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = new FormData(joinForm);
        const name = String(data.get('name') || '').trim();
        const handle = String(data.get('handle') || '').trim();
        const errEl = rootEl.querySelector('#join-errors');
        if (!name || !handle) {
          errEl.textContent = 'Name and handle are both required to join.';
          errEl.hidden = false;
          return;
        }
        const updated = addMember(campaign, { name, handle });
        syncCampaignToStore(store, campaign, updated);
        store.saveMe({ name, handle });
        store.me = { name, handle };
        render();
      });
    }
  }

  render();

  // Best-effort browser hydrate when caller did not inject formats/rings.
  if (!Array.isArray(ctx?.formats) && !cachedSeedFormats && typeof globalThis.fetch === 'function') {
    Promise.all([fetchSeedFormatsOnce(), fetchStaticRingsOnce()]).then(([fmts, statics]) => {
      if (!mounted) return;
      loadedSeedFormats = fmts;
      if (!Array.isArray(ctx?.rings)) loadedStaticRings = statics;
      if (rootEl.isConnected !== false) render();
    });
  }
}
