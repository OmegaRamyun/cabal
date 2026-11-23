# T05 — Matchmaking directory + match score

Status: done (merged to main)

## Goal

Let solo devs find overlapping peers without a central server: a public,
versioned JSON directory.

## Files owned

- `directory/`, `schemas/directory.schema.json` (already in repo — extend
  only if the schema is wrong, and say why), `src/match.mjs`,
  `tests/t05.test.mjs`

## Spec

- Creator profile shape is fixed by `schemas/directory.schema.json`:
  opaque id, display name, genres, Steam tags, audience bucket (<100 /
  100–1k / 1k–10k / 10k+ — never exact follower counts), platforms,
  launch window (pre-launch / live / late-pledge / next-fest, with dates),
  optional Kickstarter URL, Steam app id, referral tag, opt-in contact.
  No emails, no tokens, no scraped data.
- Seed `directory/` with three EXAMPLE profiles, clearly fictional
  (names like "Example Roguelike", genre roguelike), so the UI has
  something to render and the schema is exercised.
- `matchScore(a, b)` — deterministic, explainable, no ML, no hidden
  weights. Show the breakdown to both parties:
  - genre/Steam-tag overlap: Jaccard on the combined genre+tag sets
  - audience proximity: same or adjacent bucket 1.0, two buckets apart
    0.5, else 0.25
  - launch-window overlap: overlapping days / 30, capped at 1.0
  - pre-launch followers exist: 1.0 (multiplier, not a score — document
    it as such)
- `rotationWarnings(ring, history)`: flag when a member would feature the
  same partner more than once per 14 days, more than 2x per campaign, or
  when > 50% of the ring would feature the same member in one week.
  Warnings only — the directory never enforces, never blocks.
- `mount()` renders the directory, the score breakdown for a selected
  pair, and the rotation warnings.

## Acceptance test

`tests/t05.test.mjs` (node --test): score fixtures (identical profiles,
adjacent vs distant audience buckets, non-overlapping windows), schema
validation of the three seed profiles, rotation-warning fixtures.

## Don'ts

- No ranking, no hidden weights, no server, no PII.
