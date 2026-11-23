# T07 — Kickstarter planner + referral tags

Status: open

## Goal

Tell a dev whether they have enough pre-launch followers before they hit
launch — with honest numbers.

## Files owned

- `src/kickstarter.mjs`, `tests/t07.test.mjs`

## Spec

- `expectedBackers(followers, conversion)` = F x C. `expectedRaise =
  backers x avgPledge`. Conversion presets (label them in the UI):
  stress 0.08, base 0.20, official-average upside 0.32. The 0.32 is
  Kickstarter's official figure (32% of pre-launch followers pledge once
  live, vs 17% post-launch, Kickstarter blog 29 Oct 2025). The 0.20 and
  0.08 are planning cases, not benchmarks — say so.
- Goal check: the funding goal should be clearable in the first 48h from
  F x C x P — show which conversion case clears it and which does not.
- `buildReferralLink(projectUrl, tag)`: Kickstarter Custom Referral Tags.
  Tags are created pre-launch on the Promotion tab; the dashboard reports
  aggregate pledges / % of funds / amount per tag, never backer-specific
  data; 20,000-tag limit. One tag per ring partner. Nuance to show in the
  UI: pre-launch-*page* click attribution is not explicitly documented by
  Kickstarter — do not claim it.
- `mount()` renders the planner (followers, conversion selector, average
  pledge, goal) with all three cases side by side, plus the tag builder.
- Do-not-cite in UI copy or code comments: the "47-campaign, 27% avg /
  26% median" benchmark (not found), the "5,190 Kickstarters on Reddit"
  study (not found), "10 cross-promo DMs in 2 days" (not found).

## Acceptance test

`tests/t07.test.mjs` (node --test): math fixtures for all three cases,
goal-clearable logic, referral-link encoding (tag with spaces/special
chars).

## Don'ts

- No posting API (none exists). No BackerKit Cross-Collab presented as a
  Kickstarter feature — it is a pattern (shared incentive, both must
  fund), implemented as a human agreement plus referral tags.
