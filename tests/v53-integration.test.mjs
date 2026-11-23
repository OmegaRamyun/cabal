// V53 acceptance: unified node view integration.
// - openNodeTarget routes ring nodes to the ring page and format nodes to
//   the template page, from the bare ref (V51 prefixes node.id).
// - nodeViewGraph builds the view input from the same lists the old
//   discovery view used: listable rings only, formats only when a ring
//   runs them (locally or by relay usage), positions keyed by node id,
//   radii shared with the layout (radiusForWeight adapter).
// - Demo data runs formats: the static ToonSouls ring runs fmt_oneclip1
//   and the seeded launch-week ring runs fmt_algoigno, so the live net
//   shows template nodes with real `runs` edges.
// DOM behaviour (net renders, tap-to-panel, create flows): manual check
// note in tasks/V53-integration.md, not a skipped test.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openNodeTarget, nodeViewGraph } from '../app.js';
import { radiusForWeight } from '../src/graph.mjs';
import { demoCampaigns } from '../src/demo.mjs';

const game = (name, tags = []) => ({
  name,
  links: { itch: `https://example.itch.io/${name.toLowerCase()}` },
  tags,
});
const anchor = (author) => ({
  platform: 'x',
  url: 'https://x.com/a/status/1',
  text: 'Out now',
  author,
});
const ring = (id, members, over = {}) => ({
  id,
  title: id,
  game: game('Game-' + id, ['cozy']),
  anchorPost: anchor('@a'),
  members: members.map((h) => ({ handle: h, name: h })),
  posts: [],
  demo: true,
  ...over,
});

describe('openNodeTarget', () => {
  test('ring node opens the ring page by bare ref', () => {
    assert.deepEqual(openNodeTarget({ id: 'ring:cmp_a', kind: 'ring', label: 'A', weight: 2, ref: 'cmp_a' }), {
      view: 'campaign',
      campaignId: 'cmp_a',
    });
  });
  test('format node opens the template page by bare ref', () => {
    assert.deepEqual(openNodeTarget({ id: 'format:fmt_x', kind: 'format', label: 'X', weight: 1, ref: 'fmt_x' }), {
      view: 'format',
      formatId: 'fmt_x',
    });
  });
  test('null, missing ref, and unknown kind go nowhere', () => {
    assert.equal(openNodeTarget(null), null);
    assert.equal(openNodeTarget({ kind: 'ring' }), null);
    assert.equal(openNodeTarget({ kind: 'ring', ref: '' }), null);
    assert.equal(openNodeTarget({ kind: 'mystery', ref: 'x' }), null);
  });
});

describe('nodeViewGraph', () => {
  const formats = [
    { id: 'fmt_algoigno', tagline: 'MY GAME IS GOOD', description: 'd', howTo: 'h', tags: [] },
    { id: 'fmt_unused', tagline: 'UNUSED', description: 'd', howTo: 'h', tags: [] },
  ];
  const rings = [
    ring('cmp_a', ['@a', '@b'], { formatId: 'fmt_algoigno' }),
    ring('cmp_b', ['@a', '@c']),
    ring('cmp_small', ['@a']), // not listable: 1 member
  ];

  test('admits listable rings and only formats a ring runs', () => {
    const { graph } = nodeViewGraph({ rings, formats, usage: null });
    const ids = graph.nodes.map((n) => n.id);
    assert.ok(ids.includes('ring:cmp_a'));
    assert.ok(ids.includes('ring:cmp_b'));
    assert.ok(!ids.includes('ring:cmp_small'));
    assert.ok(ids.includes('format:fmt_algoigno'));
    assert.ok(!ids.includes('format:fmt_unused'));
  });

  test('a relay-used format is admitted even with no local ring running it', () => {
    const usage = new Map([['fmt_unused', { rings: new Set(['pk1']), assists: 0 }]]);
    const { graph } = nodeViewGraph({ rings, formats, usage });
    assert.ok(graph.nodes.some((n) => n.id === 'format:fmt_unused'));
  });

  test('positions are keyed by node id, finite, and in bounds', () => {
    const { graph, positions } = nodeViewGraph({ rings, formats, usage: null }, { width: 800, height: 520 });
    assert.ok(positions instanceof Map);
    // Seam (caught by the V53 smoke): the node view reads positions from
    // graph.positions, so they must be attached to the graph as well.
    assert.ok(graph.positions instanceof Map);
    assert.strictEqual(graph.positions, positions);
    for (const n of graph.nodes) {
      const p = positions.get(n.id);
      assert.ok(p && Number.isFinite(p.x) && Number.isFinite(p.y), `position for ${n.id}`);
      const r = radiusForWeight(n.weight, n.kind);
      assert.ok(p.x >= 0 && p.x <= 800 && p.y >= 0 && p.y <= 520, `in bounds: ${n.id}`);
      assert.ok(p.x >= -r && p.x <= 800 + r);
    }
  });

  test('layout radii agree with the radiusFor adapter (no overlap beyond the 0.9 factor)', () => {
    const { graph, positions } = nodeViewGraph({ rings, formats, usage: null }, { width: 800, height: 520 });
    const nodes = graph.nodes;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = positions.get(nodes[i].id);
        const b = positions.get(nodes[j].id);
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const min = 0.9 * (radiusForWeight(nodes[i].weight, nodes[i].kind) + radiusForWeight(nodes[j].weight, nodes[j].kind));
        assert.ok(d >= min * 0.8, `nodes ${nodes[i].id}/${nodes[j].id} too close: ${d} < ${min}`);
      }
    }
  });

  test('empty input gives an empty graph, never throws', () => {
    const { graph, positions } = nodeViewGraph({}, { width: 800, height: 520 });
    assert.deepEqual(graph.nodes, []);
    assert.deepEqual(graph.edges, []);
    assert.equal(positions.size, 0);
  });
});

describe('demo data runs formats', () => {
  test('static ToonSouls runs fmt_oneclip1 + fmt_algoigno (V60: two templates)', () => {
    const data = JSON.parse(fs.readFileSync(new URL('../data/campaigns.json', import.meta.url), 'utf8'));
    const toon = data.campaigns.find((c) => c.id === 'cmp_toon001');
    assert.deepEqual(toon.formatIds, ['fmt_oneclip1', 'fmt_algoigno']);
  });
  test('seeded launch-week ring runs fmt_algoigno', () => {
    const seeded = demoCampaigns(new Date('2026-11-23T12:00:00Z'));
    const launch = seeded.find((c) => c.id === 'cmp_demo_launch');
    assert.deepEqual(launch.formatIds, ['fmt_algoigno']);
  });
});
