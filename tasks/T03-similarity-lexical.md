# T03 — Similarity gate, hash-based (always on)

Status: done (merged to main). Reworked by T11 (Nov 22): SimHash replaced the
planned embeddings, verdicts are warnings only, the gate lives in the composer.

## Goal

Catch copy-paste before it ships. Hash gate runs on every draft, no model,
no network, no AI.

## Files owned

- `src/similarity.mjs`, `tests/t03.test.mjs`

## Spec

- Normalise: lowercase, strip punctuation, collapse whitespace.
- `jaccard3(a, b)`: word-3-gram Jaccard similarity, 0–1. Catches long-form copy.
- `charGrams(text, n=4)` / `charJaccard(a, b)`: character-4-gram Jaccard, 0–1.
- `fnv1a64(str)` / `hash64(str)`: FNV-1a 64-bit hash plus the MurmurHash3
  fmix64 finalizer. Raw FNV-1a alone has weak avalanche — similar grams hash
  to similar values, which biased SimHash upward (a paraphrase scored 0.750
  instead of ~0.53). The mixer is bijective with strong diffusion; `hash64`
  behaves like a cryptographic hash for SimHash purposes while staying
  synchronous and dependency-free.
- `simhash(text)` / `simhashSimilarity(a, b)`: 64-bit SimHash over char-4-gram
  features. 8 bytes per draft, ~3 µs per comparison. Random pairs land near
  0.5, not 0 — SimHash has its own thresholds, never the cosine/Jaccard lines.
- `exactMatch(a, b)`: true when normalised texts are identical.
- `gate(draft, others)`: returns `{ score, verdict, match, phrases, method }`
  where verdict is `pass`, `review`, or `warn` — the worst of the two signals
  (Jaccard >= 0.70 review / >= 0.80 warn; SimHash >= 0.80 review / >= 0.85
  warn; exact match warns). Always report the highest-scoring other draft,
  the overlapping phrases (the shared 3-grams), and which signal drove the
  verdict (`method`: `jaccard3` / `simhash` / `exact`).
- Verdicts are warnings only (Cade, Nov 22: password-meter UX, "This tweet
  is very similar!", never stops you from posting). There is no block state
  anywhere: `mount()` never disables anything, and the old "I wrote this in
  my own words" checkbox is gone.
- `mount()` wires the gate under a composer textarea: live meter as the user
  types against the ring's drafts (passed in, never fetched from a server).
  The gate has no section of its own — `app.js` wires it into the composer
  after the modules load (see T11).
- Pure functions only in the module core; DOM only in `mount()`.

## Acceptance test

`tests/t03.test.mjs` (node --test): fixtures — identical texts score 1.0 and
warn; one-word-changed copy scores high and warns; a paraphrase about the
same game scores below 0.80 and passes; unrelated text passes; template twin
(same skeleton, different game) passes — thin margin (sim 0.781 vs the 0.80
review line); tweet near-dup warns via SimHash even though trigrams miss it
(j3 0.469, sim 0.859); tweet paraphrase passes; empty draft handled
(score 0, pass); FNV-1a published test vectors; SimHash determinism.
Thresholds are calibrated on 11 bench pairs — validate on real ring copy
before treating them as settled.

## Don'ts

- No AI, no embeddings, no models (T04 removed Nov 22, see T11). No server,
  no network.
