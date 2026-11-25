// V60 acceptance tests — multi-template integration (coordinator lane).
// Covers: preselected creation stores formatIds (no legacy formatId key),
// a two-template fixture ring, the graph gives that ring two `runs` edges,
// postersForFormat (the template is the node of everybody who posted it),
// and the format page mount rendering the Posted-by roster.
// (V74: the old "static demo data" block read ToonSouls from
// data/campaigns.json; the static list is empty now, so the two-template
// case uses the inline ringWithPosts fixture below.)
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createCampaign } from '../src/campaign.mjs';
import {
  postersForFormat,
  mount as mountFormat,
} from '../src/campaign-formats.mjs';
import { buildGraph } from '../src/graph.mjs';
import { createMemoryStore } from '../src/store.mjs';

const FMT_ALGO = {
  id: 'fmt_algoigno',
  tagline: 'MY GAME IS GOOD THE ALGORITHM JUST IGNORES ME',
  description: 'Deadpan complaint format.',
  howTo: 'Say one real thing about your game and disclose your ring.',
  examples: [],
  tags: ['meme'],
  demo: true,
};
const FMT_CLIP = {
  id: 'fmt_oneclip1',
  tagline: 'ONE MOMENT, ONE LINE',
  description: 'Short gameplay clip with one line.',
  howTo: 'Post one clip and disclose your ring.',
  examples: [],
  tags: ['clip'],
  demo: true,
};

const game = { name: 'Brass Orchard', links: { itch: 'https://brass.itch.io/orchard' }, tags: ['cozy'] };
const anchorPost = { platform: 'x', url: 'https://x.com/brass/status/1', text: 'Launch!', author: '@brassdev' };
const creator = { name: 'Brass Dev', handle: '@brassdev' };

const ringWithPosts = (overrides = {}) => ({
  id: 'cmp_toon001',
  title: 'ToonSouls ring',
  game: { name: 'ToonSouls', links: { itch: 'https://example-dev.itch.io/toon-souls' }, tags: ['souls-like'] },
  members: [
    { name: 'Wren Halloway', handle: '@toonsouls' },
    { name: 'Moss Finch', handle: '@mossfinch' },
  ],
  formatIds: ['fmt_oneclip1', 'fmt_algoigno'],
  posts: [
    {
      id: 'pst_1',
      author: '@toonsouls',
      platform: 'x',
      url: 'https://x.com/toonsouls/status/1',
      text: 'ToonSouls is out now.',
      assists: [{ handle: '@mossfinch', status: 'contributed' }],
    },
    {
      id: 'pst_2',
      author: '@mossfinch',
      platform: 'x',
      url: 'https://x.com/mossfinch/status/2',
      text: 'Dying cute has never felt this good.',
      assists: [],
    },
  ],
  createdAt: '2026-11-22T09:00:00Z',
  ...overrides,
});

describe('V60 preselected creation stores formatIds', () => {
  test('createCampaign with formatIds input keeps them and drops legacy formatId', () => {
    const c = createCampaign({
      game, title: 'Ring', anchorPost, creator, window: null,
      formatIds: ['fmt_algoigno'],
    });
    assert.deepEqual(c.formatIds, ['fmt_algoigno']);
    assert.equal('formatId' in c, false);
  });

  test('createCampaign with legacy formatId input migrates it to formatIds', () => {
    const c = createCampaign({
      game, title: 'Ring', anchorPost, creator, window: null,
      formatId: 'fmt_algoigno',
    });
    assert.deepEqual(c.formatIds, ['fmt_algoigno']);
    assert.equal('formatId' in c, false);
  });
});

describe('V60 fixture ring runs two templates', () => {
  test('inline two-template ring has formatIds oneclip + algoigno', () => {
    assert.deepEqual(ringWithPosts().formatIds, ['fmt_oneclip1', 'fmt_algoigno']);
    assert.equal('formatId' in ringWithPosts(), false);
  });

  test('graph over the fixture ring gives it two runs edges', () => {
    const formatsData = JSON.parse(readFileSync(new URL('../data/formats.json', import.meta.url), 'utf8'));
    const g = buildGraph({
      rings: [ringWithPosts()],
      formats: formatsData.formats,
      usage: new Map(),
    });
    const node = g.nodes.find((n) => n.kind === 'ring' && n.ref === 'cmp_toon001');
    assert.ok(node, 'fixture ring node exists');
    const runs = g.edges.filter((e) => e.kind === 'runs' && e.from === node.id);
    assert.equal(runs.length, 2);
    assert.deepEqual(
      runs.map((e) => e.to).sort(),
      ['format:fmt_algoigno', 'format:fmt_oneclip1'],
    );
  });
});

describe('V60 postersForFormat — the template is its posters', () => {
  const legacyRing = {
    id: 'cmp_leg0001',
    title: 'Benbo ring',
    game: { name: 'BenboQuest', links: { itch: 'https://benbo.itch.io/quest' } },
    members: [{ name: 'Benbo', handle: '@benbo' }],
    formatId: 'fmt_algoigno',
    posts: [
      {
        id: 'pst_9',
        author: '@benbo',
        platform: 'x',
        url: 'https://x.com/benbo/status/9',
        text: 'My game is good.',
        assists: [{ handle: '@toonsouls', status: 'contributed' }],
      },
    ],
    createdAt: '2026-11-22T09:00:00Z',
  };
  const emptyRing = {
    id: 'cmp_empt001',
    title: 'Quiet ring',
    game: { name: 'Quiet', links: { itch: 'https://quiet.itch.io/q' } },
    members: [{ name: 'Quinn', handle: '@quinn' }],
    formatIds: ['fmt_algoigno'],
    posts: [],
    createdAt: '2026-11-22T09:00:00Z',
  };

  test('collects authors + assists across rings, deduped, with ring attribution', () => {
    const posters = postersForFormat('fmt_algoigno', [ringWithPosts(), legacyRing, emptyRing]);
    assert.deepEqual(
      posters.map((p) => p.handle),
      ['@toonsouls', '@mossfinch', '@benbo'],
    );
    assert.equal(posters[0].name, 'Wren Halloway');
    assert.equal(posters[1].name, 'Moss Finch');
    assert.equal(posters[2].name, 'Benbo');
    // @toonsouls posted in both rings (author in ToonSouls, assist in Benbo ring).
    assert.deepEqual(
      posters[0].rings.map((r) => r.ringId),
      ['cmp_toon001', 'cmp_leg0001'],
    );
    assert.deepEqual(posters[1].rings.map((r) => r.ringId), ['cmp_toon001']);
    assert.deepEqual(posters[2].rings.map((r) => r.ringId), ['cmp_leg0001']);
  });

  test('legacy formatId rings count; rings with no posts contribute nothing', () => {
    const posters = postersForFormat('fmt_algoigno', [legacyRing, emptyRing]);
    assert.deepEqual(posters.map((p) => p.handle), ['@benbo', '@toonsouls']);
    assert.ok(!posters.some((p) => p.handle === '@quinn'));
  });

  test('anchorPost-only legacy ring counts its author', () => {
    const anchorOnly = {
      id: 'cmp_anch001',
      game: { name: 'Anch', links: { itch: 'https://anch.itch.io/a' } },
      members: [{ name: 'Ann', handle: '@ann' }],
      formatIds: ['fmt_algoigno'],
      anchorPost: { platform: 'x', url: 'https://x.com/ann/status/1', text: 'Hi.', author: '@ann' },
      createdAt: '2026-11-22T09:00:00Z',
    };
    const posters = postersForFormat('fmt_algoigno', [anchorOnly]);
    assert.deepEqual(posters.map((p) => p.handle), ['@ann']);
  });

  test('invalid format id and empty input give []', () => {
    assert.deepEqual(postersForFormat('nope', [ringWithPosts()]), []);
    assert.deepEqual(postersForFormat('fmt_algoigno', []), []);
    assert.deepEqual(postersForFormat('fmt_algoigno', null), []);
  });

  test('name falls back to the handle when no member record matches', () => {
    const ring = ringWithPosts({
      posts: [
        {
          id: 'pst_x',
          author: '@stranger',
          platform: 'x',
          url: 'https://x.com/stranger/status/1',
          text: 'Hello.',
          assists: [],
        },
      ],
    });
    const posters = postersForFormat('fmt_algoigno', [ring]);
    assert.equal(posters[0].handle, '@stranger');
    assert.equal(posters[0].name, '@stranger');
  });
});

describe('V60 format page mount renders the Posted-by roster', () => {
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

  test('mount lists the posters and their rings', () => {
    const body = new FakeEl('body');
    const root = new FakeEl('div');
    root.ownerDocument = {
      body,
      createElement: (t) => new FakeEl(t),
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    const store = createMemoryStore();
    mountFormat(root, {
      format: FMT_ALGO,
      rings: [ringWithPosts()],
      store,
    });
    const roster = root.all((n) => n.className === 'format-posters')[0];
    assert.ok(roster, 'Posted-by roster exists');
    assert.match(roster.textContent, /Wren Halloway/);
    assert.match(roster.textContent, /Moss Finch/);
    assert.match(roster.textContent, /ToonSouls ring/);
    const headings = root.all((n) => n.className === 'section-eyebrow').map((n) => n.textContent);
    assert.ok(headings.includes('Posted by'));
  });

  test('mount shows the empty state when nobody has posted yet', () => {
    const body = new FakeEl('body');
    const root = new FakeEl('div');
    root.ownerDocument = {
      body,
      createElement: (t) => new FakeEl(t),
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    mountFormat(root, {
      format: FMT_CLIP,
      rings: [ringWithPosts({ posts: [] })],
      store: createMemoryStore(),
    });
    const roster = root.all((n) => n.className === 'format-posters')[0];
    assert.ok(roster, 'Posted-by roster exists');
    assert.match(roster.textContent, /No posts under this template yet/);
  });
});
