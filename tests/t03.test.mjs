import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalise,
  jaccard3,
  exactMatch,
  charGrams,
  charJaccard,
  fnv1a64,
  hash64,
  hammingDistance,
  simhash,
  simhashSimilarity,
  gate,
} from '../src/similarity.mjs';

const ORIGINAL =
  'I spent about ten hours on this roguelike deckbuilder and the thing that hooked me was the way every relic changes how you sequence your turns, so a run that looks doomed at floor three can suddenly snowball when the right pair of cards shows up together.';
const ONE_WORD = ORIGINAL.replace('hooked', 'grabbed');
const PARAPHRASE =
  'Great deckbuilder with a roguelike loop. What kept me playing was relic synergy: finding two cards that combo late in a bad run felt amazing, and I lost an entire weekend to it.';
const UNRELATED = 'Our community garden meets on Saturdays to swap seedlings, share compost tips and plan the autumn harvest supper.';
const TEMPLATE_TWIN =
  'I spent about ten hours on this roguelike dungeon crawler and the thing that hooked me was the way every weapon changes how you approach each room, so a run that looks doomed at floor three can suddenly snowball when the right pair of items shows up together.';
const TWEET_A =
  'Our roguelike deckbuilder demo is OUT NOW on Steam! Wishlist it if you like relic synergies and runs that flip from doomed to snowballing.';
const TWEET_DUP =
  'Our roguelike deckbuilder demo is LIVE NOW on Steam! Add it to your wishlist if you like relic synergies and runs that flip from doomed to snowballing.';
const TWEET_PARA =
  'The demo for our deckbuilding roguelike just dropped on Steam — if relic combos and comeback runs are your thing, give it a wishlist.';

test('normalise lowercases, strips punctuation, collapses whitespace', () => {
  assert.equal(normalise('  Hello,   WORLD!!\n Don’t stop. '), 'hello world dont stop');
});

test('identical texts score 1.0 and warn (never block)', () => {
  assert.equal(jaccard3(ORIGINAL, ORIGINAL), 1);
  assert.ok(exactMatch(ORIGINAL, ORIGINAL.toUpperCase() + '!!'));
  const r = gate(ORIGINAL, [UNRELATED, ORIGINAL]);
  assert.equal(r.score, 1);
  assert.equal(r.verdict, 'warn');
  assert.equal(r.method, 'exact');
  assert.equal(r.match.index, 1);
  assert.ok(r.phrases.length > 0);
});

test('one-word-changed copy scores high and warns', () => {
  const s = jaccard3(ORIGINAL, ONE_WORD);
  assert.ok(s >= 0.8 && s < 1, `score ${s}`);
  const r = gate(ONE_WORD, [ORIGINAL]);
  assert.equal(r.verdict, 'warn');
  assert.ok(!r.phrases.some((p) => p.includes('grabbed')));
});

test('paraphrase about the same game passes', () => {
  const r = gate(PARAPHRASE, [ORIGINAL]);
  assert.ok(r.score < 0.8, `score ${r.score}`);
  assert.equal(r.verdict, 'pass');
});

test('unrelated text passes', () => {
  const r = gate(UNRELATED, [ORIGINAL]);
  assert.equal(r.verdict, 'pass');
  assert.ok(r.score < 0.8, `score ${r.score}`);
});

test('review band: near-identical skeleton reviews', () => {
  // 10 shared words vs 8 trigrams; add changes to land ~0.75
  const base = 'a b c d e f g h i j k l m n o p q r s t u v w x y z';
  const other = 'a b c d e f g h i j k l m n o p q r s t u v w x y z'.split(' ');
  other[8] = 'X'; // alters 3 of 24 trigrams -> 21/27
  const s = jaccard3(base, other.join(' '));
  assert.ok(s >= 0.7 && s < 0.8, `score ${s}`);
  const r = gate(base, [other.join(' ')]);
  assert.equal(r.verdict, 'review');
  assert.ok(r.score >= 0.8 && r.score < 0.85, `score ${r.score}`);
});

test('template twin (same skeleton, different game) passes', () => {
  // Thin margin by design: sim 0.781 vs the 0.80 review line. A closer twin
  // would review — that is an amber nudge, not a block, so it costs nothing.
  const r = gate(ORIGINAL, [TEMPLATE_TWIN]);
  assert.equal(r.verdict, 'pass');
  assert.ok(r.score < 0.8, `score ${r.score}`);
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
  assert.equal(r.verdict, 'warn');
  assert.equal(r.match.draft.author, 'sam');
});

test('fnv1a64 matches the published test vectors', () => {
  assert.equal(fnv1a64(''), 0xcbf29ce484222325n);
  assert.equal(fnv1a64('a'), 0xaf63dc4c8601ec8cn);
});

test('hash64 differs from raw FNV-1a (mixer runs) and stays deterministic', () => {
  assert.notEqual(hash64('hello world'), fnv1a64('hello world'));
  assert.equal(hash64('hello world'), hash64('hello world'));
});

test('hammingDistance counts differing bits', () => {
  assert.equal(hammingDistance(0n, 0n), 0);
  assert.equal(hammingDistance(0xffffffffffffffffn, 0n), 64);
  assert.equal(hammingDistance(0b1010n, 0b1001n), 2);
});

test('simhash is deterministic; identical texts score 1, empty is 0', () => {
  assert.equal(simhash(TWEET_A), simhash(TWEET_A));
  assert.equal(simhashSimilarity(TWEET_A, TWEET_A), 1);
  assert.equal(simhash(''), 0n);
  assert.equal(simhashSimilarity('', TWEET_A), 0);
});

test('charJaccard: identical 1, tweet near-dup 0.80, paraphrase low', () => {
  assert.equal(charJaccard(TWEET_A, TWEET_A), 1);
  const dup = charJaccard(TWEET_A, TWEET_DUP);
  assert.ok(dup >= 0.8 && dup < 0.85, `charJaccard ${dup}`);
  assert.ok(charJaccard(TWEET_A, TWEET_PARA) < 0.3);
  assert.ok(charGrams('hi').has('hi')); // short text yields one gram
});

test('tweet near-dup warns via SimHash even though trigrams miss it', () => {
  // The whole point of T11: word 3-grams are too coarse at 280 chars.
  assert.ok(jaccard3(TWEET_A, TWEET_DUP) < 0.5, `jaccard3 ${jaccard3(TWEET_A, TWEET_DUP)}`);
  const r = gate(TWEET_A, [TWEET_DUP]);
  assert.equal(r.verdict, 'warn');
  assert.equal(r.method, 'simhash');
  assert.ok(r.score >= 0.85, `score ${r.score}`);
});

test('tweet paraphrase passes — own words are not a copy', () => {
  const r = gate(TWEET_A, [TWEET_PARA]);
  assert.equal(r.verdict, 'pass');
  assert.ok(r.score < 0.8, `score ${r.score}`);
});
