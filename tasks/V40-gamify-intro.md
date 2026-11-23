# V40 — Sustained-ring gamification + intro rewrite

Status: claimed
Branch: `task/V40-sustained-journal`
Spec: `cabal-bench/redesign-sustained-ring.md` sections 11, 12, 15, 16e
Files owned: `src/gamify.mjs`, `src/intro.mjs`,
`tests/v40-sustained-journal.test.mjs`, `tasks/V40-gamify-intro.md`
Also touched (stale assertions only): `tests/v33-intro.test.mjs`

## Journal (section 11)
- `passedOn` set in the journal (keys `<campaignId>:<postId>`);
  `record("passon", { campaignId, postId })` / `markPassedOn`.
- Milestones, boolean only: **Second Wind** (kindled on a post not in
  `ctx.firstPostIds`), **Pass It On** (any passedOn), **Steady Flame**
  (kindled on 2 different posts, `STEADY_FLAME_MILESTONE`).
- `rest` is per post: `record("rest", { campaignId, postId })` keys
  `<campaignId>:<postId>`; bare campaignId keeps the legacy key.
  `loadCampaignChecklist(campaignId, storage, postId)` forwards postId
  to `checklistKey` (V39 gives it the second arg; today it is ignored).
- `trackRevision` takes `firstPostIds` and forwards it to `record`.

## Spec ambiguities and rulings
- `ctx.firstPostIds`: spec says "the ring's first-post ids". Taken as an
  array (or object map) of COMPOSITE keys `<campaignId>:<postId>`, same
  shape as kindled keys. Empty/absent -> Second Wind is false (fail
  closed: cannot prove a later post). Integration (V42) must pass it from
  app.js to `trackRevision`, `record` and `gamify.mount`.
- Legacy kindled keys with no colon never earn Second Wind.

## Kill list review
Nothing new killed. Considered and rejected: a "passed on N posts" count
(post-counting), a Steady Flame display of how many posts (count display).
Pass It On is self-reported and unchecked; gaming it only fools the user.

## Intro (section 12)
How: five-part rhythm, Enscryption receipt copy, no window. Theory:
compounding, per post, two tiers, pass-it-on promoted to core loop (V37
copy kept), open-ended by design, Nostr sync honesty + public-relay
privacy line (words only; no relay or key UI, V41 owns it). What: "a ring
that keeps going". Route ids and mount() unchanged. No Threads copy, no
`share_via_copy_link` weight.
