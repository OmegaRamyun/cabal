// V24 — Discovery: similar + popular over a static list.
// Pure functions in the core; DOM only in mount(). Listing filters per
// REDESIGN-BRIEF.md section 4: a campaign shows in discovery only when
// its game attaches a real game page (Steam or itch, valid http(s) URL)
// AND at least 2 members (creator + one joiner). The ring is the proof.
// Tag similarity reuses src/match.mjs's jaccard; postedCount comes from
// src/campaign.mjs (both re-exported where tests need them).

import { jaccard } from './match.mjs';
import { postedCount, initials, avatarHue } from './campaign.mjs';

export { postedCount };

function isHttpUrl(s) {
  if (typeof s !== "string" || !/^https?:\/\//i.test(s.trim())) return false;
  try {
    const u = new URL(s.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function isListable(campaign) {
  if (!campaign || typeof campaign !== "object") return false;
  const links = campaign.game?.links;
  const hasGamePage =
    isHttpUrl(links?.steam) || isHttpUrl(links?.itch);
  const members = Array.isArray(campaign.members) ? campaign.members : [];
  return hasGamePage && members.length >= 2;
}

const tagSet = (tags) =>
  new Set((Array.isArray(tags) ? tags : []).map((t) => String(t).trim().toLowerCase()).filter(Boolean));

export function tagSimilarity(aTags, bTags) {
  return jaccard(tagSet(aTags), tagSet(bTags));
}

const memberCount = (c) => (Array.isArray(c.members) ? c.members.length : 0);

export function similarCampaigns(myTags, campaigns) {
  const mine = tagSet(myTags);
  return (Array.isArray(campaigns) ? campaigns : [])
    .filter(isListable)
    .map((c) => ({ c, sim: jaccard(mine, tagSet(c.game?.tags)) }))
    .sort(
      (a, b) =>
        b.sim - a.sim ||
        memberCount(b.c) - memberCount(a.c) ||
        String(a.c.id).localeCompare(String(b.c.id)),
    )
    .map(({ c }) => c);
}

export function popularCampaigns(campaigns) {
  return (Array.isArray(campaigns) ? campaigns : [])
    .filter(isListable)
    .sort(
      (a, b) =>
        memberCount(b) - memberCount(a) ||
        String(a.id).localeCompare(String(b.id)),
    );
}

// Dedupe by campaign id, local wins. Static order is kept, with a local
// entry replacing the static one in place; local-only entries append.
export function mergeLists(staticList, localCampaigns) {
  const localById = new Map(
    (Array.isArray(localCampaigns) ? localCampaigns : []).map((c) => [c.id, c]),
  );
  const out = (Array.isArray(staticList) ? staticList : []).map(
    (c) => localById.get(c.id) || c,
  );
  const seen = new Set(out.map((c) => c.id));
  for (const c of localById.values()) {
    if (!seen.has(c.id)) out.push(c);
  }
  return out;
}

// ---- DOM (mount only) ----
function el(doc, tag, text, cls) {
  const n = doc.createElement(tag);
  if (text != null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

function rowEl(doc, campaign, navigate) {
  const li = el(doc, "li", null, "discovery-row");
  const btn = el(doc, "button", null, "discovery-row-btn");
  btn.type = "button";
  const gameName = campaign.game?.name || "Untitled game";
  const tags = (campaign.game?.tags || []).join(", ");
  btn.appendChild(el(doc, "span", initials(gameName), `avatar avatar-h${avatarHue(gameName)}`));
  btn.appendChild(el(doc, "span",
    `${gameName} — ${campaign.title} — ` +
    `${memberCount(campaign)} members, ${postedCount(campaign)} posted` +
    (tags ? ` — ${tags}` : ""),
    "discovery-row-label"));
  if (campaign.demo) {
    const badge = el(doc, "span", "DEMO", "demo-badge");
    btn.appendChild(badge);
  }
  btn.addEventListener("click", () => {
    if (typeof navigate === "function") navigate(campaign);
  });
  li.appendChild(btn);
  return li;
}

/**
 * mount(rootEl, ctx) ctx: { myTags, campaigns, navigate }
 * Renders two sections, "Similar games" and "Popular". Each row shows
 * game name, title, member count, posted count, tags, and a DEMO badge
 * when demo. Clicking a row calls navigate(campaign) — the caller opens
 * the campaign page (link intent). Read-only: no posting, no storage.
 */
export function mount(rootEl, ctx = {}) {
  const doc = rootEl.ownerDocument;
  const campaigns = Array.isArray(ctx.campaigns) ? ctx.campaigns : [];
  const similar = similarCampaigns(ctx.myTags, campaigns);
  const popular = popularCampaigns(campaigns);
  rootEl.textContent = "";

  rootEl.appendChild(el(doc, "h2", "Similar games"));
  const simList = el(doc, "ul", null, "discovery-similar");
  if (!similar.length) simList.appendChild(el(doc, "li", "No similar campaigns yet.", "empty-state"));
  for (const c of similar) simList.appendChild(rowEl(doc, c, ctx.navigate));
  rootEl.appendChild(simList);

  rootEl.appendChild(el(doc, "h2", "Popular"));
  const popList = el(doc, "ul", null, "discovery-popular");
  if (!popular.length) popList.appendChild(el(doc, "li", "No popular campaigns yet.", "empty-state"));
  for (const c of popular) popList.appendChild(rowEl(doc, c, ctx.navigate));
  rootEl.appendChild(popList);
}
