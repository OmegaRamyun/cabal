# T04 — Similarity gate, MiniLM embeddings (opt-in)

Status: REMOVED (Nov 22, by T11, on Cade's order: "Remove the AI" / "We hashin")

## What happened

The embeddings module (`src/embeddings.mjs`, Transformers.js v4 + MiniLM-L6-v2,
~23 MB download, Web Worker) was deleted along with its tests
(`tests/t04.test.mjs`). It was never wired into the app — nothing imported it
except its own tests — so removal changed no live behaviour.

It was replaced by the hash gate in T03/T11: SimHash + word-3-gram Jaccard,
zero model, zero download, ~3 µs per comparison. The bench that decided it
(`~/workspace/cabal-bench/BENCH-hash.md`): SimHash separation +0.218 vs
MiniLM-L6 +0.110 / L3 +0.176 on the same 11 pairs, and the gate's weak spot
was never "needs a model" — it was "word trigrams are too coarse for
280 characters."

The original spec is preserved below for the record. Do not resurrect it
without Cade's word.

## Original spec (superseded)

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

## Original don'ts

- No server-side embeddings, no draft leaves the device. No EmbeddingGemma
  default. No blocking load.
