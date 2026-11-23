// V48 acceptance: Rings/Campaigns split integration (spec: split round).
// - New routes parse: #/rings[/<formatId>], #/campaigns, #/format/<id>;
//   #/discover stays an alias. Nav mapping follows.
// - usageRingCounts: the V46 -> V45 seam (Map id -> {rings:Set} becomes
//   Map id -> distinct-ring count).
// - Nostr event builders tag a formatId-carrying campaign with
//   ["t", "cabal:format:<id>"] on campaign/post/Enscryption events, and
//   omit the tag otherwise (V46 counting depends on the tag for kind 1).
// - normalizeCampaign keeps formatId (preselected creation sets it after
//   createCampaign, which builds a fresh object and drops unknown fields).
// DOM behaviour (route mounts, panel on ToonSouls, relay query refresh):
// manual check note in tasks/V48-integration.md, not a skipped test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, navItemForView, usageRingCounts } from '../app.js';
import { createCampaign, normalizeCampaign } from '../src/campaign.mjs';
import {
  campaignEvent, postEvent, encryptionEvent, formatTagFor, generateCampaignKey,
} from '../src/nostr.mjs';

const FMT = 'fmt_algoigno';
const game = { name: 'ToonSouls', links: { itch: 'https://example.itch.io/toonsouls' }, tags: ['souls-like'] };
const anchorPost = { platform: 'x', url: 'https://x.com/a/status/1', text: 'My game is good', author: '@alice' };
const creator = { name: 'Alice', handle: '@alice' };

const makeRing = (over = {}) => createCampaign({
  game, title: 'Ring', anchorPost, window: null, creator,
  key: generateCampaignKey().key, ...over,
});

describe('V48 new routes', () => {
  test('parseHash: #/rings, #/rings/<formatId>, #/campaigns, #/format/<id>', () => {
    assert.deepEqual(parseHash('#/rings'), { view: 'rings', formatId: null });
    assert.deepEqual(parseHash('#/rings/fmt_algoigno'), { view: 'rings', formatId: 'fmt_algoigno' });
    assert.deepEqual(parseHash('#/campaigns'), { view: 'campaigns' });
    assert.deepEqual(parseHash('#/format/fmt_algoigno'), { view: 'format', formatId: 'fmt_algoigno' });
    assert.deepEqual(parseHash('#/format/'), { view: 'home' });
  });
  test('parseHash: #/discover still parses as discover', () => {
    assert.deepEqual(parseHash('#/discover'), { view: 'discover' });
  });
  test('navItemForView: campaigns/format land on Discover, rings on Home', () => {
    assert.equal(navItemForView('campaigns'), 'discover');
    assert.equal(navItemForView('format'), 'discover');
    assert.equal(navItemForView('rings'), 'home');
    assert.equal(navItemForView('discover'), 'discover');
  });
});

describe('V48 usageRingCounts (V46 -> V45 seam)', () => {
  test('V46 Map shape (id -> {rings:Set, assists:n}) becomes id -> ring count', () => {
    const usage = new Map([
      [FMT, { rings: new Set(['pk1', 'pk2', 'pk1']), assists: 7 }],
      ['fmt_weekship', { rings: new Set(['pk3']), assists: 0 }],
    ]);
    assert.deepEqual(
      [...usageRingCounts(usage).entries()],
      [[FMT, 2], ['fmt_weekship', 1]],
    );
  });
  test('plain numbers pass through; garbage counts 0; empty stays empty', () => {
    assert.deepEqual(
      [...usageRingCounts(new Map([[FMT, 3]])).entries()],
      [[FMT, 3]],
    );
    assert.deepEqual(
      [...usageRingCounts({ [FMT]: { rings: 'not-a-set' } }).entries()],
      [[FMT, 0]],
    );
    assert.equal(usageRingCounts(null).size, 0);
    assert.equal(usageRingCounts(undefined).size, 0);
  });
});

describe('V48 format tag on Nostr events', () => {
  test('formatTagFor: valid fmt_ id tags, anything else is null', () => {
    assert.deepEqual(formatTagFor({ formatId: FMT }), ['t', `cabal:format:${FMT}`]);
    assert.equal(formatTagFor({}), null);
    assert.equal(formatTagFor({ formatId: 'nope' }), null);
    assert.equal(formatTagFor({ formatId: 'fmt_SHORT' }), null);
    assert.equal(formatTagFor(null), null);
  });
  test('campaignEvent carries the format tag when the ring runs a format', () => {
    const ring = makeRing({ formatId: FMT });
    const ev = campaignEvent({ ...ring, formatId: FMT });
    assert.ok(ev.tags.some((t) => t[0] === 't' && t[1] === `cabal:format:${FMT}`));
    assert.ok(!JSON.stringify(ev.content).includes('cabal:format:'));
    const plain = campaignEvent(makeRing());
    assert.ok(!plain.tags.some((t) => t[0] === 't' && String(t[1]).startsWith('cabal:format:')));
  });
  test('postEvent and encryptionEvent carry the format tag (kind 1 has no formatId in content)', () => {
    const ring = { ...makeRing(), formatId: FMT };
    const post = { id: 'pst_abcdef12', author: '@alice', platform: 'x', url: 'https://x.com/a/status/1', text: 'hi', createdAt: new Date().toISOString(), assists: [] };
    const postEv = postEvent(ring, post);
    assert.ok(postEv.tags.some((t) => t[0] === 't' && t[1] === `cabal:format:${FMT}`));
    assert.ok(!postEv.content.includes('formatId'));
    const assist = { handle: '@bob', status: 'contributed', contributedAt: new Date().toISOString(), note: 'Shared it.' };
    const encEv = encryptionEvent(ring, post, assist);
    assert.ok(encEv.tags.some((t) => t[0] === 't' && t[1] === `cabal:format:${FMT}`));
    const plainPostEv = postEvent(makeRing(), post);
    assert.ok(!plainPostEv.tags.some((t) => t[0] === 't' && String(t[1]).startsWith('cabal:format:')));
  });
});

describe('V48 formatId survives the campaign lifecycle', () => {
  test('normalizeCampaign keeps formatId (preselected creation sets it after createCampaign)', () => {
    const ring = makeRing();
    assert.equal('formatId' in ring, false);
    ring.formatId = FMT;
    const normalized = normalizeCampaign(ring);
    assert.equal(normalized.formatId, FMT);
    assert.equal(normalized.id, ring.id);
  });
});
