// V28 — Social feel: relative time, avatar initials/hue, postedAt stamp,
// demo quote data. Pure functions only; rendering is covered by the
// Playwright check-social script.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  relativeTime,
  initials,
  avatarHue,
  AVATAR_HUES,
  markPosted,
} from '../src/campaign.mjs';
import { demoCampaigns } from '../src/demo.mjs';

const NOW = new Date('2026-11-22T12:00:00Z');
const iso = (s) => new Date(s).toISOString();

test('relativeTime: just now / minutes / hours / days / month-day fallback', () => {
  assert.equal(relativeTime(iso('2026-11-22T11:59:30Z'), NOW), 'just now');
  assert.equal(relativeTime(iso('2026-11-22T11:55:00Z'), NOW), '5m');
  assert.equal(relativeTime(iso('2026-11-22T10:00:00Z'), NOW), '2h');
  assert.equal(relativeTime(iso('2026-11-19T12:00:00Z'), NOW), '3d');
  assert.equal(relativeTime(iso('2026-11-12T12:00:00Z'), NOW), 'Nov 12');
});

test('relativeTime: invalid input hides the timestamp, future is just now', () => {
  assert.equal(relativeTime('not a date', NOW), '');
  assert.equal(relativeTime('', NOW), '');
  assert.equal(relativeTime(null, NOW), '');
  assert.equal(relativeTime(iso('2026-11-23T12:00:00Z'), NOW), 'just now');
});

test('initials: first letters of the first two words, @ stripped, empty is ?', () => {
  assert.equal(initials('Moss'), 'M');
  assert.equal(initials('Mary Jane'), 'MJ');
  assert.equal(initials('@mossplays'), 'M');
  assert.equal(initials('Starlight Salvage'), 'SS');
  assert.equal(initials(''), '?');
  assert.equal(initials('   '), '?');
  assert.equal(initials(null), '?');
});

test('avatarHue: deterministic, in range, spread across the demo names', () => {
  assert.equal(AVATAR_HUES, 6);
  for (const n of ['@mossplays', '@junebakes', '@pipdraws', 'Wren']) {
    const h = avatarHue(n);
    assert.ok(h >= 0 && h < AVATAR_HUES, `${n} -> ${h}`);
    assert.equal(avatarHue(n), h, 'deterministic');
  }
  assert.equal(avatarHue('@mossplays'), 5);
  assert.equal(avatarHue('@junebakes'), 2);
  assert.equal(avatarHue('Wren'), 4);
  const hues = new Set(
    ['@mossplays', '@junebakes', '@pipdraws', '@rookdev', '@sablepixels', '@fernfolk', 'Wren'].map(avatarHue),
  );
  assert.ok(hues.size >= 4, `spread ${[...hues]}`);
});

test('markPosted (deprecated): stamps contributedAt on posts[0], unknown handle stays an unchanged copy', () => {
  const c = {
    id: 'cmp_x', createdAt: '2026-11-20T00:00:00Z',
    anchorPost: { platform: 'x', url: 'https://x.com/a/status/1', text: 'hi', author: '@a' },
    members: [
      { name: 'Jo', handle: '@jo', status: 'pending' },
      { name: 'Al', handle: '@al', status: 'pending' },
    ],
  };
  const posted = markPosted(c, '@jo', 'https://x.com/jo/status/9', NOW);
  const assists = posted.posts[0].assists;
  assert.equal(assists.length, 1);
  assert.equal(assists[0].handle, '@jo');
  assert.equal(assists[0].contributedAt, '2026-11-22T12:00:00.000Z');
  assert.equal(assists[0].url, 'https://x.com/jo/status/9');
  assert.equal(c.members[0].postedAt, undefined, 'no mutation of the original');
  const noop = markPosted(c, '@nobody');
  assert.equal(noop.posts[0].assists.length, 0);
  assert.notEqual(noop, c);
});

test('demo: contributors carry contributedAt + quoteText in their own words (assists on posts[0])', () => {
  const [live, , fest] = demoCampaigns(NOW);
  const assistOf = (c, handle) => c.posts[0].assists.find((a) => a.handle === handle);
  const moss = assistOf(live, '@mossplays');
  assert.equal(relativeTime(moss.contributedAt, NOW), '2h');
  assert.match(moss.quoteText, /cozy/);
  const pip = assistOf(live, '@pipdraws');
  assert.equal(relativeTime(pip.contributedAt, NOW), '5h');
  assert.ok(pip.quoteText.length > 10);
  const festMoss = assistOf(fest, '@mossplays');
  assert.equal(relativeTime(festMoss.contributedAt, NOW), '1d');
  assert.equal(assistOf(live, '@junebakes'), undefined, 'June has not contributed');
  assert.equal(live.members.find((m) => m.handle === '@junebakes').status, undefined);
});
