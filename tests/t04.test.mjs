import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_MODEL,
  EMBEDDING_DIM,
  FIRST_EMBED_TIMEOUT_MS,
  THRESHOLDS,
  THRESHOLD_DISCLAIMER,
  classifySimilarity,
  cosine,
  createEmbeddingEngine,
  gateWithEmbeddings,
} from '../src/embeddings.mjs';

test('cosine() returns 1 for identical vectors', () => {
  assert.equal(cosine([1, 2, 3], [1, 2, 3]), 1);
  assert.equal(cosine([0.5, -0.5, 0.5, -0.5], [1, -1, 1, -1]), 1);
  const f1 = new Float32Array([0.3, 0.4, 0.5]);
  const f2 = new Float32Array([0.3, 0.4, 0.5]);
  assert.ok(Math.abs(cosine(f1, f2) - 1) < 1e-6);
});

test('cosine() returns 0 for orthogonal vectors', () => {
  assert.equal(cosine([1, 0, 0], [0, 1, 0]), 0);
  assert.equal(cosine([1, 2, 0], [-2, 1, 0]), 0);
});

test('cosine() returns -1 for opposite vectors', () => {
  assert.equal(cosine([1, -2, 3], [-1, 2, -3]), -1);
  assert.equal(cosine([0, 5], [0, -5]), -1);
});

test('cosine() handles zero-norm vectors and invalid inputs safely', () => {
  assert.equal(cosine([0, 0, 0], [1, 2, 3]), 0);
  assert.throws(() => cosine([], []), RangeError);
  assert.throws(() => cosine([1, 2], [1, 2, 3]), RangeError);
  assert.throws(() => cosine(null, [1, 2]), TypeError);
});

test('classifySimilarity() maps thresholds: 0.84 review, 0.85 warn, 0.92 block', () => {
  const below = classifySimilarity(0.84);
  assert.equal(below.verdict, 'review');
  assert.equal(below.severity, 'neutral');

  const warnEdge = classifySimilarity(0.85);
  assert.equal(warnEdge.verdict, 'warn');
  assert.equal(warnEdge.severity, 'amber');
  assert.match(warnEdge.message, /rewrite in your own words/i);

  const warnMid = classifySimilarity(0.919);
  assert.equal(warnMid.verdict, 'warn');

  const blockEdge = classifySimilarity(0.92);
  assert.equal(blockEdge.verdict, 'block');
  assert.equal(blockEdge.severity, 'red');

  const blockMax = classifySimilarity(1.0);
  assert.equal(blockMax.verdict, 'block');
});

test('gateWithEmbeddings() selects highest-scoring match and includes disclaimer', () => {
  const emptyRes = gateWithEmbeddings([1, 0], []);
  assert.equal(emptyRes.score, 0);
  assert.equal(emptyRes.verdict, 'review');
  assert.equal(emptyRes.match, null);
  assert.equal(emptyRes.disclaimer, THRESHOLD_DISCLAIMER);

  const draft = [1, 0, 0];
  const others = [
    { id: 'a', text: 'unrelated', embedding: [0, 1, 0] },
    { id: 'b', text: 'near match', embedding: [0.95, 0.31225, 0] },
  ];
  const res = gateWithEmbeddings(draft, others);
  assert.equal(res.match.id, 'b');
  assert.equal(res.verdict, 'block');
  assert.ok(res.score >= THRESHOLDS.BLOCK);
  assert.equal(res.disclaimer, THRESHOLD_DISCLAIMER);
});

test('defaults use MiniLM-L6-v2 and engine starts disabled with silent degradation', async () => {
  assert.equal(DEFAULT_MODEL, 'Xenova/all-MiniLM-L6-v2');
  assert.equal(EMBEDDING_DIM, 384);
  assert.equal(FIRST_EMBED_TIMEOUT_MS, 2000);

  const engine = createEmbeddingEngine();
  assert.deepEqual(engine.getState(), {
    enabled: false,
    status: 'disabled',
    degradedReason: null,
  });

  // Never blocks when disabled or when Worker is unavailable (Node env).
  // The fallback DELEGATES to the T03 lexical gate when ./similarity.mjs
  // is present (on main), so the verdict is the gate's verdict — 'pass'
  // for these unrelated drafts. The canned 'review' only applies when the
  // module is absent (as it was on the T04 branch).
  const disabledCheck = await engine.checkDraft('my draft', ['other draft']);
  assert.equal(disabledCheck.mode, 'lexical-fallback');
  assert.equal(disabledCheck.verdict, 'pass');

  // Delegation proof: an identical draft blocks through the fallback.
  const copiedCheck = await engine.checkDraft('other draft', ['other draft']);
  assert.equal(copiedCheck.mode, 'lexical-fallback');
  assert.equal(copiedCheck.verdict, 'block');

  const enabledState = await engine.enable();
  assert.equal(enabledState.status, 'degraded');
  assert.ok(enabledState.reason);

  const degradedCheck = await engine.checkDraft('my draft', ['other draft']);
  assert.equal(degradedCheck.mode, 'lexical-fallback');
});
