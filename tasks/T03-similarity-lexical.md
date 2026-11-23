# T03 — Similarity gate, lexical (always on)

Status: done (merged to main)

## Goal

Catch copy-paste before it ships. Lexical gate runs on every draft, no
model, no network.

## Files owned

- `src/similarity.mjs`, `tests/t03.test.mjs`

## Spec

- Normalise: lowercase, strip punctuation, collapse whitespace.
- `jaccard3(a, b)`: word-3-gram Jaccard similarity, 0–1.
- `exactMatch(a, b)`: true when normalised texts are identical.
- `gate(draft, others)`: returns `{ score, verdict }` where verdict is
  `pass` (max Jaccard < 0.70), `review` (0.70–0.80, show the score, allow
  with an explicit "I wrote this in my own words" checkbox), or `block`
  (Jaccard >= 0.80 or exact match — refuse to mark ready, require a
  rewrite). Always report the highest-scoring other draft and the
  overlapping phrases (the shared 3-grams) so the writer can rewrite
  from their own gameplay observation.
- `mount()` wires the gate into the composer section: live score as the
  user types against the ring's drafts (passed in, never fetched from a
  server), block state on the ready button, amber/red states per above.
- Pure functions only in the module core; DOM only in `mount()`.

## Acceptance test

`tests/t03.test.mjs` (node --test): fixtures — identical texts score 1.0
and block; one-word-changed copy scores high and blocks; a paraphrase
about the same game scores below 0.70 and passes; unrelated text passes;
empty draft handled (score 0, pass).

## Don'ts

- No embeddings here (that's T04). No server, no network.
