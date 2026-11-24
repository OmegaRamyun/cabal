// V57 acceptance tests: nav routing/wayfinding, dense row builders, ring page
// tab/header helpers, and copy/lede standardization.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { navItemForView } from '../app.js';
import {
  LUCIDE_ATTRIBUTION,
  NAV_ICONS,
  NAV_TABS,
  DEMO_BANNER_SHORT,
  navItemForRoute,
  sectionForRoute,
  backTargetForRoute,
} from '../src/nav.mjs';
import {
  HOME_COPY,
  STORE_KEYS,
  buildRingRow,
  sortRingsByActivity,
  isPrimerDismissed,
  dismissPrimer,
} from '../src/home.mjs';
import {
  RING_TABS,
  normalizeRingTab,
  memberStackSummary,
  postMetaLine,
} from '../src/campaign-page.mjs';
import { CREATE_TEMPLATE_COPY } from '../src/campaign-formats.mjs';

const memStorage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
  };
};

describe('V57 nav routing & wayfinding', () => {
  test('navItemForRoute & navItemForView light the correct tab based on origin section', () => {
    assert.equal(navItemForRoute('home'), 'home');
    assert.equal(navItemForRoute('campaigns'), 'discover');
    assert.equal(navItemForRoute('campaigns-new'), 'discover');
    assert.equal(navItemForRoute('format'), 'discover');
    assert.equal(navItemForRoute('tools'), 'tools');
    assert.equal(navItemForRoute('terms'), 'tools');

    // Ring routes default to home when reached from Home (or no origin)
    assert.equal(navItemForRoute('campaign'), 'home');
    assert.equal(navItemForView('campaign'), 'home');
    assert.equal(navItemForRoute('campaign', { fromSection: 'home' }), 'home');

    // Ring & composer routes reached from Network/Campaigns light the Network tab
    assert.equal(navItemForRoute('campaign', { fromSection: 'discover' }), 'discover');
    assert.equal(navItemForView('campaign', { fromSection: 'discover' }), 'discover');
    assert.equal(navItemForRoute('composer', { fromSection: 'discover' }), 'discover');
  });

  test('sectionForRoute tracks primary section across detail navigations', () => {
    assert.equal(sectionForRoute('campaigns', 'home'), 'discover');
    assert.equal(sectionForRoute('campaign', 'discover'), 'discover');
    assert.equal(sectionForRoute('home', 'discover'), 'home');
    assert.equal(sectionForRoute('campaign', 'home'), 'home');
    assert.equal(sectionForRoute('format', 'home'), 'discover');
  });

  test('backTargetForRoute returns back chevron target on detail routes, null on tabs', () => {
    assert.equal(backTargetForRoute({ view: 'home' }), null);
    assert.equal(backTargetForRoute({ view: 'campaigns' }), null);
    assert.equal(backTargetForRoute({ view: 'tools' }), null);

    const fromHome = backTargetForRoute(
      { view: 'campaign', campaignId: 'cmp_1' },
      { fromSection: 'home', title: 'Launch week' },
    );
    assert.deepEqual(fromHome, { href: '#/', label: 'Home', title: 'Launch week' });

    const fromNet = backTargetForRoute(
      { view: 'campaign', campaignId: 'cmp_1' },
      { fromSection: 'discover', title: 'ToonSouls' },
    );
    assert.deepEqual(fromNet, { href: '#/campaigns', label: 'Network', title: 'ToonSouls' });

    const fmt = backTargetForRoute({ view: 'format', formatId: 'fmt_1' }, { title: 'One clip' });
    assert.deepEqual(fmt, { href: '#/campaigns', label: 'Network', title: 'One clip' });

    const newTpl = backTargetForRoute({ view: 'campaigns-new' });
    assert.equal(newTpl.href, '#/campaigns');
    assert.equal(newTpl.label, 'Network');
  });

  test('Lucide inline SVGs and tabs are present with ISC attribution', () => {
    assert.match(LUCIDE_ATTRIBUTION, /Lucide/i);
    assert.match(LUCIDE_ATTRIBUTION, /ISC/);
    assert.equal(NAV_TABS.length, 3);
    assert.deepEqual(NAV_TABS.map((t) => t.label), ['Home', 'Network', 'Tools']);
    for (const tab of NAV_TABS) {
      assert.ok(NAV_ICONS[tab.icon].startsWith('<svg '), `${tab.icon} is inline svg`);
    }
    assert.ok(NAV_ICONS.chevronLeft.startsWith('<svg '));
    assert.ok(NAV_ICONS.share.startsWith('<svg '));
  });
});

describe('V57 home density & primer helpers', () => {
  const now = new Date('2026-11-23T18:00:00Z');
  const ringA = {
    id: 'cmp_a',
    title: 'Alpha ring',
    demo: true,
    members: [{ name: 'A', handle: '@a' }, { name: 'B', handle: '@b' }],
    posts: [
      { id: 'pst_1', author: '@a', platform: 'x', createdAt: '2026-11-23T16:00:00Z', assists: [] },
    ],
    createdAt: '2026-11-20T00:00:00Z',
  };
  const ringB = {
    id: 'cmp_b',
    title: 'Beta ring',
    members: [{ name: 'B', handle: '@b' }],
    posts: [
      { id: 'pst_2', author: '@b', platform: 'reddit', createdAt: '2026-11-23T17:30:00Z', assists: [] },
    ],
    createdAt: '2026-11-21T00:00:00Z',
  };

  test('buildRingRow builds dense row metadata and status pill', () => {
    const row = buildRingRow(ringA, { me: { handle: '@b' }, now });
    assert.equal(row.id, 'cmp_a');
    assert.equal(row.title, 'Alpha ring');
    assert.equal(row.memberCount, 2);
    assert.equal(row.memberLabel, '2 devs');
    assert.equal(row.demo, true);
    assert.equal(row.status, '1 to assist');
    assert.equal(row.statusKind, 'turn');

    const ownRow = buildRingRow(ringB, { me: { handle: '@b' }, now });
    assert.equal(ownRow.memberLabel, '1 dev');
    assert.equal(ownRow.status, 'Active');
    assert.equal(ownRow.statusKind, 'active');
  });

  test('sortRingsByActivity sorts newest activity first', () => {
    const sorted = sortRingsByActivity([ringA, ringB]);
    assert.deepEqual(sorted.map((c) => c.id), ['cmp_b', 'cmp_a']);
  });

  test('primer dismissal persists via localStorage key', () => {
    const st = memStorage();
    assert.equal(STORE_KEYS.primerDismissed, 'cabal.v2.primerDismissed');
    assert.equal(isPrimerDismissed(st), false);
    dismissPrimer(st);
    assert.equal(isPrimerDismissed(st), true);
  });
});

describe('V57 ring page & copy helpers', () => {
  test('normalizeRingTab constrains to feed / members / sync', () => {
    assert.deepEqual(RING_TABS, ['feed', 'members', 'sync']);
    assert.equal(normalizeRingTab('feed'), 'feed');
    assert.equal(normalizeRingTab('members'), 'members');
    assert.equal(normalizeRingTab('sync'), 'sync');
    assert.equal(normalizeRingTab('unknown'), 'feed');
    assert.equal(normalizeRingTab(undefined), 'feed');
  });

  test('memberStackSummary caps visible avatars and computes overflow', () => {
    const members = [1, 2, 3, 4, 5, 6].map((n) => ({ handle: `@dev${n}` }));
    const s = memberStackSummary(members, 4);
    assert.equal(s.visible.length, 4);
    assert.equal(s.overflow, 2);
    assert.equal(s.total, 6);
  });

  test('postMetaLine formats compact second-line metadata', () => {
    const now = new Date('2026-11-23T18:00:00Z');
    const line = postMetaLine(
      { platform: 'x', kind: 'announcement', createdAt: '2026-11-22T18:00:00Z' },
      now,
    );
    assert.equal(line, 'X · announcement · 1d');

    const otherLine = postMetaLine(
      { platform: 'reddit', kind: 'other', createdAt: '2026-11-23T16:00:00Z' },
      now,
    );
    assert.equal(otherLine, 'Reddit · 2h');
  });

  test('standardized copy uses Ring / Template / Network and short ledes', () => {
    assert.ok(DEMO_BANNER_SHORT.length < 80);
    assert.match(HOME_COPY.ringsLede, /ring/i);
    // V69: the create-format lede is the verbatim subline, no Network mention.
    assert.match(CREATE_TEMPLATE_COPY.lede, /any ring can try/);
    assert.ok(CREATE_TEMPLATE_COPY.lede.length < 140);
  });
});
