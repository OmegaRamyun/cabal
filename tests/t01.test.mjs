import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, makeStore } from '../app.js';
import { createMemoryStore } from '../src/store.mjs';

test('parseHash: empty and root go home', () => {
  assert.deepEqual(parseHash(''), { view: 'home' });
  assert.deepEqual(parseHash('#/'), { view: 'home' });
  assert.deepEqual(parseHash('#'), { view: 'home' });
});

test('parseHash: campaign and composer carry the id', () => {
  assert.deepEqual(parseHash('#/campaign/cmp_abc123'), {
    view: 'campaign',
    campaignId: 'cmp_abc123',
  });
  assert.deepEqual(parseHash('#/composer/cmp_demo_launch'), {
    view: 'composer',
    campaignId: 'cmp_demo_launch',
  });
});

test('parseHash: discover, tools, terms', () => {
  assert.deepEqual(parseHash('#/discover'), { view: 'discover' });
  assert.deepEqual(parseHash('#/tools'), { view: 'tools' });
  assert.deepEqual(parseHash('#/terms'), { view: 'terms' });
});

test('parseHash: intro pages carry the page id', () => {
  assert.deepEqual(parseHash('#/intro'), { view: 'intro', pageId: 'intro' });
  assert.deepEqual(parseHash('#/intro/how'), { view: 'intro', pageId: 'how' });
  assert.deepEqual(parseHash('#/intro/theory'), { view: 'intro', pageId: 'theory' });
  assert.deepEqual(parseHash('#/intro/'), { view: 'intro', pageId: 'intro' });
});

test('parseHash: link intent keeps the whole hash for the decoder', () => {
  const hash = '#c=eyJpZCI6ImNtcF94In0';
  assert.deepEqual(parseHash(hash), { view: 'link', hash });
});

test('parseHash: unknown views fall back home', () => {
  assert.deepEqual(parseHash('#/directory'), { view: 'home' });
  assert.deepEqual(parseHash('#/campaign'), { view: 'home' });
});

test('makeStore: live getters reflect saves (memory backend)', () => {
  const s = makeStore(createMemoryStore());
  assert.equal(s.game, null);
  assert.deepEqual(s.campaigns, []);
  assert.equal(s.me, null);
  s.game = { name: 'Test Game', links: { itch: 'https://x.itch.io/t' }, tags: ['cozy'] };
  assert.equal(s.game.name, 'Test Game');
  s.saveCampaigns([{ id: 'cmp_1' }]);
  assert.equal(s.campaigns.length, 1);
  s.me = { name: 'Dev', handle: '@dev' };
  assert.equal(s.me.handle, '@dev');
  // A second makeStore over the same backend sees the same state.
  const s2 = makeStore(createMemoryStore());
  assert.equal(s2.game, null);
});

test('makeStore: setters write through to the backend', () => {
  const backend = createMemoryStore();
  const s = makeStore(backend);
  s.campaigns = [{ id: 'cmp_9' }];
  assert.deepEqual(backend.loadCampaigns(), [{ id: 'cmp_9' }]);
  s.game = null;
  assert.equal(backend.loadGame(), null);
});
