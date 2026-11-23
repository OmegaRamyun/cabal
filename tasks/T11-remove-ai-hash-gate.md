# T11 — Remove the AI, hash the gate (warnings only)

Status: done (merged to main)

## Goal

Cade, Nov 22 22:36, two messages: "Remove the AI" / "We hashin". Remove the
T04 embeddings module entirely and make the similarity gate hash-based,
wired into the composer as a password-meter warning that never blocks
posting.

## Files owned

- `src/similarity.mjs`, `tests/t03.test.mjs`, `tests/t01.test.mjs`
- `app.js`, `index.html`, `src/checklist.mjs` (one-line label fix: "after a
  block" → "after a warning")
- `AGENTS.md` (Stack section: Transformers.js sentence removed)
- `tasks/T03-similarity-lexical.md`, `tasks/T04-similarity-embeddings.md`,
  `tasks/INDEX.md`

## Ownership note

AGENTS.md says only T01 touches `index.html` / `app.js` and only the
coordinator touches `tasks/INDEX.md`. This task touches all three because
removing a module and re-homing the gate cannot be done inside one file set.
Cade ordered the work directly, so it was done on this branch and merged
after green tests + a live browser check, with the deviations recorded here
instead of stopping per the "say so in your report" rule.

## Spec

- Delete `src/embeddings.mjs` and `tests/t04.test.mjs`. No live code imported
  the module (only its own tests did), so removal changed no live behaviour.
- `src/similarity.mjs` gains: `charGrams` / `charJaccard`, `fnv1a64` /
  `hash64` (FNV-1a + MurmurHash3 fmix64 finalizer — raw FNV-1a has weak
  avalanche and biased SimHash upward; see the T03 file), `hammingDistance`,
  `simhash` / `simhashSimilarity`. `gate()` takes the worst of two signals:
  word-3-gram Jaccard (review 0.70 / warn 0.80) and SimHash (review 0.80 /
  warn 0.85), returns `{ score, verdict, match, phrases, method }`.
- Verdicts are `pass` / `review` / `warn`. There is no block state. The
  "I wrote this in my own words" checkbox and the ready-button disabling
  are deleted from `mount()`.
- The gate has no section of its own. `index.html` loses the `#similarity`
  section and nav link; `app.js` drops it from MODULE_MAP and gains
  `wireSimilarityGate(document)`, which runs after the modules load and
  mounts the gate under every `#composer textarea`, with `getDrafts` reading
  the other textareas' contents (same user, cross-platform variants) labelled
  by platform. Ring members' drafts are NOT yet a source — no data source
  exists for them in the static app; that is the open follow-up, not a
  silent assumption.
- `mount()` label copy: pass — "Looks like your own words." (no number:
  SimHash scores random pairs near 50%, so a "52%" on a clean draft reads
  as a false alarm); review — "Similarity N% to your <Platform> draft.
  Check it reads as your own words."; warn — "This post is very similar to
  your <Platform> draft! Rewrite in your own words?" (Cade's words,
  generalised from "tweet" — the composer covers X, Bluesky, Threads,
  Reddit).

## Acceptance test

`npm test`: 86 pass / 0 fail (was 83; −7 T04 tests, +8 T03 tests, +2 T01
wireSimilarityGate tests). The shipped `gate()` was also run against all 11
bench pairs from `~/workspace/cabal-bench/bench.mjs`: 11/11 correct
(warn/pass/review as labelled). Thin margins, recorded honestly: template
twin sim 0.781 vs the 0.80 review line; tweet near-dup sim 0.859 vs the 0.85
warn line. Thresholds are calibrated on 11 pairs — validate on real ring
copy before treating them as settled.

## Manual check (DOM-only, no node test — repo convention)

- Live browser check Nov 22: type the tweet near-dup into the X composer
  and the original into Bluesky → BOTH meters show "This post is very
  similar to your <Other> draft! Rewrite in your own words?"; the "Open in
  X" link stays enabled (nothing is ever disabled). Type unrelated drafts
  → neutral "Looks like your own words." Screenshot:
  `~/workspace/cabal-bench/cabal-hash-gate.png`. The first live check caught
  a real bug: each gate only re-scored on its own textarea's input, so the
  Bluesky meter went stale when X changed. Fixed in `wireSimilarityGate` —
  every input refreshes all gates. Screenshot in the merge report.

## Don'ts

- No AI, no embeddings, no models, no downloads. No server, no network.
- No blocking, no disabling, no refusing to mark ready — warnings only.
- No auto-posting on a pass (unchanged hard don't).
