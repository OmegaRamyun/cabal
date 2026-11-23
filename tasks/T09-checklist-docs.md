# T09 — Pre-post checklist + docs

Status: done (merged to main)

## Goal

The last mile before a post leaves the desk: a checklist that teaches,
and docs that let a stranger contribute.

## Files owned

- `src/checklist.mjs`, `CONTRIBUTING.md`, `tests/t09.test.mjs`

## Spec

- `checklist.mjs`: pre-post checklist state — (1) I wrote this in my own
  words; (2) similarity gate passed (or I rewrote after a block); (3)
  disclosure line present where a relationship exists; (4) link is a UTM
  / referral-tagged link where applicable; (5) timing is my audience's
  time, not a synchronised burst; (6) this is one shared game today, not
  a stack. Pure functions for state (all-checked? which are missing?);
  `mount()` renders it with plain checkboxes and a ready/not-ready state.
- Voice card: fields for 3–5 of the dev's own best posts (links/text),
  stored in localStorage, shown in the composer as human reference —
  never as training data, never sent anywhere.
- `CONTRIBUTING.md`: how to pick a task, branch naming, claim protocol,
  acceptance rule, code of conduct in one paragraph (be a decent human;
  no astroturfing contributions, no quota/ledger features — those PRs
  are refused on sight).
- Extend README usage section if it is missing anything a first-time
  user needs.

## Acceptance test

`tests/t09.test.mjs` (node --test): checklist state fixtures
(all-checked, one-missing, empty). Docs are a manual read-through.

## Don'ts

- No AI generation in the checklist flow. No data leaves the device.
