// V43c acceptance: creator removal UI helpers (spec 17b/17d).
// Fixtures match the spec shapes. DOM behaviour: see tasks/V43c-removal-ui.md.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REMOVED_NOTICE, atHandle, removeConfirmCopy, isCreator, isRemovedHandle,
  removedRoster, canRemoveMember, controlsHidden, removeMemberFromCampaign,
} from '../src/campaign-page.mjs';

const ring = () => ({
  id: 'c1', title: 'T', createdBy: '@Alice',
  members: [{ name: 'A', handle: '@alice' }, { name: 'B', handle: '@bob' }],
  removedMembers: [{ handle: '@carol', removedAt: '2026-01-01T00:00:00.000Z', removedBy: '@alice' }],
  posts: [{ id: 'p1', author: '@bob', platform: 'x', url: 'https://x.com/a/1', assists: [] }],
});

describe('V43c removal UI helpers', () => {
  test('creator check is case-insensitive and @-tolerant', () => {
    assert.equal(isCreator(ring(), '@alice'), true);
    assert.equal(isCreator(ring(), 'ALICE'), true);
    assert.equal(isCreator(ring(), '@bob'), false);
    assert.equal(isCreator({ members: [] }, '@alice'), false);
    assert.equal(isCreator(ring(), ''), false);
  });
  test('removed-state derivation', () => {
    assert.equal(isRemovedHandle(ring(), '@CAROL'), true);
    assert.equal(isRemovedHandle(ring(), '@bob'), false);
    assert.equal(isRemovedHandle({ members: [] }, '@bob'), false);
    assert.deepEqual(removedRoster(ring()).map((r) => r.handle), ['@carol']);
    assert.deepEqual(removedRoster({}), []);
  });
  test('Remove button: creator only, not self, not already removed', () => {
    const c = ring();
    assert.equal(canRemoveMember(c, { handle: '@alice' }, '@bob'), true);
    assert.equal(canRemoveMember(c, { handle: '@bob' }, '@alice'), false);
    assert.equal(canRemoveMember(c, { handle: '@alice' }, '@alice'), false);
    assert.equal(canRemoveMember(c, { handle: '@alice' }, '@carol'), false);
    assert.equal(canRemoveMember(c, {}, '@bob'), false);
  });
  test('controls hidden only when local handle is removed', () => {
    const c = ring();
    assert.equal(controlsHidden(c, { handle: '@carol' }), true);
    assert.equal(controlsHidden(c, { handle: '@bob' }), false);
    assert.equal(controlsHidden(c, {}), false);
  });
  test('copy matches spec and never doubles the @', () => {
    assert.equal(atHandle('bob'), '@bob');
    assert.equal(atHandle('@bob'), '@bob');
    assert.equal(
      removeConfirmCopy('@bob'),
      "Remove @bob from this ring? Their past posts stay; they can't add anything new. The invite link stays the same.",
    );
    assert.match(REMOVED_NOTICE, /You were removed from this ring\. You can still read it\./);
  });
  test('removeMember: creator removes, posts stay, repeat updates removedAt', () => {
    const c = ring();
    const n = removeMemberFromCampaign(c, '@bob', { by: '@alice', now: '2026-02-02T00:00:00.000Z' });
    assert.equal(c.members.length, 2, 'input not mutated');
    assert.deepEqual(n.members.map((m) => m.handle), ['@alice']);
    assert.equal(n.posts.length, 1);
    assert.equal(n.removedMembers.length, 2);
    assert.equal(isRemovedHandle(n, '@bob'), true);
    const again = removeMemberFromCampaign(n, '@bob', { by: '@alice', now: '2026-03-03T00:00:00.000Z' });
    assert.equal(again.removedMembers.length, 2);
    assert.equal(again.removedMembers.find((r) => r.handle === '@bob').removedAt, '2026-03-03T00:00:00.000Z');
  });
  test('removeMember: non-creator gets an unchanged copy', () => {
    const c = ring();
    const n = removeMemberFromCampaign(c, '@alice', { by: '@bob' });
    assert.deepEqual(n.members, c.members);
    assert.deepEqual(n.removedMembers, c.removedMembers);
  });
});
