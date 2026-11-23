// V29 — Auto-updater: version compare + draft guard + refresh state.
// Pure functions only; the mounted banner + polling are covered by the
// Playwright check-updater script.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVersion,
  isNewer,
  hasUnsentDraft,
  refreshAction,
  fetchVersion,
} from '../src/updater.mjs';

test('parseVersion: valid object, trims version, keeps updatedAt', () => {
  assert.deepEqual(parseVersion({ version: '0.2.1', updatedAt: '2026-11-23T05:45:45Z' }), {
    version: '0.2.1',
    updatedAt: '2026-11-23T05:45:45Z',
  });
  assert.deepEqual(parseVersion({ version: ' 0.2.1 ' }), { version: '0.2.1', updatedAt: '' });
  assert.deepEqual(parseVersion({ version: '1.0', extra: true }), { version: '1.0', updatedAt: '' });
});

test('parseVersion: malformed input is null, never a throw', () => {
  for (const bad of [null, undefined, '', 42, [], '0.2.1', {}, { version: '' }, { version: '   ' }, { version: 3 }, { updatedAt: 'x' }]) {
    assert.equal(parseVersion(bad), null, JSON.stringify(bad));
  }
});

test('isNewer: differs -> true, same -> false, unknown side -> false', () => {
  assert.equal(isNewer({ version: '0.2.2' }, { version: '0.2.1' }), true);
  assert.equal(isNewer({ version: '0.2.1' }, { version: '0.2.1' }), false);
  assert.equal(isNewer(null, { version: '0.2.1' }), false);
  assert.equal(isNewer({ version: '0.2.2' }, null), false);
  assert.equal(isNewer(null, null), false);
});

const stubDoc = (values) => ({
  querySelectorAll: () => values.map((value) => ({ value })),
});

test('hasUnsentDraft: text counts, empty/whitespace does not, no doc does not', () => {
  assert.equal(hasUnsentDraft(stubDoc(['hello'])), true);
  assert.equal(hasUnsentDraft(stubDoc(['', '  draft  '])), true);
  assert.equal(hasUnsentDraft(stubDoc(['', '   ', '\n'])), false);
  assert.equal(hasUnsentDraft(stubDoc([])), false);
  assert.equal(hasUnsentDraft({}), false);
  assert.equal(hasUnsentDraft(null), false);
  assert.equal(hasUnsentDraft(undefined), false);
});

test('refreshAction: no draft reloads at once; draft asks once, then reloads', () => {
  assert.deepEqual(refreshAction({ hasDraft: false, confirming: false }), {
    reload: true,
    confirming: false,
    label: 'Refresh',
  });
  assert.deepEqual(refreshAction({ hasDraft: true, confirming: false }), {
    reload: false,
    confirming: true,
    label: 'Discard draft & refresh',
  });
  assert.deepEqual(refreshAction({ hasDraft: true, confirming: true }), {
    reload: true,
    confirming: false,
    label: 'Refresh',
  });
  // Draft cleared after the ask: second tap still reloads (state is the ask).
  assert.deepEqual(refreshAction({ hasDraft: false, confirming: true }), {
    reload: true,
    confirming: false,
    label: 'Refresh',
  });
});

test('fetchVersion: parses with no-store, never throws on bad fetch/json', async () => {
  const ok = async (url, opts) => {
    assert.equal(url, 'version.json');
    assert.equal(opts.cache, 'no-store');
    return { json: async () => ({ version: '0.3.0' }) };
  };
  assert.deepEqual(await fetchVersion(ok), { version: '0.3.0', updatedAt: '' });

  const badJson = async () => ({ json: async () => ({ nope: true }) });
  assert.equal(await fetchVersion(badJson), null);

  const throwing = async () => {
    throw new Error('offline');
  };
  assert.equal(await fetchVersion(throwing), null);

  const noJson = async () => ({});
  assert.equal(await fetchVersion(noJson), null);
});
