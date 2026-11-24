// V24 — Discovery: similar + popular over a static list.
// Pure functions in the core; DOM only in mount(). Listing filters per
// REDESIGN-BRIEF.md section 4: a campaign shows in discovery only when
// its game attaches a real game page (Steam or itch, valid http(s) URL)
// AND at least 2 members (creator + one joiner). The ring is the proof.
// Tag similarity reuses src/match.mjs's jaccard; postedCount comes from
// src/campaign.mjs (both re-exported where tests need them).

import { jaccard } from './match.mjs';
import { postedCount, latestActivity, relativeTime, initials, avatarHue } from './campaign.mjs';
import { formatsForDiscovery, usageLabel, normalizeFormat } from './campaign-formats.mjs';

export { postedCount };

// V49: the Campaigns view's create action.
export const NEW_TEMPLATE_LABEL = "New post format";
export const NEW_TEMPLATE_ROUTE = "#/campaigns/new";
export const NEW_TEMPLATE_HELP =
  "A template is a format you write once: the shape of a post and how to disclose it. " +
  "Save it here and any ring can pick it up and run it in its own words.";

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
  // Honest copy: distinct ringmates who have contributed, never an assist
  // count; latest activity is the newest post or assist, not a window.
  const contributed = postedCount(campaign);
  const active = relativeTime(latestActivity(campaign));
  btn.appendChild(el(doc, "span",
    `${gameName} — ${campaign.title} — ` +
    `${memberCount(campaign)} members, ` +
    `${contributed} ringmate${contributed === 1 ? " has" : "s have"} contributed` +
    (active ? ` — active ${active}` : "") +
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

// V45: the Campaigns view lists FORMATS (meme templates any ring can run).
function formatRowEl(doc, format, usage, navigateFormat) {
  const f = normalizeFormat(format);
  const li = el(doc, "li", null, "discovery-row format-row");
  const btn = el(doc, "button", null, "discovery-row-btn");
  btn.type = "button";
  const used = usageLabel(f.id, usage); // null without real usage data
  btn.appendChild(el(doc, "span", f.tagline, "discovery-row-label"));
  if (f.description) btn.appendChild(el(doc, "span", ` — ${f.description}`, "format-row-desc"));
  if (used) btn.appendChild(el(doc, "span", ` — ${used}`, "format-usage"));
  if (f.demo) btn.appendChild(el(doc, "span", "DEMO", "demo-badge"));
  btn.addEventListener("click", () => {
    if (typeof navigateFormat === "function") navigateFormat(format);
  });
  li.appendChild(btn);
  return li;
}

/**
 * mount(rootEl, ctx) ctx: { myTags, campaigns, navigate, formats?,
 * sortByUsage?, rings?, navigateFormat? }
 * V45: this view is "Campaigns" — the template list. When ctx.formats is
 * given, a "Campaigns" section lists them in formatsForDiscovery order;
 * ctx.sortByUsage (V46 shape: Map id -> distinct-ring count) puts most-used
 * first and shows "used by N rings". Until V46 lands there is no usage, so
 * the order falls back to member-count order. The ring-discovery sections
 * below stay as "rings you could join".
 * Renders two sections, "Similar games" and "Popular". Each row shows
 * game name, title, member count, contributed ringmates, latest activity, tags, and a DEMO badge
 * when demo. Clicking a row calls navigate(campaign) — the caller opens
 * the campaign page (link intent). Read-only: no posting, no storage.
 */
export function mount(rootEl, ctx = {}) {
  const doc = rootEl.ownerDocument;
  const campaigns = Array.isArray(ctx.campaigns) ? ctx.campaigns : [];
  const similar = similarCampaigns(ctx.myTags, campaigns);
  const popular = popularCampaigns(campaigns);
  rootEl.textContent = "";

  if (Array.isArray(ctx.formats)) {
    rootEl.appendChild(el(doc, "h2", "Campaigns"));
    rootEl.appendChild(el(doc, "p",
      "Formats that are catching on. Any ring can pick one up and run it in its own words.",
      "view-lede"));
    // V49: the create action lives on the view itself, with what it is
    // and what happens next, so nobody needs the primer to find it.
    const newBtn = el(doc, "button", NEW_TEMPLATE_LABEL, "primary new-template");
    newBtn.type = "button";
    newBtn.addEventListener("click", () => {
      if (typeof ctx.onNewTemplate === "function") ctx.onNewTemplate();
      else if (ctx.location) ctx.location.hash = NEW_TEMPLATE_ROUTE;
      else if (globalThis.location) globalThis.location.hash = NEW_TEMPLATE_ROUTE;
    });
    rootEl.appendChild(el(doc, "p", null, "view-create")).appendChild(newBtn);
    rootEl.appendChild(el(doc, "p", NEW_TEMPLATE_HELP, "view-lede new-template-help"));
    // V48: the honest-limits line travels with any usage count (V46).
    // Shown only once a relay query has been attempted (sortByUsage set).
    if (ctx.sortByUsage && typeof ctx.usageNote === "string" && ctx.usageNote) {
      rootEl.appendChild(el(doc, "p", ctx.usageNote, "view-lede format-usage-note"));
    }
    const fmts = formatsForDiscovery(ctx.formats, { usage: ctx.sortByUsage, rings: ctx.rings });
    const fmtList = el(doc, "ul", null, "discovery-formats");
    if (!fmts.length) fmtList.appendChild(el(doc, "li", "No campaign formats yet.", "empty-state"));
    for (const f of fmts) fmtList.appendChild(formatRowEl(doc, f, ctx.sortByUsage, ctx.navigateFormat));
    rootEl.appendChild(fmtList);
  }

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
