// V22 acceptance: pure helpers for home + campaign page.
// DOM behaviour (setup form, dashboard render, join) is a manual check:
// serve the repo, open home with no saved game, complete setup, create a
// campaign, open its page, join as a second handle.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMember,
  createCampaign,
  isLive,
  liveCampaign,
  myCampaigns,
  parseTags,
  ringSummary,
  validateGameSetup,
  yourTurn,
} from '../src/home.mjs';
import { hasQuotablePost } from '../src/campaign-page.mjs';

const game = {
  name: 'Test Game',
  links: { steam: 'https://store.steampowered.com/app/1', itch: '' },
  tags: ['roguelike'],
};

function campaign(overrides = {}) {
  return {
    id: 'cmp_test1234',
    game,
    title: 'Launch push',
    anchorPost: {
      platform: 'x',
      url: 'https://x.com/dev/status/1',
      text: 'Our game is out!',
      author: '@dev',
    },
    window: null,
    members: [
      { name: 'Dev', handle: '@dev', status: 'posted', quoteUrl: 'https://x.com/dev/status/2' },
      { name: 'Pal', handle: '@pal', status: 'pending' },
    ],
    createdAt: '2026-11-22T00:00:00.000Z',
    ...overrides,
  };
}

// --- setup validation ---

test('validateGameSetup: valid game passes', () => {
  assert.deepEqual(validateGameSetup(game), []);
});

test('validateGameSetup: name required', () => {
  const errors = validateGameSetup({ name: '  ', links: { steam: 'https://x' } });
  assert.ok(errors.some((e) => /name/i.test(e)));
});

test('validateGameSetup: store link optional (V62 — merged creation)', () => {
  // V62 dropped the store-link requirement: a game name alone is enough;
  // store links are optional, add-later fields.
  assert.deepEqual(validateGameSetup({ name: 'G', links: {} }), []);
  // itch alone is still fine
  assert.deepEqual(
    validateGameSetup({ name: 'G', links: { itch: 'https://g.itch.io/g' } }),
    [],
  );
});

test('parseTags: comma-separated, trimmed, empties dropped', () => {
  assert.deepEqual(parseTags('roguelike, cozy , ,pixel-art'), [
    'roguelike',
    'cozy',
    'pixel-art',
  ]);
  assert.deepEqual(parseTags(''), []);
  assert.deepEqual(parseTags(null), []);
});

// --- ring summary / live / your turn ---

test('ringSummary: counts posted vs pending', () => {
  assert.deepEqual(ringSummary(campaign()), { posted: 1, total: 2, pending: 1 });
  assert.deepEqual(ringSummary(campaign({ members: [] })), {
    posted: 0,
    total: 0,
    pending: 0,
  });
});

test('isLive: no window is always live; window contains now', () => {
  const now = new Date('2026-11-22T12:00:00Z');
  assert.equal(isLive(campaign(), now), true);
  assert.equal(
    isLive(
      campaign({ window: { start: '2026-11-20', end: '2026-11-25' } }),
      now,
    ),
    true,
  );
  assert.equal(
    isLive(
      campaign({ window: { start: '2026-11-23', end: '2026-11-25' } }),
      now,
    ),
    false,
  );
  assert.equal(
    isLive(
      campaign({ window: { start: '2026-11-01', end: '2026-11-02' } }),
      now,
    ),
    false,
  );
});

test('liveCampaign: first live campaign, null when none live', () => {
  const now = new Date('2026-11-22T12:00:00Z');
  const past = campaign({
    id: 'cmp_past',
    window: { start: '2026-11-01', end: '2026-11-02' },
  });
  const live = campaign({ id: 'cmp_live' });
  assert.equal(liveCampaign([past, live], now).id, 'cmp_live');
  assert.equal(liveCampaign([past], now), null);
  assert.equal(liveCampaign([], now), null);
});

test('yourTurn: campaigns where me is a pending member', () => {
  const me = { name: 'Pal', handle: '@pal' };
  const owed = campaign({ id: 'cmp_owed' });
  const done = campaign({
    id: 'cmp_done',
    members: [{ name: 'Pal', handle: '@pal', status: 'posted' }],
  });
  const notMine = campaign({
    id: 'cmp_other',
    members: [{ name: 'Dev', handle: '@dev', status: 'posted' }],
  });
  assert.deepEqual(
    yourTurn([owed, done, notMine], me).map((c) => c.id),
    ['cmp_owed'],
  );
  assert.deepEqual(yourTurn([owed], null), []);
  assert.deepEqual(yourTurn([owed], {}), []);
});

test('myCampaigns: campaigns I am a member of; all when no me', () => {
  const me = { name: 'Pal', handle: '@pal' };
  const mine = campaign({ id: 'cmp_mine' });
  const other = campaign({
    id: 'cmp_other',
    members: [{ name: 'Dev', handle: '@dev', status: 'posted' }],
  });
  assert.deepEqual(
    myCampaigns([mine, other], me).map((c) => c.id),
    ['cmp_mine'],
  );
  assert.equal(myCampaigns([mine, other], null).length, 2);
});

// --- create / join (duplicated V21 helpers) ---

test('createCampaign: frozen shape, id + createdAt, creator pending', () => {
  const c = createCampaign({
    game,
    title: 'Push',
    anchorPost: { platform: 'x', url: 'https://x.com/d/1', text: 'Hi', author: '@dev' },
    window: { start: '2026-11-23', end: '2026-11-30' },
    me: { name: 'Dev', handle: '@dev' },
  });
  assert.match(c.id, /^cmp_[a-z0-9]{8}$/);
  assert.ok(!Number.isNaN(Date.parse(c.createdAt)));
  assert.equal(c.title, 'Push');
  assert.equal(c.game.name, 'Test Game');
  assert.deepEqual(c.members, [{ name: 'Dev', handle: '@dev' }]);
  assert.equal(c.posts.length, 1);
  assert.equal(c.posts[0].url, 'https://x.com/d/1');
  assert.equal(c.window.start, '2026-11-23');
});

test('createCampaign: no creator means invalid — V21 throws', () => {
  assert.throws(
    () =>
      createCampaign({
        game,
        title: 'Push',
        anchorPost: { platform: 'x', url: 'https://x.com/d/1', text: 'Hi', author: '@dev' },
        window: null,
        me: null,
      }),
    /members: at least one member is required/,
  );
});

test('addMember: appends pending, dedupes by handle, no mutation', () => {
  const c = campaign();
  const joined = addMember(c, { name: 'New', handle: '@new' });
  assert.equal(joined.members.length, 3);
  assert.equal(joined.members[2].status, undefined, 'v2 roster carries no status');
  assert.equal(c.members.length, 2); // original untouched
  // Dedupe returns a new object with the same content (V21: no mutation,
  // never the same reference).
  assert.deepEqual(addMember(joined, { name: 'Pal again', handle: '@pal' }), joined);
  assert.notEqual(addMember(joined, { name: 'Pal again', handle: '@pal' }), joined);
});

test('hasQuotablePost: true only with a posted member holding a quote link', () => {
  assert.equal(hasQuotablePost(campaign()), true);
  assert.equal(hasQuotablePost(campaign({ members: [{ name: 'Pal', handle: '@pal', status: 'pending' }] })), false);
  assert.equal(hasQuotablePost(campaign({ members: [{ name: 'Dev', handle: '@dev', status: 'posted' }] })), false);
  assert.equal(hasQuotablePost(campaign({ members: [] })), false);
  assert.equal(hasQuotablePost(null), false);
});
