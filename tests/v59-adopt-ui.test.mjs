// V59 acceptance tests — Adopt UI (two entry points: format page + ring page).
// Covers V58 contract shim, picker lists, adopt/remove permissions (any member
// adopts; creator-only removes, past history kept), chip rendering inputs,
// no-op adoption of already-running templates, and format-page mount flow.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatIdsForRing,
  formatIdForRing,
  adoptTemplate,
  removeTemplate,
  ringsRunningFormat,
  isRingMember,
  adoptableRingsForFormat,
  adoptFormatIntoRing,
  mount as mountFormat,
} from '../src/campaign-formats.mjs';

import {
  canAdoptTemplate,
  canRemoveTemplate,
  removeTemplateConfirmCopy,
  runningTemplateChips,
  pickableFormatsForRing,
  adoptTemplateInRing,
  removeTemplateFromRing,
} from '../src/campaign-page.mjs';

import { createMemoryStore } from '../src/store.mjs';

const FMT_A = {
  id: 'fmt_algoigno',
  tagline: 'MY GAME IS GOOD THE ALGORITHM JUST IGNORES ME',
  description: 'Deadpan complaint format.',
  howTo: 'Say one real thing about your game and disclose your ring.',
  examples: [],
  tags: ['meme'],
  demo: true,
};
const FMT_B = {
  id: 'fmt_oneclip1',
  tagline: 'ONE MOMENT, ONE LINE',
  description: 'Short gameplay clip with one line.',
  howTo: 'Post one clip and disclose your ring.',
  examples: [],
  tags: ['clip'],
  demo: true,
};
const FMT_C = {
  id: 'fmt_weekship',
  tagline: 'WHAT WE SHIPPED THIS WEEK',
  description: 'Weekly build-in-public rhythm.',
  howTo: 'Share one change and disclose your ring.',
  examples: [],
  tags: ['devlog'],
  demo: true,
};
const FMT_OWN = {
  id: 'fmt_own12345',
  tagline: 'BOSS FIGHT FRIDAY',
  description: 'Show a boss attack pattern.',
  howTo: 'Post a clip and disclose your ring.',
  examples: [],
  tags: ['boss'],
};

function makeRing(overrides = {}) {
  return {
    id: 'cmp_ring0001',
    title: 'Launch Week',
    game: {
      name: 'Starlight Salvage',
      links: { steam: 'https://store.steampowered.com/app/12345' },
      tags: ['roguelike'],
    },
    createdBy: '@alice',
    members: [
      { name: 'Alice', handle: '@alice' },
      { name: 'Bob', handle: '@bob' },
    ],
    removedMembers: [{ handle: '@eve', removedAt: '2026-11-20T00:00:00Z', removedBy: '@alice' }],
    posts: [
      {
        id: 'pst_11111111',
        author: '@alice',
        platform: 'x',
        url: 'https://x.com/alice/status/1',
        text: 'Launch post',
        createdAt: '2026-11-21T00:00:00Z',
        assists: [{ handle: '@bob', status: 'contributed', contributedAt: '2026-11-21T01:00:00Z', note: 'Quoted!' }],
      },
    ],
    formatIds: ['fmt_algoigno'],
    createdAt: '2026-11-20T00:00:00Z',
    ...overrides,
  };
}

describe('V59 — V58 contract shim (multi-template helpers)', () => {
  test('formatIdsForRing normalizes, dedupes, preserves order, reads legacy formatId', () => {
    assert.deepEqual(
      formatIdsForRing({ formatIds: [' FMT_ALGOIGNO ', 'fmt_oneclip1', 'fmt_algoigno', 'bad_id', 42] }),
      ['fmt_algoigno', 'fmt_oneclip1'],
    );
    assert.deepEqual(formatIdsForRing({ formatId: ' FMT_ONECLIP1 ' }), ['fmt_oneclip1']);
    assert.equal(formatIdForRing({ formatIds: ['fmt_oneclip1', 'fmt_algoigno'] }), 'fmt_oneclip1');
    assert.equal(formatIdForRing({}), null);
  });

  test('adoptTemplate appends id, is idempotent on already-running, ignores invalid ids', () => {
    const r0 = makeRing({ formatIds: ['fmt_algoigno'] });
    const r1 = adoptTemplate(r0, 'fmt_oneclip1');
    assert.deepEqual(r1.formatIds, ['fmt_algoigno', 'fmt_oneclip1']);
    assert.equal('formatId' in r1, false);
    assert.deepEqual(r0.formatIds, ['fmt_algoigno']); // input untouched

    const r2 = adoptTemplate(r1, 'FMT_ONECLIP1');
    assert.deepEqual(r2.formatIds, ['fmt_algoigno', 'fmt_oneclip1']);

    const bad = adoptTemplate(r0, 'not-a-format');
    assert.equal(bad, r0);
  });

  test('removeTemplate removes id without mutating input or touching posts; no-op when absent', () => {
    const r0 = makeRing({ formatIds: ['fmt_algoigno', 'fmt_oneclip1'] });
    const r1 = removeTemplate(r0, 'fmt_algoigno');
    assert.deepEqual(r1.formatIds, ['fmt_oneclip1']);
    assert.deepEqual(r1.posts, r0.posts);
    assert.deepEqual(r0.formatIds, ['fmt_algoigno', 'fmt_oneclip1']);

    const r2 = removeTemplate(r1, 'fmt_weekship');
    assert.deepEqual(r2.formatIds, ['fmt_oneclip1']);
  });

  test('ringsRunningFormat matches any template in formatIds', () => {
    const r1 = makeRing({ id: 'cmp_1', formatIds: ['fmt_algoigno', 'fmt_oneclip1'] });
    const r2 = makeRing({ id: 'cmp_2', formatIds: ['fmt_oneclip1'] });
    const r3 = makeRing({ id: 'cmp_3', formatIds: [] });
    assert.deepEqual(ringsRunningFormat('fmt_oneclip1', [r1, r2, r3]).map((r) => r.id), ['cmp_1', 'cmp_2']);
    assert.deepEqual(ringsRunningFormat('fmt_algoigno', [r1, r2, r3]).map((r) => r.id), ['cmp_1']);
  });
});

describe('V59 Entry Point 1 — Format page picker & adopt', () => {
  test('isRingMember checks handle case-insensitively and excludes removed/non-members', () => {
    const ring = makeRing();
    assert.equal(isRingMember(ring, { handle: '@alice' }), true);
    assert.equal(isRingMember(ring, { handle: 'BOB' }), true);
    assert.equal(isRingMember(ring, { handle: '@eve' }), false); // removed
    assert.equal(isRingMember(ring, { handle: '@stranger' }), false);
    assert.equal(isRingMember(ring, null), false);
    assert.equal(isRingMember(ring, { handle: '' }), false);
  });

  test('adoptableRingsForFormat lists only member rings, available before alreadyRunning', () => {
    const rAlready = makeRing({ id: 'cmp_a', title: 'Already Running', formatIds: ['fmt_oneclip1'] });
    const rOpen = makeRing({ id: 'cmp_b', title: 'Open Ring', formatIds: ['fmt_algoigno'] });
    const rNotMine = makeRing({
      id: 'cmp_c',
      title: 'Someone Else',
      members: [{ name: 'Zed', handle: '@zed' }],
      formatIds: [],
    });
    const rRemoved = makeRing({
      id: 'cmp_d',
      title: 'Removed From',
      members: [{ name: 'Alice', handle: '@alice' }],
      removedMembers: [{ handle: '@bob', removedAt: '2026-11-20T00:00:00Z' }],
    });

    const list = adoptableRingsForFormat('fmt_oneclip1', [rAlready, rOpen, rNotMine, rRemoved], { handle: '@bob' });
    assert.deepEqual(list.map((e) => e.id), ['cmp_b', 'cmp_a']);
    assert.equal(list[0].alreadyRunning, false);
    assert.equal(list[1].alreadyRunning, true);
    assert.deepEqual(adoptableRingsForFormat('bad_id', [rOpen], { handle: '@bob' }), []);
    assert.deepEqual(adoptableRingsForFormat('fmt_oneclip1', [rOpen], null), []);
  });

  test('adoptFormatIntoRing: any member adopts; already-running is no-op; non-member/removed blocked', () => {
    const ring = makeRing({ formatIds: ['fmt_algoigno'] });
    // Non-creator member can adopt
    const ok = adoptFormatIntoRing(ring, 'fmt_oneclip1', { handle: '@bob' });
    assert.equal(ok.ok, true);
    assert.equal(ok.changed, true);
    assert.deepEqual(ok.ring.formatIds, ['fmt_algoigno', 'fmt_oneclip1']);

    // Already running -> no-op
    const noop = adoptFormatIntoRing(ok.ring, 'fmt_oneclip1', { handle: '@bob' });
    assert.equal(noop.ok, true);
    assert.equal(noop.changed, false);
    assert.deepEqual(noop.ring.formatIds, ['fmt_algoigno', 'fmt_oneclip1']);

    // Non-member blocked
    const denied = adoptFormatIntoRing(ring, 'fmt_oneclip1', { handle: '@stranger' });
    assert.equal(denied.ok, false);
    assert.equal(denied.reason, 'not-a-member');

    // Removed member blocked
    const removed = adoptFormatIntoRing(ring, 'fmt_oneclip1', { handle: '@eve' });
    assert.equal(removed.ok, false);
    assert.equal(removed.reason, 'not-a-member');
  });

  test('format page mount: opens ring picker, adopts into store, navigates to ring', () => {
    class FakeEl {
      constructor(tag) {
        this.tagName = tag.toUpperCase();
        this.children = [];
        this.className = '';
        this._text = '';
        this._l = {};
        this.attrs = {};
        this.removed = false;
      }
      get textContent() { return this._text + this.children.map((c) => c.textContent).join(' '); }
      set textContent(v) { this._text = v ?? ''; this.children = []; }
      appendChild(c) { this.children.push(c); return c; }
      setAttribute(k, v) { this.attrs[k] = String(v); }
      addEventListener(t, f) { (this._l[t] ||= []).push(f); }
      click() { for (const f of this._l.click || []) f({}); }
      remove() { this.removed = true; }
      all(pred, out = []) {
        for (const c of this.children) {
          if (c.removed) continue;
          if (pred(c)) out.push(c);
          c.all(pred, out);
        }
        return out;
      }
    }
    const body = new FakeEl('body');
    const root = new FakeEl('div');
    root.ownerDocument = {
      body,
      createElement: (t) => new FakeEl(t),
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    const store = createMemoryStore();
    const ring = makeRing({ id: 'cmp_mine0001', title: 'My Ring', formatIds: ['fmt_algoigno'] });
    store.saveCampaigns([ring]);
    store.saveMe({ name: 'Bob', handle: '@bob' });

    const adoptedEvents = [];
    const navigated = [];
    mountFormat(root, {
      format: FMT_B,
      rings: [ring],
      store,
      onAdopt: (r, fid) => adoptedEvents.push({ ringId: r.id, formatId: fid }),
      navigate: (r) => navigated.push(r),
    });

    const adoptBtn = root.all((n) => n.className.includes('format-adopt-btn'))[0];
    assert.ok(adoptBtn, 'Run this template in my ring button exists');
    assert.match(adoptBtn.textContent, /Run this template in my ring/);

    // Click to open picker
    adoptBtn.click();
    const rows = body.all((n) => n.className === 'adopt-picker-row');
    assert.equal(rows.length, 1);
    assert.match(rows[0].textContent, /My Ring/);

    // Click ring row -> adopts, persists, navigates
    rows[0].click();
    assert.equal(adoptedEvents.length, 1);
    assert.deepEqual(adoptedEvents[0], { ringId: 'cmp_mine0001', formatId: 'fmt_oneclip1' });
    assert.equal(navigated.length, 1);
    assert.deepEqual(navigated[0].formatIds, ['fmt_algoigno', 'fmt_oneclip1']);
    assert.deepEqual(store.loadCampaigns()[0].formatIds, ['fmt_algoigno', 'fmt_oneclip1']);

    // Re-open and click the same ring again -> no-op on adoption, still navigates
    adoptBtn.click();
    const rowsAgain = body.all((n) => n.className === 'adopt-picker-row');
    assert.equal(rowsAgain.length, 1);
    assert.match(rowsAgain[0].textContent, /Running/);
    rowsAgain[0].click();
    assert.equal(adoptedEvents.length, 1, 'already-running adoption did not re-fire onAdopt');
    assert.equal(navigated.length, 2);
  });
});

describe('V59 Entry Point 2 — Ring page templates section & permissions', () => {
  test('permissions: any member can adopt; only creator can remove', () => {
    const ring = makeRing();
    assert.equal(canAdoptTemplate(ring, { handle: '@alice' }), true);
    assert.equal(canAdoptTemplate(ring, { handle: '@bob' }), true);
    assert.equal(canAdoptTemplate(ring, { handle: '@eve' }), false); // removed
    assert.equal(canAdoptTemplate(ring, { handle: '@stranger' }), false);
    assert.equal(canAdoptTemplate(ring, null), false);

    assert.equal(canRemoveTemplate(ring, { handle: '@alice' }), true);
    assert.equal(canRemoveTemplate(ring, { handle: 'ALICE' }), true);
    assert.equal(canRemoveTemplate(ring, { handle: '@bob' }), false);
    assert.equal(canRemoveTemplate(ring, { handle: '@eve' }), false);
    assert.equal(canRemoveTemplate(ring, null), false);
  });

  test('runningTemplateChips renders links to format pages and creator-only removable flag', () => {
    const ring = makeRing({ formatIds: ['fmt_algoigno', 'fmt_unknown1'] });
    const creatorChips = runningTemplateChips(ring, [FMT_A, FMT_B], { handle: '@alice' });
    assert.equal(creatorChips.length, 2);
    assert.deepEqual(creatorChips[0], {
      id: 'fmt_algoigno',
      tagline: FMT_A.tagline,
      href: '#/format/fmt_algoigno',
      removable: true,
      demo: true,
    });
    assert.deepEqual(creatorChips[1], {
      id: 'fmt_unknown1',
      tagline: 'fmt_unknown1',
      href: '#/format/fmt_unknown1',
      removable: true,
      demo: false,
    });

    const memberChips = runningTemplateChips(ring, [FMT_A], { handle: '@bob' });
    assert.equal(memberChips[0].removable, false);
  });

  test('pickableFormatsForRing admits listable formats + user own formats, hides unrun non-user formats', () => {
    const ring = makeRing({ formatIds: ['fmt_algoigno'] });
    const otherListableRing = makeRing({ id: 'cmp_other001', formatIds: ['fmt_oneclip1'] });
    const unListableRing = makeRing({
      id: 'cmp_solo0001',
      members: [{ name: 'Solo', handle: '@solo' }], // only 1 member -> not listable
      formatIds: ['fmt_weekship'],
    });

    const picked = pickableFormatsForRing(ring, {
      formats: [FMT_A, FMT_B, FMT_C],
      userFormats: [FMT_OWN],
      rings: [ring, otherListableRing, unListableRing],
    });

    // FMT_C is only on a 1-member (unlistable) ring and not user-owned -> excluded!
    // FMT_B is on otherListableRing (listable) -> included (available)
    // FMT_OWN is user-owned -> included even with 0 rings (available)
    // FMT_A is on ring (listable, alreadyRunning) -> included after available
    const ids = picked.map((p) => p.id);
    assert.equal(ids.includes('fmt_weekship'), false);
    assert.equal(ids.includes('fmt_oneclip1'), true);
    assert.equal(ids.includes('fmt_own12345'), true);
    assert.equal(ids.includes('fmt_algoigno'), true);

    // Already-running sorts after available
    assert.equal(picked[picked.length - 1].id, 'fmt_algoigno');
    assert.equal(picked[picked.length - 1].alreadyRunning, true);
    const ownEntry = picked.find((p) => p.id === 'fmt_own12345');
    assert.equal(ownEntry.isOwn, true);
    assert.equal(ownEntry.alreadyRunning, false);

    // Relay usage also makes a format listable
    const withRelay = pickableFormatsForRing(ring, {
      formats: [FMT_C],
      userFormats: [],
      rings: [],
      usage: new Map([['fmt_weekship', 2]]),
    });
    assert.deepEqual(withRelay.map((p) => p.id), ['fmt_weekship']);
  });

  test('adoptTemplateInRing & removeTemplateFromRing enforce permissions, no-op, and keep history', () => {
    const ring = makeRing({ formatIds: ['fmt_algoigno'] });

    // Member adopts
    const adopted = adoptTemplateInRing(ring, 'fmt_oneclip1', { handle: '@bob' });
    assert.equal(adopted.ok, true);
    assert.equal(adopted.changed, true);
    assert.deepEqual(adopted.campaign.formatIds, ['fmt_algoigno', 'fmt_oneclip1']);

    // Re-adopting already-running template is a no-op
    const again = adoptTemplateInRing(adopted.campaign, 'fmt_oneclip1', { handle: '@bob' });
    assert.equal(again.ok, true);
    assert.equal(again.changed, false);
    assert.deepEqual(again.campaign.formatIds, ['fmt_algoigno', 'fmt_oneclip1']);

    // Non-member cannot adopt
    const blockedAdopt = adoptTemplateInRing(ring, 'fmt_oneclip1', { handle: '@stranger' });
    assert.equal(blockedAdopt.ok, false);
    assert.equal(blockedAdopt.reason, 'not-a-member');

    // Non-creator member CANNOT remove
    const blockedRemove = removeTemplateFromRing(adopted.campaign, 'fmt_oneclip1', { handle: '@bob' });
    assert.equal(blockedRemove.ok, false);
    assert.equal(blockedRemove.reason, 'not-creator');
    assert.deepEqual(blockedRemove.campaign.formatIds, ['fmt_algoigno', 'fmt_oneclip1']);

    // Creator CAN remove; past posts & assists stay untouched
    const removed = removeTemplateFromRing(adopted.campaign, 'fmt_oneclip1', { handle: '@alice' });
    assert.equal(removed.ok, true);
    assert.equal(removed.changed, true);
    assert.deepEqual(removed.campaign.formatIds, ['fmt_algoigno']);
    assert.deepEqual(removed.campaign.posts, ring.posts);
    assert.equal(removed.campaign.posts[0].assists.length, 1);

    // Removing a template not running is a no-op
    const noopRemove = removeTemplateFromRing(removed.campaign, 'fmt_weekship', { handle: '@alice' });
    assert.equal(noopRemove.ok, true);
    assert.equal(noopRemove.changed, false);
  });

  test('removeTemplateConfirmCopy names template and states history stays', () => {
    const copy = removeTemplateConfirmCopy('ONE MOMENT, ONE LINE');
    assert.match(copy, /ONE MOMENT, ONE LINE/);
    assert.match(copy, /Past posts and assists stay/i);
  });
});
