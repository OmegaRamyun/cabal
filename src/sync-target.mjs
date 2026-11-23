// V47(a): pure helpers for the campaign-page Sync panel (app.js, V48 applies).
// The panel must mount for ANY campaign findCampaign() resolves — local
// (localStorage) or static listed (data/campaigns.json, e.g. ToonSouls).
// And a sync of one campaign must never replace the whole stored list.

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
