# V24 — Discovery: similar + popular over a static list

Scope: browsable campaign list, tag-match similarity, popularity by member count, listing filters.
Files owned: `src/discovery.mjs`, `data/campaigns.json`, `tests/v24-discovery.test.mjs`
Status: open
Branch: `task/V24-discovery`

## Frozen contract
- Campaign shape is defined in `tasks/V21-campaign-core.md` (same shape; do not redefine it).
- Listing filters (brief section 4, decided): a campaign shows in discovery ONLY when (a) its game attaches a real game page — `game.links.steam` or `game.links.itch` present and a valid http(s) URL — AND (b) at least 2 members (creator + one joiner). The ring is the proof; a campaign with zero joiners stays invisible.
- `data/campaigns.json`: `{ "version": 1, "updated": "2026-11-22", "campaigns": [...] }`. Ship it with exactly ONE example campaign, fully fictional, flagged `"demo": true` (a different game from the V25 demo seed — use "Brass Orchard", a cozy farming game, tags [cozy, farming]). The file documents the format; real campaigns arrive by adding entries here.
- `src/discovery.mjs` pure functions:
  - `isListable(campaign)` — the two filters above.
  - `tagSimilarity(aTags, bTags)` — Jaccard on lowercased tag sets (reuse the formula from src/match.mjs jaccard; do NOT edit match.mjs, duplicate the 5-line function and note it for integration).
  - `similarCampaigns(myTags, campaigns)` — listable only, sorted by tagSimilarity desc, ties by members desc.
  - `popularCampaigns(campaigns)` — listable only, sorted by members.length desc.
  - `mergeLists(staticList, localCampaigns)` — dedupe by campaign id, local wins.
  - `mount(rootEl, ctx)` where `ctx = { myTags, campaigns, navigate }` — renders two sections ("Similar games" and "Popular"), each campaign row shows game name, title, member count, posted count, tags, and a DEMO badge when demo. Clicking a row navigates to the campaign page.

## Acceptance
- `tests/v24-discovery.test.mjs` covers: isListable (no game link -> false, 1 member -> false, both filters met -> true), tagSimilarity ordering, popular ordering, merge dedupe.
- `npm test` green on the branch. Do NOT touch index.html, app.js, style.css, tasks/INDEX.md, src/match.mjs, or any other track's files. Do NOT merge. Push the branch and report: branch, files, test count, the example campaign in data/campaigns.json.
