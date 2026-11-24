// V62 + V63 + V70 acceptance tests:
// - V62: merged creation (2 required fields), no-store-link creation,
//   no-anchor-post creation, tags preserved optional, handle never fabricated,
//   platform inference & handle autofill from pasted post URLs.
// - V63: 1-member pinned invite-prompt rule, empty-templates hidden rule,
//   centered single-column wrapper class constant.
// - V70: quiet "Your turn" pill hidden with no activity, "Explore Network"
//   hidden for ringless users.
// DOM-only checks are documented in tasks/V62-create-merge.md.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateGameSetup as validateGameSetupModel,
  validateCampaign,
  normalizeCampaign,
  createCampaign,
  addPost,
  parsePostUrl,
  encodeCampaignLink,
  decodeCampaignLink,
} from '../src/campaign.mjs';

import {
  validateGameSetup,
  normalizeHandle,
  validateRingCreation,
  buildMergedCreation,
  hasRingActivity,
  shouldShowTurnSection,
  shouldShowExploreNetwork,
  START_RING,
} from '../src/home.mjs';

import {
  INVITE_PROMPT_COPY,
  RING_COLUMN_CLASS,
  shouldShowInvitePrompt,
  shouldShowTemplatesSection,
} from '../src/campaign-page.mjs';

describe('V62 — no store-link requirement', () => {
  test('validateGameSetup requires only game name (no Steam/itch required)', () => {
    assert.deepEqual(validateGameSetup({ name: 'Brass Orchard', links: {} }), []);
    assert.deepEqual(validateGameSetup({ name: 'Brass Orchard' }), []);
    assert.deepEqual(validateGameSetupModel({ name: 'Brass Orchard', links: {} }), []);
    assert.ok(validateGameSetup({ name: '   ', links: {} }).length > 0);
    assert.ok(validateGameSetup(null).length > 0);
  });

  test('createCampaign & validateCampaign succeed with zero store links', () => {
    const c = createCampaign({
      game: { name: 'Starlight Drift', links: {}, tags: ['cozy', 'puzzle'] },
      title: 'Launch ring',
      creator: { name: 'Starlight Drift', handle: '@starlight' },
    });
    assert.deepEqual(validateCampaign(c), []);
    assert.deepEqual(c.game.links, {});
    assert.deepEqual(c.game.tags, ['cozy', 'puzzle']);
  });
});

describe('V62 — no anchor post required', () => {
  test('createCampaign succeeds with no anchorPost and no posts', () => {
    const c = createCampaign({
      game: { name: 'Moss Knight', links: {}, tags: ['metroidvania'] },
      title: 'Devlog ring',
      creator: { name: 'Moss Knight', handle: '@mossdev' },
    });
    assert.deepEqual(c.posts, []);
    assert.equal(c.anchorPost, undefined);
    assert.deepEqual(validateCampaign(c), []);
    assert.deepEqual(validateCampaign(normalizeCampaign(c)), []);
  });

  test('postless ring round-trips through encodeCampaignLink / decodeCampaignLink', () => {
    const c = createCampaign({
      game: { name: 'Moss Knight', links: {}, tags: ['metroidvania'] },
      title: 'Devlog ring',
      creator: { name: 'Moss Knight', handle: '' },
    });
    const { url } = encodeCampaignLink(c, 'https://cabal.example/');
    const decoded = decodeCampaignLink(url);
    assert.equal(decoded.error, undefined);
    assert.equal(decoded.campaign.id, c.id);
    assert.deepEqual(decoded.campaign.posts, []);
    assert.equal(decoded.campaign.members[0].handle, '');
  });

  test('addPost appends cleanly to a postless ring', () => {
    const c = createCampaign({
      game: { name: 'Moss Knight' },
      title: 'Devlog ring',
      creator: { name: 'Moss Knight', handle: '@mossdev' },
    });
    const updated = addPost(c, {
      author: '@mossdev',
      platform: 'reddit',
      url: 'https://www.reddit.com/r/gamedev/comments/abc123/moss_knight_devlog/',
      text: 'First devlog!',
      kind: 'devlog',
    });
    assert.equal(updated.posts.length, 1);
    assert.deepEqual(validateCampaign(updated), []);
  });
});

describe('V62 — merged creation (2 required fields), tags preserved, handle never fabricated', () => {
  test('validateRingCreation requires ONLY gameName and ringName', () => {
    assert.deepEqual(validateRingCreation({ gameName: 'Test Game', ringName: 'Launch Ring' }), []);
    const missingBoth = validateRingCreation({ gameName: ' ', ringName: '' });
    assert.equal(missingBoth.length, 2);
    assert.ok(missingBoth.some((e) => /game name/i.test(e)));
    assert.ok(missingBoth.some((e) => /ring name/i.test(e)));
  });

  test('buildMergedCreation with only 2 fields never fabricates @testgame handle', () => {
    const res = buildMergedCreation({
      gameName: 'Test Game',
      ringName: 'Devlog & launch ring',
    });
    assert.equal(res.ok, true);
    assert.deepEqual(res.errors, []);
    assert.equal(res.game.name, 'Test Game');
    assert.deepEqual(res.game.links, {});
    assert.deepEqual(res.game.tags, []);
    // Smoke fix: me IS recorded (so the creator is recognised as their own
    // ring's member), but with an empty handle — never a fabricated one.
    assert.deepEqual(res.me, { name: 'Test Game', handle: '' });
    assert.equal(res.campaign.members.length, 1);
    assert.equal(res.campaign.members[0].name, 'Test Game');
    assert.equal(res.campaign.members[0].handle, '', 'handle must remain empty, never @testgame');
    assert.ok(!JSON.stringify(res.campaign).includes('@testgame'));
    assert.deepEqual(res.campaign.posts, []);
  });

  test('tags stay optional and are preserved when provided', () => {
    const withTags = buildMergedCreation({
      gameName: 'Brass Orchard',
      ringName: 'Cozy Launch',
      tags: 'roguelike, cozy,  pixel-art , ',
    });
    assert.equal(withTags.ok, true);
    assert.deepEqual(withTags.game.tags, ['roguelike', 'cozy', 'pixel-art']);
    assert.deepEqual(withTags.campaign.game.tags, ['roguelike', 'cozy', 'pixel-art']);

    const withoutTags = buildMergedCreation({
      gameName: 'Brass Orchard',
      ringName: 'Cozy Launch',
      tags: '',
    });
    assert.equal(withoutTags.ok, true);
    assert.deepEqual(withoutTags.game.tags, []);
  });

  test('normalizeHandle never fabricates and normalizes plain handles and profile URLs', () => {
    assert.equal(normalizeHandle(''), '');
    assert.equal(normalizeHandle('   '), '');
    assert.equal(normalizeHandle(null), '');
    assert.equal(normalizeHandle('wren'), '@wren');
    assert.equal(normalizeHandle('@@wren'), '@wren');
    assert.equal(normalizeHandle('https://x.com/wren'), '@wren');
    assert.equal(normalizeHandle('https://bsky.app/profile/wren.bsky.social'), '@wren.bsky.social');
  });

  test('parsePostUrl infers platform and autofills handle across X, Bluesky, Threads, TikTok', () => {
    assert.deepEqual(parsePostUrl('https://x.com/wren_dev/status/12345'), {
      platform: 'x',
      author: '@wren_dev',
    });
    assert.deepEqual(parsePostUrl('https://bsky.app/profile/wren.bsky.social/post/3abc'), {
      platform: 'bluesky',
      author: '@wren.bsky.social',
    });
    assert.deepEqual(parsePostUrl('https://www.threads.net/@wrendev/post/C123'), {
      platform: 'threads',
      author: '@wrendev',
    });
    assert.deepEqual(parsePostUrl('https://www.tiktok.com/@wrendev/video/999'), {
      platform: 'tiktok',
      author: '@wrendev',
    });
  });

  test('buildMergedCreation infers platform & autofills handle from pasted post URL', () => {
    const res = buildMergedCreation({
      gameName: 'Brass Orchard',
      ringName: 'Launch ring',
      postUrl: 'https://bsky.app/profile/brass.bsky.social/post/3xyz',
      postText: 'Our demo is live!',
    });
    assert.equal(res.ok, true);
    assert.equal(res.me.handle, '@brass.bsky.social');
    assert.equal(res.campaign.members[0].handle, '@brass.bsky.social');
    assert.equal(res.campaign.posts.length, 1);
    assert.equal(res.campaign.posts[0].platform, 'bluesky');
    assert.equal(res.campaign.posts[0].author, '@brass.bsky.social');
  });

  test('buildMergedCreation rejects X/Bluesky post URL when post text is missing', () => {
    const res = buildMergedCreation({
      gameName: 'Brass Orchard',
      ringName: 'Launch ring',
      postUrl: 'https://x.com/brassdev/status/123',
      postText: '',
    });
    assert.equal(res.ok, false);
    assert.ok(res.errors.some((e) => /post text/i.test(e)));
  });

  test('buildMergedCreation prefilled handle from existingMe is reused once everywhere', () => {
    const res = buildMergedCreation({
      gameName: 'Brass Orchard',
      ringName: 'Second ring',
      existingMe: { name: 'Wren', handle: '@wrendev' },
    });
    assert.equal(res.ok, true);
    assert.equal(res.me.handle, '@wrendev');
    assert.equal(res.campaign.members[0].handle, '@wrendev');
  });
});

describe('V63 — 1-member invite prompt, empty templates hidden, centered column class', () => {
  const soloRing = {
    id: 'cmp_solo1111',
    title: 'Solo Ring',
    members: [{ name: 'Wren', handle: '@wren' }],
    posts: [],
    formatIds: [],
  };
  const twoDevRing = {
    ...soloRing,
    id: 'cmp_pair2222',
    members: [
      { name: 'Wren', handle: '@wren' },
      { name: 'Moss', handle: '@moss' },
    ],
  };

  test('shouldShowInvitePrompt is true ONLY when ring has exactly 1 member', () => {
    assert.equal(shouldShowInvitePrompt(soloRing), true);
    assert.equal(shouldShowInvitePrompt(twoDevRing), false);
    assert.equal(shouldShowInvitePrompt({ ...soloRing, members: [] }), false);
    assert.equal(shouldShowInvitePrompt(null), false);
    assert.equal(INVITE_PROMPT_COPY, 'Your ring is live. It needs other devs.');
  });

  test('shouldShowTemplatesSection hides empty block on new 1-member rings', () => {
    assert.equal(shouldShowTemplatesSection(soloRing), false);
    assert.equal(shouldShowTemplatesSection({ ...soloRing, formatIds: ['fmt_algoigno'] }), true);
    assert.equal(shouldShowTemplatesSection(twoDevRing), true);
    assert.equal(shouldShowTemplatesSection(null), false);
  });

  test('RING_COLUMN_CLASS exports the desktop single-column wrapper class', () => {
    assert.equal(RING_COLUMN_CLASS, 'campaign-page--centered');
  });
});

describe('V70 — debris sweep rules (turn pill, Explore Network, inline explainer)', () => {
  const emptyRing = {
    id: 'cmp_empty111',
    title: 'New Ring',
    members: [{ name: 'Wren', handle: '@wren' }],
    posts: [],
    createdAt: '2026-11-24T00:00:00.000Z',
  };
  const activeRing = {
    id: 'cmp_actv2222',
    title: 'Active Ring',
    members: [
      { name: 'Wren', handle: '@wren' },
      { name: 'Moss', handle: '@moss' },
    ],
    posts: [
      {
        id: 'pst_1111aaaa',
        author: '@moss',
        platform: 'reddit',
        url: 'https://reddit.com/r/gamedev/comments/1/hi/',
        createdAt: '2026-11-24T00:00:00.000Z',
        assists: [],
      },
    ],
    createdAt: '2026-11-24T00:00:00.000Z',
  };

  test('shouldShowTurnSection returns "none" on account with no rings or no posts/activity', () => {
    assert.equal(hasRingActivity([]), false);
    assert.equal(hasRingActivity([emptyRing]), false);
    assert.equal(shouldShowTurnSection([], { handle: '@wren' }), 'none');
    assert.equal(shouldShowTurnSection([emptyRing], { handle: '@wren' }), 'none');
  });

  test('shouldShowTurnSection returns "posts" when unassisted posts exist and "caught-up" when caught up with activity', () => {
    assert.equal(shouldShowTurnSection([activeRing], { handle: '@wren' }), 'posts');
    assert.equal(shouldShowTurnSection([activeRing], { handle: '@moss' }), 'caught-up');
  });

  test('shouldShowExploreNetwork hides Explore Network while user has no rings', () => {
    assert.equal(shouldShowExploreNetwork([]), false);
    assert.equal(shouldShowExploreNetwork(null), false);
    assert.equal(shouldShowExploreNetwork([emptyRing]), true);
  });

  test('START_RING explainer copy remains available for plain-text first-line display', () => {
    assert.ok(START_RING.help.length > 0);
    assert.equal(START_RING.button, 'Start a ring');
  });
});
