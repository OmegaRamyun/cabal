// V44 acceptance: shell wiring seams (spec §§14, 16, 17c).
// - shareLinkFor: payload link before first publish, short naddr link after.
// - createCampaign stores the campaign key; normalizeCampaign keeps key + nostr.
// - campaignLinkFragment / parseCampaignLinkFragment round-trip (router seam).
// DOM behaviour (panel mount, link route, removal republish): manual check
// note in tasks/V44-integration.md, not a skipped test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createCampaign, normalizeCampaign } from '../src/campaign.mjs';
import { shareLinkFor } from '../src/campaign-page.mjs';
import {
  generateCampaignKey, hasCampaignKey, campaignPubkey, campaignLinkFragment,
  parseCampaignLinkFragment,
} from '../src/nostr.mjs';

const game = { name: 'ToonSouls', links: { itch: 'https://example.itch.io/toonsouls' }, tags: ['souls-like'] };
const anchorPost = { platform: 'x', url: 'https://x.com/a/status/1', text: 'My game is good', author: '@alice' };
const creator = { name: 'Alice', handle: '@alice' };
const baseUrl = 'https://omegaramyun.github.io/cabal/';

const makeRing = (over = {}) => createCampaign({
  game, title: 'Ring', anchorPost, window: null, creator,
  key: generateCampaignKey().key, ...over,
});

describe('V44 key generation on creation', () => {
  test('generateCampaignKey returns a valid 64-hex key + pubkey', () => {
    const { key, pubkey } = generateCampaignKey();
    assert.match(key, /^[0-9a-f]{64}$/);
    assert.match(pubkey, /^[0-9a-f]{64}$/);
    assert.notEqual(key, pubkey);
  });
  test('createCampaign stores the key; normalizeCampaign keeps key + nostr', () => {
    const c = makeRing();
    assert.equal(hasCampaignKey(c), true);
    const withSidecar = { ...c, nostr: { createdAt: 1700000000, pubkey: 'a'.repeat(64) } };
    const norm = normalizeCampaign(withSidecar);
    assert.equal(norm.key, c.key);
    assert.deepEqual(norm.nostr, withSidecar.nostr);
    // Idempotent: a second normalize keeps them too.
    assert.equal(normalizeCampaign(norm).key, c.key);
  });
});

describe('V44 shareLinkFor (spec §14)', () => {
  test('unpublished ring shares the whole-payload link (offline fallback)', () => {
    const c = makeRing();
    const share = shareLinkFor(c, baseUrl);
    assert.ok(share.url.startsWith(baseUrl + '#c=eyJ'), `payload link, got ${share.url.slice(0, 60)}`);
    assert.ok(!share.url.includes('naddr1'), 'no naddr before first publish');
    // The key rides in the fragment, never in the payload JSON.
    assert.ok(share.url.includes('&k='), 'key in its own fragment param');
    assert.equal(share.noteClass, 'form-error');
  });
  test('published ring shares the short naddr link', () => {
    const c = makeRing();
    c.nostr = { createdAt: 1700000000 };
    const share = shareLinkFor(c, baseUrl, ['wss://relay.damus.io']);
    assert.ok(share.url.startsWith(baseUrl + '#c=naddr1'), `naddr link, got ${share.url.slice(0, 60)}`);
    assert.equal(share.note, 'Short link — opens the ring from the relays.');
    assert.equal(share.noteClass, 'muted');
    const parsed = parseCampaignLinkFragment(share.url);
    assert.equal(parsed.campaignId, c.id);
    assert.equal(parsed.key, c.key);
    assert.deepEqual(parsed.relays, ['wss://relay.damus.io']);
  });
  test('published but keyless (read-only) ring stays on the payload link', () => {
    const c = makeRing();
    delete c.key;
    c.nostr = { createdAt: 1700000000, pubkey: 'b'.repeat(64) };
    const share = shareLinkFor(c, baseUrl);
    assert.ok(share.url.includes('#c=eyJ'), 'read-only ring never shares a keyed short link');
    assert.ok(!share.url.includes('&k='));
  });
  test('never throws on junk input', () => {
    assert.doesNotThrow(() => shareLinkFor(null, baseUrl));
    assert.doesNotThrow(() => shareLinkFor({}, baseUrl));
    assert.doesNotThrow(() => shareLinkFor({ nostr: { createdAt: 1 }, key: 'not-a-key' }, baseUrl));
  });
});

describe('V44 naddr fragment round-trip (router seam)', () => {
  test('campaignLinkFragment -> parseCampaignLinkFragment keeps id, pubkey, key, relays', () => {
    const c = makeRing();
    const frag = campaignLinkFragment(c, ['wss://nos.lol']);
    assert.ok(frag.startsWith('#c=naddr1'));
    const parsed = parseCampaignLinkFragment(`https://example.invalid/${frag}`);
    assert.equal(parsed.campaignId, c.id);
    assert.equal(parsed.key, c.key);
    assert.deepEqual(parsed.relays, ['wss://nos.lol']);
  });
  test('keyless campaign yields a keyless fragment', () => {
    const c = makeRing();
    delete c.key;
    c.nostr = { pubkey: 'c'.repeat(64) };
    const parsed = parseCampaignLinkFragment(campaignLinkFragment(c));
    assert.equal(parsed.key, null);
    assert.equal(parsed.campaignId, c.id);
  });
  test('a key in the query string is never accepted', () => {
    const c = makeRing();
    // Fragment key still read when the query also carries one (fragment wins).
    const fragWithKey = campaignLinkFragment(c);
    assert.equal(parseCampaignLinkFragment(`https://example.invalid/?k=${c.key}${fragWithKey}`).key, c.key);
    // Same key ONLY in the query string, fragment keyless: must be ignored.
    const keyless = { ...c };
    delete keyless.key;
    keyless.nostr = { pubkey: campaignPubkey(c) };
    const fragKeyless = campaignLinkFragment(keyless);
    assert.ok(!fragKeyless.includes('&k='));
    const queryOnly = parseCampaignLinkFragment(`https://example.invalid/?k=${c.key}${fragKeyless}`);
    assert.equal(queryOnly.key, null);
  });
});
