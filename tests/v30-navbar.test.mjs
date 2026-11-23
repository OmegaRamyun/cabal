import test from 'node:test';
import assert from 'node:assert/strict';
import { navItemForView } from '../app.js';

test('navItemForView: home is the default', () => {
  assert.equal(navItemForView('home'), 'home');
  assert.equal(navItemForView('campaign'), 'home');
  assert.equal(navItemForView('composer'), 'home');
  assert.equal(navItemForView('link'), 'home');
  assert.equal(navItemForView(''), 'home');
  assert.equal(navItemForView('nope'), 'home');
});

test('navItemForView: discover stands alone', () => {
  assert.equal(navItemForView('discover'), 'discover');
});

test('navItemForView: tools and terms share the gear', () => {
  assert.equal(navItemForView('tools'), 'tools');
  assert.equal(navItemForView('terms'), 'tools');
});
