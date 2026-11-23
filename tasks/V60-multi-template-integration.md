# V60 — Multi-template integration (coordinator lane)

Status: done (pending merge). Branch: `task/V60-multi-template-integration`.
Base: `origin/main` cf0f22d (v0.2.33, V58+V59 merged).

## What it wires up

- **Preselected creation stores `formatIds`**: `src/home.mjs` passes
  `formatIds: [ctx.formatId]` into `createCampaign` instead of setting a
  legacy `campaign.formatId` after creation. `createCampaign` normalizes to
  `formatIds` and drops the legacy key.
- **Demo data**: ToonSouls (`data/campaigns.json`) now runs two templates —
  `"formatIds": ["fmt_oneclip1", "fmt_algoigno"]` — so the live net shows a
  ring with two `runs` edges. `tests/v53-integration.test.mjs` updated to
  assert the new canonical form.
- **app.js wiring** (coordinator-owned file):
  - `renderFormat`: passes `store`, `me`, `myRings`, and `onAdopt` to
    `formats.mount`; `onAdopt` republishes the ring's kind-30078 adoption
    event (best-effort, like the V43c removal republish).
  - `renderCampaign`: passes `formats` (merged), `rings` (local store),
    `usage` (usageCache), `onTemplateAdopted` / `onTemplateRemoved`, each
    republishing the adoption event best-effort.
  - `renderCampaigns`: builds `postersByFormat` (Map, lowercase format id ->
    posters) from the same rings as the graph and passes it to
    `nodeView.mount` for the panel roster.
- **Template = the node of everybody who posted it** (Cade, Nov 23 ~13:44):
  - New pure helper `postersForFormat(formatId, rings)` in
    `src/campaign-formats.mjs`: post authors + assist contributors across
    every ring running the format, deduped by handle, with name resolved
    from member records and per-ring attribution. Legacy `formatId` rings
    count; anchorPost-only rings count their author; rings with no posts
    contribute nothing.
  - Format page mount renders a "Posted by" roster after "Rings running
    this template" (empty state when nobody has posted yet).
  - Node detail panel renders a "Posted by" roster for format nodes from
    `ctx.postersByFormat`. The panel's Connections list already showed the
    rings; the roster adds the people. No new import in `node-view.mjs`
    (the map comes via ctx, so no module cycle).
  - Share-gate unchanged: a template stays invisible until at least one
    ring runs it (`buildGraph` admits format nodes only with count >= 1).

## Verification

- `npm test`: full suite green (see coordinator report for the count).
- Playwright localhost smoke: net renders with a two-`runs`-edge ring;
  adopt flow cold < 60s (see coordinator report).
- Live verification on the deployed build: version.json + live net +
  live adopt flow (see coordinator report).

## Open / deferred

- V54 empty-graph fix round still runs on its own branch (based on
  49a9a9a); it will need a rebase onto main. Its import-map + positions
  fallback do not conflict with V60's files.
- Node panel roster is data-only (names/handles); no per-poster navigation
  yet — tapping a poster does nothing. A future pass could link posters to
  their rings or posts.
