import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLATFORMS,
  meHandle,
  comparisonTexts,
  scoreDraft,
  gateMessage,
  intentUrl,
  confirmPosted,
  mount,
} from '../src/quote-composer.mjs';

const ANCHOR =
  'I spent about ten hours on this roguelike deckbuilder and the thing that hooked me was the way every relic changes how you sequence your turns, so a run that looks doomed at floor three can suddenly snowball when the right pair of cards shows up together.';
const NEAR_DUP = ANCHOR.replace('hooked', 'grabbed');
const OWN_WORDS =
  'Great deckbuilder with a roguelike loop. What kept me playing was relic synergy: finding two cards that combo late in a bad run felt amazing, and I lost an entire weekend to it.';
const UNRELATED = 'Our community garden meets on Saturdays to swap seedlings, share compost tips and plan the autumn harvest supper.';

const ANCHOR_URL = 'https://x.com/devgame/status/1234567890';

function campaign(overrides = {}) {
  return {
    id: 'cmp_test1234',
    game: { name: 'Deckbuilder', links: { steam: 'https://store.steampowered.com/app/1' }, tags: ['roguelike'] },
    title: 'Demo launch',
    anchorPost: { platform: 'x', url: ANCHOR_URL, text: ANCHOR, author: '@devgame' },
    window: null,
    members: [
      { name: 'Me', handle: '@me', status: 'pending' },
      { name: 'Sam', handle: '@sam', status: 'pending', draft: UNRELATED },
    ],
    createdAt: '2026-11-22T00:00:00.000Z',
    ...overrides,
  };
}

// --- Minimal fake DOM: enough for mount() (createElement/append/
// addEventListener/setAttribute/dataset/style/remove). No jsdom, no deps. ---
class FakeEl {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.parent = null;
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.listeners = {};
    this._text = '';
    this.value = '';
  }
  get textContent() {
    return this._text;
  }
  set textContent(v) {
    this._text = String(v ?? '');
  }
  append(...kids) {
    for (const k of kids) {
      k.parent = this;
      this.children.push(k);
    }
    return this;
  }
  appendChild(k) {
    return this.append(k);
  }
  remove() {
    if (!this.parent) return;
    const i = this.parent.children.indexOf(this);
    if (i >= 0) this.parent.children.splice(i, 1);
    this.parent = null;
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
  }
  getAttribute(k) {
    return k in this.attributes ? this.attributes[k] : null;
  }
  removeAttribute(k) {
    delete this.attributes[k];
    if (k === 'href') delete this.href;
  }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
  }
  dispatch(type) {
    for (const fn of this.listeners[type] ?? []) fn({ type, target: this });
  }
  find(pred) {
    if (pred(this)) return this;
    for (const c of this.children) {
      const hit = c.find(pred);
      if (hit) return hit;
    }
    return null;
  }
}

class FakeDoc {
  createElement(tag) {
    return new FakeEl(tag, this);
  }
}

function fakeRoot() {
  const root = new FakeEl('div', new FakeDoc());
  root.ownerDocument = root.ownerDocument;
  return root;
}

test('comparisonTexts: anchor first, other members drafts after, me excluded', () => {
  const texts = comparisonTexts(campaign(), { handle: '@me' });
  assert.equal(texts[0], ANCHOR);
  assert.ok(texts.includes(UNRELATED));
  assert.equal(texts.length, 2);
  // A member draft of mine never scores against me.
  const mine = campaign();
  mine.members[0].draft = ANCHOR;
  assert.deepEqual(comparisonTexts(mine, '@me'), [ANCHOR, UNRELATED]);
  // No anchor, no drafts -> empty list, gate still safe.
  assert.deepEqual(comparisonTexts({ members: [] }, null), []);
});

test('meHandle accepts a handle string or a { handle } object', () => {
  assert.equal(meHandle('@me'), '@me');
  assert.equal(meHandle({ handle: '@me' }), '@me');
  assert.equal(meHandle(null), '');
});

test('gate wiring: near-dup of the anchor warns', () => {
  const r = scoreDraft(NEAR_DUP, campaign(), { handle: '@me' });
  assert.equal(r.verdict, 'warn');
  assert.ok(r.score >= 0.8, `score ${r.score}`);
});

test('gate wiring: own words pass', () => {
  const r = scoreDraft(OWN_WORDS, campaign(), { handle: '@me' });
  assert.equal(r.verdict, 'pass');
  assert.ok(r.score < 0.8, `score ${r.score}`);
});

test('gate wiring: empty draft passes, no crash on missing campaign', () => {
  assert.equal(scoreDraft('', campaign(), null).verdict, 'pass');
  assert.equal(scoreDraft(OWN_WORDS, undefined, null).verdict, 'pass');
});

test('gateMessage: password-meter wording, advisory only', () => {
  assert.equal(gateMessage({ verdict: 'warn', score: 0.95 }).text, 'This post is very similar! Rewrite in your own words?');
  assert.equal(gateMessage({ verdict: 'pass', score: 0.1 }).text, 'Looks like your own words.');
  assert.match(gateMessage({ verdict: 'review', score: 0.72 }).text, /Similarity 72%/);
});

test('intent URL contains the anchor URL (X and Bluesky)', () => {
  const draft = 'This deckbuilder ate my weekend, the relic combos are unreal';
  const x = intentUrl('x', draft, campaign());
  assert.ok(x.startsWith('https://x.com/intent/post?'), x);
  assert.ok(x.includes(`url=${encodeURIComponent(ANCHOR_URL)}`), x);
  assert.ok(x.includes(`text=${encodeURIComponent(draft)}`), x);
  const bsky = intentUrl('bluesky', draft, campaign());
  assert.ok(bsky.startsWith('https://bsky.app/intent/compose?'), bsky);
  assert.ok(bsky.includes(encodeURIComponent(ANCHOR_URL)), bsky);
  assert.ok(bsky.includes(encodeURIComponent(draft)), bsky);
});

test('intentUrl throws over the platform limit (no silent truncation)', () => {
  assert.throws(() => intentUrl('x', 'a'.repeat(300), campaign()), /Over the X limit/);
});

test('confirmPosted: URL passed through, blank allowed, cancel does not call', () => {
  const seen = [];
  const onPosted = (url) => seen.push(url);
  assert.deepEqual(confirmPosted({ prompt: () => 'https://x.com/me/status/99', onPosted }), {
    posted: true,
    quoteUrl: 'https://x.com/me/status/99',
  });
  assert.deepEqual(seen, ['https://x.com/me/status/99']);
  // URL is optional: blank still reports posted, with an empty quote URL.
  assert.deepEqual(confirmPosted({ prompt: () => '  ', onPosted }), { posted: true, quoteUrl: '' });
  assert.deepEqual(seen, ['https://x.com/me/status/99', '']);
  // Cancel: onPosted is NOT called.
  assert.deepEqual(confirmPosted({ prompt: () => null, onPosted }), { posted: false, quoteUrl: null });
  assert.deepEqual(seen, ['https://x.com/me/status/99', '']);
});

test('mount: anchor attached, textarea starts empty, gate live, links stay enabled at warn', () => {
  const root = fakeRoot();
  const posted = [];
  const h = mount(root, {
    campaign: campaign(),
    me: { handle: '@me' },
    onPosted: (url) => posted.push(url),
    prompt: () => 'https://x.com/me/status/7',
  });
  assert.equal(h.textarea.value, '');
  const anchorBox = h.anchorBox;
  const author = anchorBox.find((el) => el.className === 'quote-anchor-author');
  const text = anchorBox.find((el) => el.className === 'quote-anchor-text');
  const link = anchorBox.find((el) => el.className === 'quote-anchor-link');
  assert.equal(author.textContent, 'by @devgame');
  assert.equal(text.textContent, ANCHOR);
  assert.equal(link.href, ANCHOR_URL);

  // Empty draft: inviting copy, no warning yet.
  assert.equal(h.warning.dataset.verdict, 'pass');
  assert.match(h.warning.textContent, /in your own words/);

  // Near-dup as I type -> warn wording AND both intent links still enabled.
  h.textarea.value = NEAR_DUP;
  h.textarea.dispatch('input');
  assert.equal(h.warning.dataset.verdict, 'warn');
  assert.equal(h.warning.textContent, 'This post is very similar! Rewrite in your own words?');
  for (const p of PLATFORMS) {
    assert.ok(h.links[p].href, `${p} link must stay enabled at warn`);
    assert.equal(h.links[p].getAttribute('aria-disabled'), null);
    assert.ok(h.links[p].href.includes(encodeURIComponent(ANCHOR_URL)), `${p} link must carry the anchor URL`);
  }

  // Own words -> pass wording.
  h.textarea.value = OWN_WORDS;
  h.textarea.dispatch('input');
  assert.equal(h.warning.dataset.verdict, 'pass');
  assert.equal(h.warning.textContent, 'Looks like your own words.');

  // "I posted it" prompts for the quote URL and calls onPosted with it.
  h.postedButton.dispatch('click');
  assert.deepEqual(posted, ['https://x.com/me/status/7']);

  h.destroy();
  assert.equal(root.children.length, 0);
});

test('mount: "I posted it" with a cancelled prompt does not call onPosted', () => {
  const root = fakeRoot();
  const posted = [];
  const h = mount(root, {
    campaign: campaign(),
    me: { handle: '@me' },
    onPosted: (url) => posted.push(url),
    prompt: () => null,
  });
  h.postedButton.dispatch('click');
  assert.deepEqual(posted, []);
  h.destroy();
});

test('mount: over-limit draft unlinks intents (platform rule) but never on verdict alone', () => {
  const root = fakeRoot();
  const h = mount(root, { campaign: campaign(), me: { handle: '@me' }, onPosted: () => {} });
  h.textarea.value = 'a'.repeat(300);
  h.textarea.dispatch('input');
  // 300 a's is nothing like the anchor, so the verdict is pass — yet the
  // X link is unlinked only because the draft is over X's limit.
  assert.equal(h.warning.dataset.verdict, 'pass');
  assert.equal(h.links.x.getAttribute('aria-disabled'), 'true');
  assert.equal(h.links.x.href, undefined);
  h.destroy();
});
