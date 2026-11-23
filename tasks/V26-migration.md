# V26 — Migration: Stage 1 modules re-homed

Scope: make the kept Stage 1 modules campaign-aware; document the re-homing.
Files owned: `src/checklist.mjs`, `src/discord.mjs`, `tests/v26-migration.test.mjs`
Status: claimed
Branch: `task/V26-migration`

## Frozen contract
- Campaign shape is defined in `tasks/V21-campaign-core.md` (same shape; do not redefine it).
- Do NOT break existing exports or existing tests (t06, t09 must stay green). Add additive functions only, unless a change is forced — if forced, say so in your report.

## Work
- `src/checklist.mjs`: per-campaign checklist state. Add `createCampaignChecklist(campaignId)` / `checklistKey(campaignId)` (storage key `cabal.v2.checklist.<campaignId>`), and `campaignChecklistItems(campaign)` — the standard items plus a campaign-specific item ("Anchor post link works", "Every member's quote is in their own words"). Keep `createChecklistState` etc. working unchanged.
- `src/discord.mjs`: campaign announcement. Add `buildCampaignAnnouncement(campaign)` returning `{ content, embeds }` shaped for `buildPayload` — announce the campaign (game, anchor post link, window, join link placeholder text "Open the campaign link to join") with the disclosure line. Reuse `buildRingBriefPayload` where it fits; do not change its behaviour.
- Do NOT touch the kickstarter or steam modules (they are demoted off the front page at the shell level by the coordinator; no code change needed from you). Do NOT touch index.html, app.js, style.css, tasks/INDEX.md, or any other track's files.

## Acceptance
- `tests/v26-migration.test.mjs` covers: campaign checklist key namespacing (two campaigns do not share state), campaign announcement payload contains game name + anchor URL + disclosure line.
- `npm test` green on the branch. Do NOT merge. Push the branch and report: branch, files, test count, any forced change to existing exports.
