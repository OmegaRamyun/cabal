// V48 acceptance: Rings/Campaigns split integration (spec: split round).
// - New routes parse: #/rings[/<formatId>], #/campaigns, #/format/<id>;
//   #/discover stays an alias. Nav mapping follows.
// - The usage seam: the V46 shape (Map id -> {rings:Set, assists:n})
//   flows raw into formatsForDiscovery, which reads ring count primary
//   and assists as tiebreak (toUsageDetail).
// - Nostr event builders tag a formatId-carrying campaign with
//   ["t", "cabal:format:<id>"] on campaign/post/Enscryption events, and
//   omit the tag otherwise (V46 counting depends on the tag for kind 78).
// - normalizeCampaign keeps formatId (preselected creation sets it after
//   createCampaign, which builds a fresh object and drops unknown fields).
// DOM behaviour (route mounts, panel on ToonSouls, relay query refresh):
// manual check note in tasks/V48-integration.md, not a skipped test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, navItemForView } from '../app.js';
import { createCampaign, normalizeCampaign } from '../src/campaign.mjs';
import { toUsageDetail, formatsForDiscovery, usageLabel } from '../src/campaign-formats.mjs';
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

describe('V49 integration wiring (campaigns-new route)', () => {
  test('parseHash: #/campaigns/new is its own view; #/campaigns unchanged', () => {
    assert.deepEqual(parseHash('#/campaigns/new'), { view: 'campaigns-new' });
    assert.deepEqual(parseHash('#/campaigns'), { view: 'campaigns' });
    assert.deepEqual(parseHash('#/campaigns/'), { view: 'campaigns' });
    // The usage re-mount guard keys off this distinction: campaigns-new
    // must never be re-mounted as campaigns (it used to wipe a
    // half-filled template form when the relay query resolved).
    assert.notEqual(parseHash('#/campaigns/new').view, parseHash('#/campaigns').view);
  });
  test('navItemForView: campaigns-new highlights the Campaigns nav item', () => {
    assert.equal(navItemForView('campaigns-new'), 'discover');
    assert.equal(navItemForView('campaigns'), 'discover');
  });
});

describe('V48 usage seam (V46 shape into discovery)', () => {
  const fmtA = { id: 'fmt_algoigno', tagline: 'A', description: '', howTo: '', examples: [], tags: [] };
  const fmtB = { id: 'fmt_weekship', tagline: 'B', description: '', howTo: '', examples: [], tags: [] };
  const fmtC = { id: 'fmt_oneclip1', tagline: 'C', description: '', howTo: '', examples: [], tags: [] };
  test('toUsageDetail reads the V46 shape (rings Set -> count, assists kept)', () => {
    const usage = new Map([
      ['fmt_algoigno', { rings: new Set(['pk1', 'pk2', 'pk1']), assists: 7 }],
      ['fmt_weekship', { rings: new Set(['pk3']), assists: 0 }],
    ]);
    const detail = toUsageDetail(usage);
    assert.deepEqual(detail.get('fmt_algoigno'), { count: 2, assists: 7 });
    assert.deepEqual(detail.get('fmt_weekship'), { count: 1, assists: 0 });
    assert.equal(toUsageDetail(null), null);
  });
  test('formatsForDiscovery: ring count primary, assists tiebreak, then members, then id', () => {
    const usage = new Map([
      ['fmt_algoigno', { rings: new Set(['pk1']), assists: 1 }],
      ['fmt_weekship', { rings: new Set(['pk2']), assists: 9 }],
      ['fmt_oneclip1', { rings: new Set(['pk3', 'pk4']), assists: 0 }],
    ]);
    const order = formatsForDiscovery([fmtA, fmtB, fmtC], { usage, rings: [] }).map((f) => f.id);
    // fmt_oneclip1 first (2 rings); fmt_weekship beats fmt_algoigno on assists (both 1 ring).
    assert.deepEqual(order, ['fmt_oneclip1', 'fmt_weekship', 'fmt_algoigno']);
  });
  test('usageLabel works on the raw V46 Map (no converter needed)', () => {
    const usage = new Map([['fmt_algoigno', { rings: new Set(['pk1', 'pk2']), assists: 3 }]]);
    assert.equal(usageLabel('fmt_algoigno', usage), 'used by 2 rings');
    assert.equal(usageLabel('fmt_weekship', usage), null);
  });
  test('usageLabel never shows "used by 0 rings" (assists but no campaign event)', () => {
    // V46 shape with assists but an empty rings set: count 0 must stay hidden.
    const usage = new Map([['fmt_algoigno', { rings: new Set(), assists: 3 }]]);
    assert.equal(usageLabel('fmt_algoigno', usage), null);
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
  test('postEvent and encryptionEvent carry the format tag (kind 78 has no formatId in content)', () => {
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
  test('normalizeCampaign migrates legacy formatId into formatIds and drops legacy key', () => {
    const ring = makeRing();
    assert.equal('formatId' in ring, false);
    ring.formatId = FMT;
    const normalized = normalizeCampaign(ring);
    assert.deepEqual(normalized.formatIds, [FMT]);
    assert.equal('formatId' in normalized, false);
    assert.equal(normalized.id, ring.id);
  });
});
