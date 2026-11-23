import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalise, jaccard3, exactMatch, gate } from '../src/similarity.mjs';

const ORIGINAL =
  'I spent about ten hours on this roguelike deckbuilder and the thing that hooked me was the way every relic changes how you sequence your turns, so a run that looks doomed at floor three can suddenly snowball when the right pair of cards shows up together.';
const ONE_WORD = ORIGINAL.replace('hooked', 'grabbed');
const PARAPHRASE =
  'Great deckbuilder with a roguelike loop. What kept me playing was relic synergy: finding two cards that combo late in a bad run felt amazing, and I lost an entire weekend to it.';
const UNRELATED = 'Our community garden meets on Saturdays to swap seedlings, share compost tips and plan the autumn harvest supper.';

test('normalise lowercases, strips punctuation, collapses whitespace', () => {
  assert.equal(normalise('  Hello,   WORLD!!\n Don’t stop. '), 'hello world dont stop');
});

test('identical texts score 1.0 and block', () => {
  assert.equal(jaccard3(ORIGINAL, ORIGINAL), 1);
  assert.ok(exactMatch(ORIGINAL, ORIGINAL.toUpperCase() + '!!'));
  const r = gate(ORIGINAL, [UNRELATED, ORIGINAL]);
  assert.equal(r.score, 1);
  assert.equal(r.verdict, 'block');
  assert.equal(r.match.index, 1);
  assert.ok(r.phrases.length > 0);
});

test('one-word-changed copy scores high and blocks', () => {
  const s = jaccard3(ORIGINAL, ONE_WORD);
  assert.ok(s >= 0.8 && s < 1, `score ${s}`);
  const r = gate(ONE_WORD, [ORIGINAL]);
  assert.equal(r.verdict, 'block');
  assert.ok(!r.phrases.some((p) => p.includes('grabbed')));
});

test('paraphrase about the same game passes', () => {
  const r = gate(PARAPHRASE, [ORIGINAL]);
  assert.ok(r.score < 0.7, `score ${r.score}`);
  assert.equal(r.verdict, 'pass');
});

test('unrelated text passes', () => {
  const r = gate(UNRELATED, [ORIGINAL]);
  assert.equal(r.verdict, 'pass');
  assert.equal(r.score, 0);
});

test('review band 0.70–0.80', () => {
  // 10 shared words vs 8 trigrams; add changes to land ~0.75
  const base = 'a b c d e f g h i j k l m n o p q r s t u v w x y z';
  const other = 'a b c d e f g h i j k l m n o p q r s t u v w x y z'.split(' ');
  other[8] = 'X'; // alters 3 of 24 trigrams -> 21/27
  const s = jaccard3(base, other.join(' '));
  assert.ok(s >= 0.7 && s < 0.8, `score ${s}`);
  assert.equal(gate(base, [other.join(' ')]).verdict, 'review');
});

test('empty draft and empty others handled', () => {
  assert.deepEqual([gate('', [ORIGINAL]).score, gate('', [ORIGINAL]).verdict], [0, 'pass']);
  assert.deepEqual([gate('   ', ['']).score, gate('   ', ['']).verdict], [0, 'pass']);
  assert.equal(gate(ORIGINAL, []).verdict, 'pass');
  assert.equal(gate(ORIGINAL).score, 0);
  assert.equal(exactMatch('', ''), false);
});

test('others may be objects with text', () => {
  const r = gate(ORIGINAL, [{ author: 'sam', text: ORIGINAL }]);
  assert.equal(r.verdict, 'block');
  assert.equal(r.match.draft.author, 'sam');
});
