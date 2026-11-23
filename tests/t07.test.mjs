import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, expectedBackers, expectedRaise, goalCheck, compareCases, buildReferralLink, buildTagList } from '../src/kickstarter.mjs';

test('presets', () => {
  assert.deepEqual(PRESETS.map((p) => p.conversion), [0.08, 0.2, 0.32]);
});

test('math fixtures for all three cases (F=1000, P=40)', () => {
  assert.equal(expectedBackers(1000, 0.08), 80);
  assert.equal(expectedBackers(1000, 0.2), 200);
  assert.equal(expectedBackers(1000, 0.32), 320);
  assert.equal(expectedRaise(1000, 0.08, 40), 3200);
  assert.equal(expectedRaise(1000, 0.2, 40), 8000);
  assert.equal(expectedRaise(1000, 0.32, 40), 12800);
});

test('bad input yields zero', () => {
  assert.equal(expectedBackers(-5, 0.2), 0);
  assert.equal(expectedBackers('x', 0.2), 0);
  assert.equal(expectedRaise(100, 0.2, NaN), 0);
});

test('goal clearable logic', () => {
  const r = compareCases(1000, 40, 10000);
  assert.deepEqual(r.map((c) => c.clears), [false, false, true]);
  const r2 = compareCases(1000, 40, 8000);
  assert.deepEqual(r2.map((c) => c.clears), [false, true, true]);
  assert.equal(goalCheck(1000, 0.2, 40, 16000).percentOfGoal, 50);
  assert.equal(goalCheck(1000, 0.2, 40, 0).clears, false);
  assert.equal(goalCheck(1000, 0.2, 40, 0).goal, null);
});

test('referral link encoding', () => {
  const base = 'https://www.kickstarter.com/projects/me/game';
  assert.equal(buildReferralLink(base, 'partner1'), base + '?ref=partner1');
  assert.equal(buildReferralLink(base, 'my partner'), base + '?ref=my+partner');
  const u = new URL(buildReferralLink(base, 'a&b=c#d/é'));
  assert.equal(u.searchParams.get('ref'), 'a&b=c#d/é');
  assert.equal(u.hash, '');
  assert.equal(new URL(buildReferralLink(base + '?x=1', 't')).searchParams.get('x'), '1');
  assert.equal(new URL(buildReferralLink(base + '?ref=old', 'new')).searchParams.getAll('ref').length, 1);
});

test('referral link errors', () => {
  assert.throws(() => buildReferralLink('https://k.com/p', '  '));
  assert.throws(() => buildReferralLink('not a url', 't'));
  assert.throws(() => buildReferralLink('javascript:alert(1)', 't'));
});

test('tag list dedupes and links', () => {
  const l = buildTagList('https://www.kickstarter.com/projects/me/game', ['A', ' A ', 'B', '']);
  assert.deepEqual(l.map((x) => x.tag), ['A', 'B']);
});
