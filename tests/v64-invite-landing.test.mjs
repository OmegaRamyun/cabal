import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isInviteLanding, validateJoin, joinRing, deriveHandle, renderInviteCard, renderDeadLink,
  INVITE_COPY, DEAD_LINK_COPY,
} from '../src/invite-landing.mjs';

const ring = () => ({
  id: 'cmp_abc123', name: 'Launch ring', game: { name: 'ToonSouls' },
  members: [{ name: 'Ada', handle: '@ada' }], removedMembers: [{ handle: '@gone' }], posts: [],
});

test('non-member sees landing, member does not', () => {
  assert.equal(isInviteLanding(ring(), '@bob'), true);
  assert.equal(isInviteLanding(ring(), ''), true);
  assert.equal(isInviteLanding(ring(), '@ADA'), false);
  assert.equal(isInviteLanding(null, '@bob'), false);
});

test('removed viewer is not shown the landing', () => {
  assert.equal(isInviteLanding(ring(), '@gone'), false);
});

test('handle-less creator is recognised by their unclaimed seed member (smoke fix)', () => {
  const seed = () => ({
    id: 'cmp_seed01', title: 'Smoke Ring', game: { name: 'Smoke Game' },
    members: [{ name: 'Smoke Game', handle: '' }], posts: [],
  });
  // Creator: me = {name: 'Smoke Game', handle: ''} — no landing.
  assert.equal(isInviteLanding(seed(), '', 'Smoke Game'), false);
  // Stranger with no me record at all — landing.
  assert.equal(isInviteLanding(seed(), undefined, undefined), true);
  // Handle-less viewer with a different name — landing (not the creator).
  assert.equal(isInviteLanding(seed(), '', 'Other Game'), true);
  // Claimed seed (handle filled in) — an empty-handle viewer is a stranger.
  const claimed = seed();
  claimed.members[0].handle = '@smokedev';
  assert.equal(isInviteLanding(claimed, '', 'Smoke Game'), true);
});

test('invite card shows the ring title, not the game name twice (smoke fix)', () => {
  const card = renderInviteCard({
    id: 'cmp_seed01', title: 'Smoke Ring', game: { name: 'Smoke Game' },
    members: [{ name: 'Smoke Game', handle: '' }], posts: [],
  }, {});
  assert.ok(card.includes('<h2 class="invite-title">Smoke Ring</h2>'));
  assert.ok(card.includes('<p class="invite-game">Smoke Game</p>'), 'game name appears as the game line, not the title');
  assert.ok(!card.includes('<h2 class="invite-title">Smoke Game</h2>'));
});

test('join needs a name; handle optional and derived', () => {
  assert.equal(validateJoin(ring(), { name: '  ', handle: '@x' }).ok, false);
  const v = validateJoin(ring(), { name: 'Bob Ross' });
  assert.equal(v.ok, true);
  assert.equal(v.member.handle, '@bobross');
  assert.equal(deriveHandle('Ada', ring()), '@ada2');
});

test('join adds member via addMember; removed handle refused', () => {
  const r = joinRing(ring(), { name: 'Bob', handle: 'bob' });
  assert.equal(r.ok, true);
  assert.ok(r.campaign.members.some((m) => m.handle === '@bob'));
  assert.equal(joinRing(ring(), { name: 'G', handle: '@gone' }).ok, false);
});

test('copy: friendly, no raw cmp_ id, no "Local only"', () => {
  const card = renderInviteCard(ring(), {});
  assert.ok(card.includes(INVITE_COPY));
  assert.ok(card.includes('Join ring'));
  assert.ok(!card.includes('cmp_'));
  const dead = renderDeadLink();
  assert.ok(dead.includes(DEAD_LINK_COPY));
  assert.ok(!dead.includes('cmp_'));
  assert.ok(!readFileSync(new URL('../src/invite-landing.mjs', import.meta.url), 'utf8').includes('Local only'));
});
