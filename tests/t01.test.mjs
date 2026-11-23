import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, loadModules, MODULE_MAP } from '../app.js';

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

test('module map covers the seven sections', () => {
  assert.deepEqual(MODULE_MAP.map((m) => m.section),
    ['composer', 'similarity', 'directory', 'discord', 'kickstarter', 'steam', 'checklist']);
});
