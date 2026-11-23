import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CAMPAIGN_CHECKLIST_ITEMS,
  CHECKLIST_ITEMS,
  campaignChecklistItems,
  checklistKey,
  createCampaignChecklist,
  createChecklistState,
  getCampaignMissingItems,
  isCampaignChecklistReady,
  loadCampaignChecklistState,
  saveCampaignChecklistState,
  toggleCampaignChecklistItem,
} from '../src/checklist.mjs';
import {
  CAMPAIGN_DISCLOSURE,
  CAMPAIGN_JOIN_PLACEHOLDER,
  buildCampaignAnnouncement,
} from '../src/discord.mjs';

const CAMPAIGN_A = Object.freeze({
  id: 'camp-a',
  game: {
    name: 'Butterfly Revolver',
    links: { steam: 'https://store.steampowered.com/app/123', itch: '' },
    tags: ['action'],
  },
  title: 'Launch push',
  anchorPost: {
    platform: 'x',
    url: 'https://x.com/cabal_dev/status/123',
    text: 'Butterfly Revolver is out!',
    author: '@cabal_dev',
  },
  window: 'Nov 23–30',
  members: [
    { name: 'Dev One', handle: '@dev1', status: 'posted', quoteUrl: 'https://x.com/dev1/status/1' },
    { name: 'Dev Two', handle: '@dev2', status: 'pending' },
  ],
  createdAt: '2026-11-22T00:00:00Z',
});

const CAMPAIGN_B = Object.freeze({
  id: 'camp-b',
  game: { name: 'DeadlineFloat', links: {}, tags: ['tool'] },
  title: 'Second push',
  anchorPost: {
    platform: 'x',
    url: 'https://x.com/other/status/999',
    text: 'DeadlineFloat update!',
    author: '@other',
  },
  window: 'Dec 1–7',
  members: [],
  createdAt: '2026-11-22T00:00:00Z',
});

describe('campaign checklist key namespacing', () => {
  it('namespaces keys under cabal.v2.checklist.<campaignId>', () => {
    assert.equal(checklistKey('camp-a'), 'cabal.v2.checklist.camp-a');
    assert.equal(checklistKey('camp-b'), 'cabal.v2.checklist.camp-b');
  });

  it('namespaces per-post keys under cabal.v2.checklist.<campaignId>.<postId>', () => {
    assert.equal(
      checklistKey('camp-a', 'pst-1'),
      'cabal.v2.checklist.camp-a.pst-1'
    );
    assert.notEqual(
      checklistKey('camp-a', 'pst-1'),
      checklistKey('camp-a', 'pst-2')
    );
    assert.notEqual(
      checklistKey('camp-a', 'pst-1'),
      checklistKey('camp-b', 'pst-1')
    );
  });

  it('two campaigns get different keys', () => {
    assert.notEqual(checklistKey('camp-a'), checklistKey('camp-b'));
    assert.notEqual(
      createCampaignChecklist('camp-a').key,
      createCampaignChecklist('camp-b').key
    );
    assert.notEqual(
      createCampaignChecklist('camp-a', 'pst-1').key,
      createCampaignChecklist('camp-a', 'pst-2').key
    );
  });

  it('two campaigns do not share state', () => {
    const a = createCampaignChecklist('camp-a', 'pst-1');
    const b = createCampaignChecklist('camp-b', 'pst-1');

    const aToggled = toggleCampaignChecklistItem(a, 'postLink', true);
    assert.equal(aToggled.state.postLink, true);
    assert.equal(b.state.postLink, false);
    // The original is untouched too.
    assert.equal(a.state.postLink, false);
  });
});

describe('campaign checklist items', () => {
  it('is the 6 standard items plus the 1 post-specific item', () => {
    const items = campaignChecklistItems(CAMPAIGN_A);
    assert.equal(items.length, CHECKLIST_ITEMS.length + 1);
    const labels = items.map((item) => item.label);
    assert.ok(labels.includes("This post's link works"));
    for (const item of CHECKLIST_ITEMS) {
      assert.ok(labels.includes(item.label));
    }
    assert.equal(CAMPAIGN_CHECKLIST_ITEMS.length, 1);
  });

  it('starts all unchecked and becomes ready only when all 7 are checked', () => {
    const checklist = createCampaignChecklist('camp-a', 'pst-1');
    assert.equal(Object.keys(checklist.state).length, 7);
    assert.equal(isCampaignChecklistReady(checklist), false);
    assert.equal(getCampaignMissingItems(checklist).length, 7);

    let next = checklist;
    for (const item of campaignChecklistItems(CAMPAIGN_A)) {
      next = toggleCampaignChecklistItem(next, item.id, true);
    }
    assert.equal(isCampaignChecklistReady(next), true);
    assert.equal(getCampaignMissingItems(next).length, 0);
  });

  it('ignores unknown item ids', () => {
    const checklist = createCampaignChecklist('camp-a');
    const next = toggleCampaignChecklistItem(checklist, 'nope', true);
    assert.equal(isCampaignChecklistReady(next), false);
    assert.equal(next.state.nope, undefined);
  });
});

describe('campaign announcement payload', () => {
  it('contains the game name, anchor URL, and disclosure line', () => {
    const payload = buildCampaignAnnouncement(CAMPAIGN_A);
    const haystack = [
      payload.content,
      ...payload.embeds.map((e) => e.description ?? ''),
      ...payload.embeds.flatMap((e) => (e.fields ?? []).map((f) => f.value)),
      ...payload.embeds.map((e) => e.footer?.text ?? ''),
    ].join('\n');

    assert.ok(haystack.includes('Butterfly Revolver'), 'game name present');
    assert.ok(
      haystack.includes('https://x.com/cabal_dev/status/123'),
      'anchor URL present'
    );
    assert.ok(haystack.includes(CAMPAIGN_DISCLOSURE), 'disclosure line present');
  });

  it('announces the window and the join placeholder', () => {
    const payload = buildCampaignAnnouncement(CAMPAIGN_A);
    assert.ok(payload.content.includes('Nov 23–30'));
    assert.ok(payload.content.includes(CAMPAIGN_JOIN_PLACEHOLDER));
    assert.equal(CAMPAIGN_JOIN_PLACEHOLDER, 'Open the campaign link to join');
  });

  it('is shaped for buildPayload (content + embeds, Discord limits respected)', () => {
    const payload = buildCampaignAnnouncement(CAMPAIGN_A);
    assert.equal(typeof payload.content, 'string');
    assert.ok(Array.isArray(payload.embeds));
    assert.ok(payload.embeds.length >= 1);
    assert.ok(payload.content.length <= 2000);
    assert.equal(payload.embeds[0].title, 'Butterfly Revolver');
  });

  it('handles a bare campaign without throwing', () => {
    const payload = buildCampaignAnnouncement(CAMPAIGN_B);
    assert.ok(payload.content.includes('DeadlineFloat'));
    assert.ok(payload.content.includes('https://x.com/other/status/999'));
    assert.equal(payload.embeds[0].footer?.text, CAMPAIGN_DISCLOSURE);
    const empty = buildCampaignAnnouncement();
    assert.equal(typeof empty.content, 'string');
    assert.ok(Array.isArray(empty.embeds));
    assert.equal(empty.embeds[0].footer?.text, CAMPAIGN_DISCLOSURE);
  });
});

describe('existing checklist exports unchanged', () => {
  it('createChecklistState still covers exactly the 6 standard items', () => {
    const state = createChecklistState();
    assert.deepEqual(Object.keys(state).sort(), [
      'disclosure',
      'oneGame',
      'ownWords',
      'similarityGate',
      'timing',
      'utmLink',
    ]);
  });
});

describe('campaign checklist persistence (V36)', () => {
  const memoryStorage = () => {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
    };
  };

  it('round-trips a per-post checklist through its own key', () => {
    const s = memoryStorage();
    let cl = loadCampaignChecklistState('camp-a', 'pst-1', s);
    assert.equal(isCampaignChecklistReady(cl), false);
    for (const item of campaignChecklistItems()) {
      cl = toggleCampaignChecklistItem(cl, item.id, true);
    }
    saveCampaignChecklistState(cl, s);
    const reloaded = loadCampaignChecklistState('camp-a', 'pst-1', s);
    assert.equal(isCampaignChecklistReady(reloaded), true);
    assert.equal(reloaded.key, 'cabal.v2.checklist.camp-a.pst-1');
    assert.equal(reloaded.campaignId, 'camp-a');
    assert.equal(reloaded.postId, 'pst-1');
  });

  it('falls back to fresh state on corrupt JSON or missing storage', () => {
    const s = memoryStorage();
    s.setItem('cabal.v2.checklist.camp-a.pst-1', '{not json');
    assert.equal(
      isCampaignChecklistReady(
        loadCampaignChecklistState('camp-a', 'pst-1', s)
      ),
      false
    );
    assert.equal(
      isCampaignChecklistReady(
        loadCampaignChecklistState('camp-a', 'pst-1', null)
      ),
      false
    );
    assert.doesNotThrow(() => saveCampaignChecklistState(null, s));
    assert.doesNotThrow(() =>
      saveCampaignChecklistState(createCampaignChecklist('camp-a', 'pst-1'), null)
    );
  });
});
