import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, loadModules, MODULE_MAP, wireSimilarityGate } from '../app.js';

test('register then get returns the module', () => {
  const r = createRegistry();
  const m = { mount() {} };
  r.register('a', m);
  assert.equal(r.get('a'), m);
  assert.ok(r.has('a'));
  assert.deepEqual(r.names(), ['a']);
});

test('get of unknown name is undefined', () => {
  assert.equal(createRegistry().get('nope'), undefined);
});

test('duplicate register throws and keeps the original', () => {
  const r = createRegistry();
  const first = {};
  r.register('a', first);
  assert.throws(() => r.register('a', {}), /already registered/);
  assert.equal(r.get('a'), first);
});

test('invalid names are rejected', () => {
  const r = createRegistry();
  assert.throws(() => r.register('', {}), TypeError);
  assert.throws(() => r.register(null, {}), TypeError);
});

test('registries are independent', () => {
  const a = createRegistry(), b = createRegistry();
  a.register('x', {});
  assert.equal(b.get('x'), undefined);
});

test('a broken module is logged and the rest still mount', async () => {
  const r = createRegistry();
  const mounted = [];
  const map = [
    { section: 's1', name: 'good1' },
    { section: 's2', name: 'broken' },
    { section: 's3', name: 'good2' },
  ];
  const importer = async (n) => {
    if (n === 'broken') throw new Error('boom');
    return { mount: (node) => mounted.push([n, node]) };
  };
  const origErr = console.error;
  console.error = () => {};
  let res;
  try {
    res = await loadModules(r, map, (id) => ({ id }), importer);
  } finally {
    console.error = origErr;
  }
  assert.deepEqual(res.map((x) => x.ok), [true, false, true]);
  assert.deepEqual(mounted.map((m) => m[0]), ['good1', 'good2']);
  assert.deepEqual(mounted[0][1], { id: 's1' });
  assert.ok(r.has('good1') && r.has('good2') && !r.has('broken'));
});

test('module map covers the six sections (similarity lives in the composer now)', () => {
  assert.deepEqual(MODULE_MAP.map((m) => m.section),
    ['composer', 'directory', 'discord', 'kickstarter', 'steam', 'checklist']);
});

test('wireSimilarityGate wires the gate into each composer textarea', async () => {
  const mkTa = (label, value) => {
    const listeners = {};
    return {
      value,
      listeners,
      getAttribute: (k) => (k === 'aria-label' ? label : null),
      addEventListener: (type, fn) => {
        (listeners[type] ??= []).push(fn);
      },
    };
  };
  const tas = [mkTa('X post text', 'hello world'), mkTa('Bluesky post text', ''), mkTa('Threads post text', 'hello world')];
  const composer = { querySelectorAll: () => tas };
  const doc = { querySelector: (sel) => (sel === '#composer' ? composer : null) };
  const mounts = [];
  const importer = async () => ({
    mount: (root, opts) => {
      const handle = {
        updates: 0,
        update() {
          this.updates++;
        },
        destroy() {},
      };
      mounts.push({ root, opts, handle });
      return handle;
    },
  });
  const handles = await wireSimilarityGate(doc, importer);
  assert.equal(handles.length, 3);
  assert.equal(mounts.length, 3);
  assert.equal(mounts[0].root, composer);
  assert.equal(mounts[0].opts.textarea, tas[0]);
  // X's drafts = the other textareas' contents (empty Bluesky skipped),
  // labelled by platform so the meter can name the match.
  assert.deepEqual(mounts[0].opts.getDrafts(), [{ author: 'Threads', text: 'hello world' }]);
  // Input on one textarea refreshes every gate, not just its own — otherwise
  // a gate goes stale when another textarea changes.
  tas[0].listeners.input.forEach((fn) => fn());
  assert.deepEqual(
    mounts.map((m) => m.handle.updates),
    [1, 1, 1]
  );
});

test('wireSimilarityGate is a no-op without a composer', async () => {
  const doc = { querySelector: () => null };
  const importer = async () => { throw new Error('must not import'); };
  assert.deepEqual(await wireSimilarityGate(doc, importer), []);
});
