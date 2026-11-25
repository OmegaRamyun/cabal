// V77 — Join + composer validation.
// 1. Invite-landing Join with an empty "Your name" shows the inline error
//    (native `required` used to swallow the submit entirely: silent no-op).
// 2. "I posted it" uses an inline URL field, never a native prompt; empty
//    draft and Cancel give visible feedback and record nothing.
// 3. Ring creation takes an optional "Your name" so the creator's member
//    record is not just the game name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateJoin, joinRing, renderInviteCard, NAME_REQUIRED_COPY,
} from '../src/invite-landing.mjs';
import {
  confirmPosted, postedStep, mount, NOTHING_RECORDED_COPY, POSTED_RECORDED_COPY,
} from '../src/quote-composer.mjs';
import { buildMergedCreation } from '../src/home.mjs';

const ring = () => ({
  id: 'cmp_v77', name: 'Launch ring', game: { name: 'ToonSouls' },
  members: [{ name: 'Ada', handle: '@ada' }], removedMembers: [], posts: [],
});

// --- Minimal fake DOM (same shape as v23's): enough for mount(). ---
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
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v ?? ''); }
  append(...kids) {
    for (const k of kids) { k.parent = this; this.children.push(k); }
    return this;
  }
  appendChild(k) { return this.append(k); }
  remove() {
    if (!this.parent) return;
    const i = this.parent.children.indexOf(this);
    if (i >= 0) this.parent.children.splice(i, 1);
    this.parent = null;
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  removeAttribute(k) {
    delete this.attributes[k];
    if (k === 'href') delete this.href;
  }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
  }
  dispatch(type) { for (const fn of this.listeners[type] ?? []) fn({ type, target: this }); }
  find(pred) {
    if (pred(this)) return this;
    for (const c of this.children) { const hit = c.find(pred); if (hit) return hit; }
    return null;
  }
}
class FakeDoc {
  createElement(tag) { return new FakeEl(tag, this); }
}
function fakeRoot() { return new FakeEl('div', new FakeDoc()); }

const ANCHOR =
  'I spent about ten hours on this roguelike deckbuilder and the thing that hooked me was the way every relic changes how you sequence your turns, so a run that looks doomed at floor three can suddenly snowball when the right pair of cards shows up together.';
const ANCHOR_URL = 'https://x.com/devgame/status/1234567890';
const OWN_WORDS =
  'Great deckbuilder with a roguelike loop. What kept me playing was relic synergy: finding two cards that combo late in a bad run felt amazing, and I lost an entire weekend to it.';

function campaign() {
  return {
    id: 'cmp_test1234',
    game: { name: 'Deckbuilder', links: {}, tags: ['roguelike'] },
    title: 'Demo launch',
    anchorPost: { platform: 'x', url: ANCHOR_URL, text: ANCHOR, author: '@devgame' },
    window: null,
    members: [{ name: 'Me', handle: '@me', status: 'pending' }],
    createdAt: '2026-11-22T00:00:00.000Z',
  };
}

// --- 1. Invite-landing Join ---

test('invite card: no native validation to swallow the submit (novalidate, no required name)', () => {
  const card = renderInviteCard(ring(), {});
  assert.ok(card.includes('<form id="invite-join-form" class="cabal-form" novalidate>'), 'form must be novalidate');
  assert.ok(!/name="name"[^>]*required/.test(card), 'name input must not carry required');
  assert.ok(card.includes('<p class="form-error" id="invite-errors" hidden></p>'), 'inline error element present');
});

test('invite Join with an empty name fails loudly, adds nobody', () => {
  const before = ring();
  const res = joinRing(before, { name: '   ', handle: '' });
  assert.equal(res.ok, false);
  assert.equal(res.error, NAME_REQUIRED_COPY);
  assert.equal(before.members.length, 1, 'roster untouched');
  assert.deepEqual(validateJoin(before, { name: '', handle: '@x' }), { ok: false, error: NAME_REQUIRED_COPY });
});

test('invite Join with a name still works (handle derived)', () => {
  const res = joinRing(ring(), { name: 'Bob Ross' });
  assert.equal(res.ok, true);
  assert.equal(res.member.name, 'Bob Ross');
  assert.equal(res.member.handle, '@bobross');
  assert.equal(res.campaign.members.length, 2);
});

// --- 2. Quote composer: inline URL, no prompt, visible feedback ---

test('postedStep: empty draft records nothing; draft + URL records quote + URL', () => {
  assert.deepEqual(postedStep({ draft: '  ', quoteUrl: 'https://x.com/me/status/1' }), {
    recorded: false, quoteUrl: '', message: NOTHING_RECORDED_COPY,
  });
  assert.deepEqual(postedStep({ draft: OWN_WORDS, quoteUrl: '  https://x.com/me/status/7  ' }), {
    recorded: true, quoteUrl: 'https://x.com/me/status/7', message: POSTED_RECORDED_COPY,
  });
  // URL stays optional: blank URL still records.
  const noUrl = postedStep({ draft: OWN_WORDS, quoteUrl: '' });
  assert.equal(noUrl.recorded, true);
  assert.equal(noUrl.quoteUrl, '');
});

test('confirmPosted pure function keeps its cancel behaviour', () => {
  const seen = [];
  assert.deepEqual(confirmPosted({ prompt: () => null, onPosted: (u) => seen.push(u) }), {
    posted: false, quoteUrl: null,
  });
  assert.deepEqual(seen, []);
});

test('mount: empty draft -> inline message, no assist recorded', () => {
  const root = fakeRoot();
  const posted = [];
  const h = mount(root, {
    campaign: campaign(), me: { handle: '@me' },
    onPosted: (url, draft, post) => posted.push({ url, draft, post }),
  });
  assert.ok(h.urlInput, 'inline URL field exists');
  h.postedButton.dispatch('click');
  assert.deepEqual(posted, []);
  assert.equal(h.message.textContent, NOTHING_RECORDED_COPY);
  h.destroy();
});

test('mount: URL provided -> assist recorded with quote + URL', () => {
  const root = fakeRoot();
  const posted = [];
  const h = mount(root, {
    campaign: campaign(), me: { handle: '@me' },
    onPosted: (url, draft, post) => posted.push({ url, draft, post }),
  });
  h.textarea.value = OWN_WORDS;
  h.urlInput.value = 'https://x.com/me/status/7';
  h.postedButton.dispatch('click');
  assert.equal(posted.length, 1);
  assert.equal(posted[0].url, 'https://x.com/me/status/7');
  assert.equal(posted[0].draft, OWN_WORDS);
  assert.equal(posted[0].post.url, ANCHOR_URL);
  assert.equal(h.message.textContent, POSTED_RECORDED_COPY);
  h.destroy();
});

test('mount: URL optional — draft with no URL still records', () => {
  const root = fakeRoot();
  const posted = [];
  const h = mount(root, {
    campaign: campaign(), me: { handle: '@me' },
    onPosted: (url, draft) => posted.push({ url, draft }),
  });
  h.textarea.value = OWN_WORDS;
  h.postedButton.dispatch('click');
  assert.deepEqual(posted, [{ url: '', draft: OWN_WORDS }]);
  h.destroy();
});

test('mount: Cancel -> message, nothing recorded, URL cleared, draft kept', () => {
  const root = fakeRoot();
  const posted = [];
  const h = mount(root, {
    campaign: campaign(), me: { handle: '@me' },
    onPosted: (url, draft) => posted.push({ url, draft }),
  });
  h.textarea.value = OWN_WORDS;
  h.urlInput.value = 'https://x.com/me/status/7';
  h.cancelButton.dispatch('click');
  assert.deepEqual(posted, []);
  assert.equal(h.urlInput.value, '');
  assert.equal(h.textarea.value, OWN_WORDS, 'Cancel never destroys the draft');
  assert.equal(h.message.textContent, NOTHING_RECORDED_COPY);
  h.destroy();
});

test('mount: never calls a native prompt, even when one exists', () => {
  const root = fakeRoot();
  const promptCalls = [];
  const prevPrompt = globalThis.prompt;
  globalThis.prompt = (...args) => { promptCalls.push(args); return null; };
  try {
    const posted = [];
    const h = mount(root, {
      campaign: campaign(), me: { handle: '@me' },
      onPosted: (url, draft) => posted.push({ url, draft }),
    });
    h.textarea.value = OWN_WORDS;
    h.urlInput.value = 'https://x.com/me/status/7';
    h.postedButton.dispatch('click');
    assert.deepEqual(promptCalls, [], 'no native prompt may fire');
    assert.equal(posted.length, 1);
    h.destroy();
  } finally {
    if (prevPrompt === undefined) delete globalThis.prompt;
    else globalThis.prompt = prevPrompt;
  }
});

// --- 3. Creator name at ring creation ---

test('creation: "Your name" becomes the creator member name, handle kept', () => {
  const res = buildMergedCreation({
    gameName: 'Brass Orchard', ringName: 'Cozy Launch',
    creatorName: 'Wren', handle: '@wren',
  });
  assert.equal(res.ok, true);
  assert.equal(res.me.name, 'Wren');
  assert.equal(res.me.handle, '@wren');
  assert.equal(res.campaign.members[0].name, 'Wren');
  assert.equal(res.campaign.members[0].handle, '@wren');
});

test('creation: blank "Your name" falls back to the game name (old behaviour)', () => {
  const res = buildMergedCreation({
    gameName: 'Brass Orchard', ringName: 'Cozy Launch', creatorName: '  ',
  });
  assert.equal(res.ok, true);
  assert.equal(res.me.name, 'Brass Orchard');
  assert.equal(res.campaign.members[0].name, 'Brass Orchard');
});

test('creation: "Your name" with no handle still records the name, never fabricates a handle', () => {
  const res = buildMergedCreation({
    gameName: 'Brass Orchard', ringName: 'Cozy Launch', creatorName: 'Wren',
  });
  assert.equal(res.ok, true);
  assert.equal(res.me.name, 'Wren');
  assert.equal(res.me.handle, '');
  assert.equal(res.campaign.members[0].name, 'Wren');
  assert.ok(!JSON.stringify(res.campaign).includes('@wren'), 'no handle fabricated from the name');
});

test('creation: "Your name" overrides a stored me name; blank keeps it', () => {
  const existingMe = { name: 'Old Name', handle: '@old' };
  const over = buildMergedCreation({
    gameName: 'Brass Orchard', ringName: 'Cozy Launch',
    creatorName: 'Wren', handle: '@wren', existingMe,
  });
  assert.equal(over.me.name, 'Wren');
  const kept = buildMergedCreation({
    gameName: 'Brass Orchard', ringName: 'Cozy Launch',
    handle: '@wren', existingMe,
  });
  assert.equal(kept.me.name, 'Old Name');
});
