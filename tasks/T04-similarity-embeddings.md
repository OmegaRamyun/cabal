# T04 — Similarity gate, MiniLM embeddings (opt-in)

Status: done (merged to main)

## Goal

Catch paraphrases the lexical gate misses — only when the user opts in,
only in their browser.

## Files owned

- `src/embeddings.mjs`, `tests/t04.test.mjs`

## Spec

- Lazy-load Transformers.js v4 (`@huggingface/transformers`, current
  4.3.2) from CDN, only after the user enables it. Never on first load.
  Run in a Web Worker; main-thread loading freezes UI. Models cached via
  the Cache API / IndexedDB.
- Model: `all-MiniLM-L6-v2` (ONNX, ~23 MB quantized, 384-dim). Do NOT use
  EmbeddingGemma as the default (~190 MB, ~12.9 s CPU init — too heavy).
- `cosine(a, b)` pure function on embedding vectors.
- Thresholds (recommendations to validate on real ring copy, not measured
  results — say so in the UI copy): cosine >= 0.85 amber warning ("reads
  very close to another ring member's draft — rewrite in your own
  words"), >= 0.92 red, treat as hard block pending human review.
- Degradation: if the model fails to load, or first embed takes > 2 s,
  or WebGPU/WASM is unavailable, fall back to the lexical gate (T03)
  silently and note it in the UI. Never block the composer on the model.
- Never auto-post on a pass, never auto-reject on embedding alone
  (same-game copy false-positives).

## Acceptance test

`tests/t04.test.mjs` (node --test): `cosine()` fixtures (identical,
orthogonal, opposite vectors) and threshold mapping (0.84 warn? no —
0.84 is review; 0.85 warn; 0.92 block). Model loading itself is a manual
check: enable it in the browser, confirm the gate fires on a paraphrase.

## Don'ts

- No server-side embeddings, no draft leaves the device. No EmbeddingGemma
  default. No blocking load.
