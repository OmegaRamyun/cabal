// V55 — Shell polish tests: tokens, font manifest, banner deduplication &
// dismissal helpers, scroll reset, and static asset/CSS invariants.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SHELL_TOKENS,
  FONT_MANIFEST,
  DEMO_DISMISS_KEY,
  findDuplicateDemoButton,
  isDismissed,
  markDismissed,
  resetScroll,
} from '../src/shell.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('V55 tokens: 4-surface ramp, 3-4px radii, 600ms fade, ~56px topbar', () => {
  assert.equal(Object.keys(SHELL_TOKENS.surfaces).length, 4);
  assert.equal(SHELL_TOKENS.topbarHeightPx, 56);
  assert.ok(SHELL_TOKENS.radiusPx >= 3 && SHELL_TOKENS.radiusPx <= 4);
  assert.ok(SHELL_TOKENS.radiusSmPx >= 3 && SHELL_TOKENS.radiusSmPx <= 4);
  assert.equal(SHELL_TOKENS.fadeDurationMs, 600);
});

test('V55 font manifest: Cinzel + Inter woff2 files and LICENSEs exist on disk', () => {
  const families = FONT_MANIFEST.map((f) => f.family);
  assert.deepEqual(families, ['Cinzel', 'Inter']);
  for (const entry of FONT_MANIFEST) {
    assert.ok(
      fs.existsSync(path.join(ROOT, entry.license)),
      `missing license: ${entry.license}`,
    );
    for (const file of entry.files) {
      assert.ok(
        fs.existsSync(path.join(ROOT, file)),
        `missing font file: ${file}`,
      );
    }
  }
});

test('V55 vendor: Pico dropped, modern-normalize + LICENSE vendored', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'vendor/pico.min.css')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'vendor/modern-normalize.css')), true);
  assert.equal(fs.existsSync(path.join(ROOT, 'vendor/modern-normalize.LICENSE')), true);
});

test('V55 index.html: loads modern-normalize, no Pico, banners outside sticky header', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /pico\.min\.css/);
  assert.match(html, /vendor\/modern-normalize\.css/);
  const headerMatch = html.match(/<header[\s\S]*?<\/header>/);
  assert.ok(headerMatch, 'expected <header> element');
  assert.doesNotMatch(headerMatch[0], /id="demo-banner"/);
  assert.doesNotMatch(headerMatch[0], /id="update-banner"/);
  assert.match(html, /id="demo-banner"/);
  assert.match(html, /id="update-banner"/);
  assert.match(html, /id="view"/);
  assert.match(html, /id="home-extras"/);
  assert.match(html, /id="campaign-extras"/);
});

test('V55 style.css: Cinzel/Inter @font-face, no lemon #f5c518, no Corporate comment, dead CSS pruned', () => {
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  assert.match(css, /font-family:\s*'Cinzel'/);
  assert.match(css, /font-family:\s*'Inter'/);
  assert.doesNotMatch(css, /#f5c518/i);
  assert.doesNotMatch(css, /Motion identity:\s*Corporate/i);
  assert.doesNotMatch(css, /--pico-/);
  assert.doesNotMatch(css, /\.compose-sticky\b/);
  assert.doesNotMatch(css, /\.ring-progress\b/);
  assert.doesNotMatch(css, /\.member-status\b/);
  assert.match(css, /backdrop-filter:\s*var\(--cabal-blur\)/);
  assert.match(css, /--cabal-duration-fade:\s*600ms/);
});

test('findDuplicateDemoButton: finds Clear demo data only when Start with my own game is also present', () => {
  const clearBtn = { textContent: 'Clear demo data' };
  const freshBtn = { textContent: 'Start with my own game' };
  assert.equal(findDuplicateDemoButton([clearBtn, freshBtn]), clearBtn);
  assert.equal(findDuplicateDemoButton([clearBtn]), null);
  assert.equal(findDuplicateDemoButton([freshBtn]), null);
  assert.equal(findDuplicateDemoButton([]), null);
});

test('isDismissed / markDismissed: round-trips and tolerates broken storage', () => {
  const map = new Map();
  const store = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
  assert.equal(isDismissed(store, DEMO_DISMISS_KEY), false);
  assert.equal(markDismissed(store, DEMO_DISMISS_KEY), true);
  assert.equal(isDismissed(store, DEMO_DISMISS_KEY), true);

  const throwing = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
  };
  assert.equal(isDismissed(throwing, DEMO_DISMISS_KEY), false);
  assert.equal(markDismissed(throwing, DEMO_DISMISS_KEY), false);
});

test('resetScroll: resets window and internal scrollable panes', () => {
  let scrolledTo = null;
  const fakeWin = { scrollTo: (x, y) => { scrolledTo = [x, y]; } };
  const panes = [{ scrollTop: 240 }, { scrollTop: 180 }];
  const fakeDoc = { querySelectorAll: () => panes };
  resetScroll(fakeWin, fakeDoc);
  assert.deepEqual(scrolledTo, [0, 0]);
  assert.deepEqual(panes.map((p) => p.scrollTop), [0, 0]);
});
