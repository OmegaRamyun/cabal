// V47(a): pure helpers for the campaign-page Sync panel (app.js, V48 applies).
// The panel must mount for ANY campaign findCampaign() resolves — local
// (localStorage) or static listed (data/campaigns.json, e.g. a formerly
// listed demo). And a sync of one campaign must never replace the whole
// stored list.

import { hasCampaignKey, isPublished } from "./nostr.mjs";

/** Merge synced campaigns into the stored list by id; other campaigns untouched. */
export function mergeSyncedIntoStore(stored, synced, original) {
  const out = (stored ?? []).map((c) => c);
  const idx = new Map(out.map((c, i) => [c.id, i]));
  for (const c of synced ?? []) {
    if (idx.has(c.id)) { out[idx.get(c.id)] = c; continue; }
    // A static listed campaign stays out of localStorage unless the sync
    // actually changed it (no silent promotion of read-only examples).
    if (original && c.id === original.id && JSON.stringify(c) === JSON.stringify(original)) continue;
    idx.set(c.id, out.length);
    out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------------------
// V76 — sync attention: does the Sync tab deserve a badge / nudge?
// ---------------------------------------------------------------------------
/**
 * Aggregate over the user's rings: `{ needsAttention, reason }`.
 * Pure. `relayInfo` is `{ configured, relays }` as returned by
 * nostr.loadRelays(). Reasons: "relays-unconfigured" (a writable ring
 * exists but relays were never set up) or "unpublished" (a writable ring
 * has never had a relay-accepted publish stamped). Read-only rings and
 * fully published rings never need attention. app.js reads this to badge
 * the Sync tab / nudge after ring creation — the panel shell itself is
 * app.js-owned, so this helper only answers the question, it renders nothing.
 */
export function syncAttention(campaigns, relayInfo = {}) {
  const list = Array.isArray(campaigns) ? campaigns : [];
  const writable = list.filter(hasCampaignKey);
  if (!writable.length) return { needsAttention: false, reason: null };
  const { configured = false, relays = [] } = relayInfo;
  if (!configured || !relays.length) return { needsAttention: true, reason: "relays-unconfigured" };
  if (writable.some((c) => !isPublished(c))) return { needsAttention: true, reason: "unpublished" };
  return { needsAttention: false, reason: null };
}
