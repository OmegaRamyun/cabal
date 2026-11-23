// V39 acceptance: sustained-ring feed UI, per-post composer, per-post checklist, home.
// All fixtures match the v2 sustained-ring spec (redesign-sustained-ring.md).
// DOM-only browser interactions are documented in tasks/V39-feed-ui.md.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHECKLIST_ITEMS,
  CAMPAIGN_CHECKLIST_ITEMS,
  campaignChecklistItems,
  checklistKey,
  createCampaignChecklist,
  toggleCampaignChecklistItem,
  isCampaignChecklistReady,
  getCampaignMissingItems,
  loadCampaignChecklistState,
  saveCampaignChecklistState,
  mount as mountChecklist,
} from '../src/checklist.mjs';

import {
  isComposerPlatform,
  targetPost,
  composerDraftId,
  comparisonTexts,
  scoreDraft,
  intentUrl,
  mount as mountComposer,
} from '../src/quote-composer.mjs';

import {
  ENSCRYPTION_MAX_LENGTH,
  PASS_IT_ON_COPY,
  platformLabel,
  feedPosts,
  assistReceiptText,
  assistLinkLabel,
  myAssistFor,
  newestQuotablePost,
  hasQuotablePost,
  sanitizeEnscryption,
  parsePostUrl,
  addPostToCampaign,
  markPostContributed,
} from '../src/campaign-page.mjs';

import * as home from '../src/home.mjs';

// --- Spec-shaped v2 fixtures ---

const POST_X_FOUNDING = {
  id: 'pst_aaaa1111',
  author: '@toonsouls',
  authorName: 'Wren Halloway',
  platform: 'x',
  url: 'https://x.com/toonsouls/status/1001',
  text: 'ToonSouls demo is finally live on Steam with hand-drawn bosses and parry-focused combat.',
  kind: 'announcement',
  createdAt: '2026-11-20T10:00:00.000Z',
  assists: [
    {
      handle: '@mossplays',
      status: 'contributed',
      contributedAt: '2026-11-20T12:00:00.000Z',
      url: 'https://x.com/mossplays/status/2001',
      quoteText: 'Played the ToonSouls demo last night and the boss telegraphs feel crisp and fair.',
    },
  ],
};

const POST_REDDIT_DEVLOG = {
  id: 'pst_bbbb2222',
  author: '@toonsouls',
  authorName: 'Wren Halloway',
  platform: 'reddit',
  url: 'https://www.reddit.com/r/gamedev/comments/1abc123/toonsouls_devlog/',
  text: 'Devlog on how we animated 24 frame-by-frame parry states by hand.',
  kind: 'devlog',
  createdAt: '2026-11-21T15:00:00.000Z',
  assists: [
    {
      handle: '@mossplays',
      status: 'contributed',
      contributedAt: '2026-11-21T18:00:00.000Z',
      url: 'https://www.reddit.com/r/gamedev/comments/1abc123/comment/xyz/',
      note: 'Upvoted, commented on the smear frames, shared to #Ring.',
    },
  ],
};

const POST_INSTA_CLIP = {
  id: 'pst_cccc3333',
  author: '@mossplays',
  authorName: 'Moss Finch',
  platform: 'instagram',
  url: 'https://www.instagram.com/p/ABC123/',
  text: 'Short boss-parry clip from our Friday build.',
  kind: 'clip',
  createdAt: '2026-11-22T09:00:00.000Z',
  assists: [],
};

const POST_X_SECOND = {
  id: 'pst_dddd4444',
  author: '@benboquest',
  authorName: 'Benbo',
  platform: 'x',
  url: 'https://x.com/benboquest/status/3001',
  text: 'My game is good the algorithm just ignores me — here is a new dungeon trap showcase.',
  kind: 'clip',
  createdAt: '2026-11-23T08:00:00.000Z',
  assists: [
    {
      handle: '@toonsouls',
      status: 'contributed',
      contributedAt: '2026-11-23T09:30:00.000Z',
      url: 'https://x.com/toonsouls/status/3002',
      quoteText: 'Those swinging pendulum traps in BenboQuest look evil in the best way.',
    },
  ],
};

function makeCampaign(overrides = {}) {
  return {
    id: 'cmp_toon0001',
    game: {
      name: 'ToonSouls',
      links: { steam: 'https://store.steampowered.com/app/999001' },
      tags: ['action', 'soulslike'],
    },
    title: 'ToonSouls sustained ring',
    posts: [POST_X_FOUNDING, POST_REDDIT_DEVLOG, POST_INSTA_CLIP],
    anchorPost: {
      platform: POST_X_FOUNDING.platform,
      url: POST_X_FOUNDING.url,
      text: POST_X_FOUNDING.text,
      author: POST_X_FOUNDING.author,
    },
    members: [
      { name: 'Wren Halloway', handle: '@toonsouls' },
      { name: 'Moss Finch', handle: '@mossplays' },
      { name: 'Benbo', handle: '@benboquest' },
    ],
    window: null,
    createdAt: '2026-11-20T10:00:00.000Z',
    demo: true,
    ...overrides,
  };
}

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

// Minimal fake DOM for composer + checklist mount() verification (no deps).
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
    this.checked = false;
  }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v ?? ''); }
  append(...kids) {
    for (const k of kids) {
      k.parent = this;
      this.children.push(k);
    }
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
  dispatch(type) {
    for (const fn of this.listeners[type] ?? []) fn({ type, target: this });
  }
  findAll(pred, out = []) {
    if (pred(this)) out.push(this);
    for (const c of this.children) c.findAll(pred, out);
    return out;
  }
}

class FakeDoc {
  createElement(tag) { return new FakeEl(tag, this); }
}

function fakeRoot() {
  return new FakeEl('div', new FakeDoc());
}

// --- Section 10: Per-post checklist ---

describe('V39 checklist (per-post)', () => {
  test('checklistKey uses cabal.v2.checklist.<campaignId>.<postId> and supports legacy compat', () => {
    assert.equal(
      checklistKey('cmp_toon0001', 'pst_aaaa1111'),
      'cabal.v2.checklist.cmp_toon0001.pst_aaaa1111',
    );
    assert.notEqual(
      checklistKey('cmp_toon0001', 'pst_aaaa1111'),
      checklistKey('cmp_toon0001', 'pst_bbbb2222'),
    );
    // Omitted postId -> legacy campaign key (read-only compat).
    assert.equal(checklistKey('cmp_toon0001'), 'cabal.v2.checklist.cmp_toon0001');
  });

  test('7-item set: 6 pre-post items + postLink; retired items removed', () => {
    const items = campaignChecklistItems();
    assert.equal(items.length, CHECKLIST_ITEMS.length + 1);
    assert.equal(items.length, 7);
    assert.equal(CAMPAIGN_CHECKLIST_ITEMS.length, 1);
    assert.deepEqual(CAMPAIGN_CHECKLIST_ITEMS[0], {
      id: 'postLink',
      label: "This post's link works",
    });
    const ids = items.map((i) => i.id);
    assert.ok(!ids.includes('anchorLink'));
    assert.ok(!ids.includes('ownWordsEveryMember'));
  });

  test('two posts in the same campaign have independent checklist state', () => {
    const a = createCampaignChecklist('cmp_toon0001', 'pst_aaaa1111');
    const b = createCampaignChecklist('cmp_toon0001', 'pst_bbbb2222');
    assert.equal(a.postId, 'pst_aaaa1111');
    assert.equal(b.postId, 'pst_bbbb2222');
    assert.notEqual(a.key, b.key);

    const aNext = toggleCampaignChecklistItem(a, 'postLink', true);
    assert.equal(aNext.state.postLink, true);
    assert.equal(b.state.postLink, false);
    // Retired ids are ignored.
    const ignored = toggleCampaignChecklistItem(a, 'anchorLink', true);
    assert.equal(ignored.state.anchorLink, undefined);
  });

  test('load/save round-trips per-post checklist and readiness requires all 7 items', () => {
    const s = memoryStorage();
    let cl = loadCampaignChecklistState('cmp_toon0001', 'pst_aaaa1111', s);
    assert.equal(isCampaignChecklistReady(cl), false);
    assert.equal(getCampaignMissingItems(cl).length, 7);

    for (const item of campaignChecklistItems()) {
      cl = toggleCampaignChecklistItem(cl, item.id, true);
    }
    assert.equal(isCampaignChecklistReady(cl), true);
    saveCampaignChecklistState(cl, s);

    const reloaded = loadCampaignChecklistState('cmp_toon0001', 'pst_aaaa1111', s);
    assert.equal(isCampaignChecklistReady(reloaded), true);
    assert.equal(reloaded.key, 'cabal.v2.checklist.cmp_toon0001.pst_aaaa1111');
    assert.equal(reloaded.postId, 'pst_aaaa1111');

    // Different post in same campaign is still unchecked.
    const other = loadCampaignChecklistState('cmp_toon0001', 'pst_bbbb2222', s);
    assert.equal(isCampaignChecklistReady(other), false);
  });

  test('mount fires onReadyChange with { campaignId, postId, state }', () => {
    const root = fakeRoot();
    const s = memoryStorage();
    const events = [];
    mountChecklist(root, {
      campaignId: 'cmp_toon0001',
      postId: 'pst_aaaa1111',
      storage: s,
      onReadyChange: (ready, info) => events.push({ ready, info }),
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].ready, false);
    assert.equal(events[0].info.campaignId, 'cmp_toon0001');
    assert.equal(events[0].info.postId, 'pst_aaaa1111');

    const boxes = root.findAll((el) => el.tagName === 'INPUT' && el.type === 'checkbox');
    assert.equal(boxes.length, 7);
    for (const box of boxes) {
      box.checked = true;
      box.dispatch('change');
    }
    assert.equal(events.length, 2);
    assert.equal(events[1].ready, true);
    assert.equal(events[1].info.postId, 'pst_aaaa1111');
  });
});

// --- Section 8: Composer (two-tier, target-post scoped) ---

describe('V39 composer (two-tier + per-post)', () => {
  test('isComposerPlatform is true only for x and bluesky', () => {
    assert.equal(isComposerPlatform('x'), true);
    assert.equal(isComposerPlatform('bluesky'), true);
    for (const p of ['reddit', 'instagram', 'tiktok', 'youtube', 'threads', 'other', '']) {
      assert.equal(isComposerPlatform(p), false, `expected ${p} to not use composer`);
    }
  });

  test('targetPost defaults to posts[0] and respects explicit post', () => {
    const c = makeCampaign({ posts: [POST_X_FOUNDING, POST_X_SECOND] });
    assert.equal(targetPost(c).id, POST_X_FOUNDING.id);
    assert.equal(targetPost(c, POST_X_SECOND).id, POST_X_SECOND.id);
  });

  test('composerDraftId uses <campaignId>:<postId>', () => {
    assert.equal(
      composerDraftId('cmp_toon0001', 'pst_dddd4444'),
      'cmp_toon0001:pst_dddd4444',
    );
  });

  test('comparisonTexts scopes strictly to target post text + other members quoteText on THAT post', () => {
    const c = makeCampaign({ posts: [POST_X_FOUNDING, POST_X_SECOND] });
    const textsForSecond = comparisonTexts(c, { handle: '@mossplays' }, POST_X_SECOND);
    assert.deepEqual(textsForSecond, [
      POST_X_SECOND.text,
      POST_X_SECOND.assists[0].quoteText,
    ]);
    // Must NOT include texts or quoteTexts from POST_X_FOUNDING.
    assert.ok(!textsForSecond.includes(POST_X_FOUNDING.text));
    assert.ok(!textsForSecond.includes(POST_X_FOUNDING.assists[0].quoteText));

    // Excludes me (case-insensitive).
    const textsForWren = comparisonTexts(c, { handle: '@TOONSOULS' }, POST_X_SECOND);
    assert.deepEqual(textsForWren, [POST_X_SECOND.text]);
  });

  test('scoreDraft warns on near-copy of target post, passes on own words', () => {
    const c = makeCampaign({ posts: [POST_X_FOUNDING, POST_X_SECOND] });
    const copy = POST_X_SECOND.text;
    assert.equal(scoreDraft(copy, c, { handle: '@mossplays' }, POST_X_SECOND).verdict, 'warn');
    assert.equal(
      scoreDraft('Loved watching those pendulum traps smash the skeleton knight.', c, { handle: '@mossplays' }, POST_X_SECOND).verdict,
      'pass',
    );
  });

  test('intentUrl takes the target post and carries its URL', () => {
    const draft = 'Those traps look wild in motion';
    const xUrl = intentUrl('x', draft, POST_X_SECOND);
    assert.ok(xUrl.includes(encodeURIComponent(POST_X_SECOND.url)));
    assert.ok(!xUrl.includes(encodeURIComponent(POST_X_FOUNDING.url)));
    const bskyUrl = intentUrl('bluesky', draft, POST_X_SECOND);
    assert.ok(bskyUrl.includes(encodeURIComponent(POST_X_SECOND.url)));
  });

  test('mount renders for x/bluesky target post and skips non-composer platforms', () => {
    const c = makeCampaign({ posts: [POST_X_FOUNDING, POST_REDDIT_DEVLOG, POST_X_SECOND] });

    // Non-composer platform (Reddit): returns supported: false and renders nothing.
    const redditRoot = fakeRoot();
    const rh = mountComposer(redditRoot, { campaign: c, post: POST_REDDIT_DEVLOG, me: { handle: '@benboquest' } });
    assert.equal(rh.supported, false);
    assert.equal(redditRoot.children.length, 0);

    // Composer platform (X, second post): attaches to POST_X_SECOND, draftId = cmp:pst, links stay enabled at warn.
    const xRoot = fakeRoot();
    const xh = mountComposer(xRoot, {
      campaign: c,
      post: POST_X_SECOND,
      me: { handle: '@mossplays' },
      storage: memoryStorage(),
    });
    assert.equal(xh.supported, true);
    assert.equal(xh.draftId, 'cmp_toon0001:pst_dddd4444');
    xh.textarea.value = POST_X_SECOND.text;
    xh.textarea.dispatch('input');
    assert.equal(xh.warning.dataset.verdict, 'warn');
    assert.ok(xh.links.x.href.includes(encodeURIComponent(POST_X_SECOND.url)));
    assert.equal(xh.links.x.getAttribute('aria-disabled'), null);
    xh.destroy();
  });
});

// --- Section 2a, 4, 9: Campaign page feed + Enscryption + URL parse ---

describe('V39 campaign page (feed, Enscryption, pass-it-on, URL parse)', () => {
  test('feedPosts sorts newest first (founding post is oldest, appears last)', () => {
    const c = makeCampaign();
    const ordered = feedPosts(c);
    assert.deepEqual(
      ordered.map((p) => p.id),
      ['pst_cccc3333', 'pst_bbbb2222', 'pst_aaaa1111'],
    );
  });

  test('assistReceiptText renders note ?? quoteText ?? "" and assistLinkLabel respects platform', () => {
    assert.equal(
      assistReceiptText({ handle: '@mossplays', note: 'Upvoted and shared to #Ring.' }),
      'Upvoted and shared to #Ring.',
    );
    assert.equal(
      assistReceiptText({ handle: '@mossplays', quoteText: 'Great boss fights.' }),
      'Great boss fights.',
    );
    assert.equal(assistReceiptText({ handle: '@mossplays' }), '');
    assert.equal(assistLinkLabel('x'), 'View quote');
    assert.equal(assistLinkLabel('bluesky'), 'View quote');
    assert.equal(assistLinkLabel('reddit'), 'View share');
    assert.equal(assistLinkLabel('instagram'), 'View share');
  });

  test('sanitizeEnscryption caps at 280 chars and platformLabel maps all 8 labels', () => {
    assert.equal(sanitizeEnscryption('x'.repeat(350)).length, ENSCRYPTION_MAX_LENGTH);
    assert.equal(platformLabel('x'), 'X');
    assert.equal(platformLabel('bluesky'), 'Bluesky');
    assert.equal(platformLabel('reddit'), 'Reddit');
    assert.equal(platformLabel('instagram'), 'Instagram');
    assert.equal(platformLabel('tiktok'), 'TikTok');
    assert.equal(platformLabel('youtube'), 'YouTube');
    assert.equal(platformLabel('threads'), 'Threads');
    assert.equal(platformLabel('unknown'), 'Other');
  });

  test('newestQuotablePost follows the NEWEST post with a share/quote URL', () => {
    const c = makeCampaign();
    // POST_INSTA_CLIP (newest) has no assists; POST_REDDIT_DEVLOG has a share URL; POST_X_FOUNDING has a quote URL.
    assert.equal(newestQuotablePost(c)?.id, POST_REDDIT_DEVLOG.id);
    assert.equal(hasQuotablePost(c), true);

    // If an assist has no URL, it is not quotable/shareable.
    const noUrls = makeCampaign({
      posts: [
        { ...POST_INSTA_CLIP, assists: [{ handle: '@benboquest', status: 'contributed', contributedAt: '2026-11-22T10:00:00Z', note: 'Liked it' }] },
      ],
    });
    assert.equal(newestQuotablePost(noUrls), null);
    assert.equal(hasQuotablePost(noUrls), false);
    assert.match(PASS_IT_ON_COPY, /#Ring/);
    assert.match(PASS_IT_ON_COPY, /never an obligation, never a count/i);
  });

  test('myAssistFor matches handle case-insensitively', () => {
    assert.equal(myAssistFor(POST_X_FOUNDING, '@MOSSPLAYS')?.handle, '@mossplays');
    assert.equal(myAssistFor(POST_X_FOUNDING, '@benboquest'), null);
  });

  test('parsePostUrl detects platforms and extracts X handle / Reddit slug without throwing', () => {
    assert.deepEqual(parsePostUrl('https://x.com/toonsouls/status/12345'), {
      platform: 'x',
      author: '@toonsouls',
    });
    const reddit = parsePostUrl('https://www.reddit.com/r/gamedev/comments/1abc123/toonsouls-devlog-update/');
    assert.equal(reddit.platform, 'reddit');
    assert.equal(reddit.title, 'toonsouls devlog update');
    assert.equal(parsePostUrl('https://www.instagram.com/p/ABC123/').platform, 'instagram');
    assert.equal(parsePostUrl('https://youtu.be/dQw4w9WgXcQ').platform, 'youtube');
    assert.equal(parsePostUrl('https://bsky.app/profile/dev.bsky.social/post/1').platform, 'bluesky');
    assert.equal(parsePostUrl('not a url').platform, 'other');
  });

  test('addPostToCampaign and markPostContributed return new campaigns and upsert assists', () => {
    const c = makeCampaign();
    const withNew = addPostToCampaign(c, {
      author: '@benboquest',
      platform: 'youtube',
      url: 'https://youtu.be/abc123',
      text: 'New trailer',
      kind: 'clip',
    });
    assert.equal(withNew.posts.length, c.posts.length + 1);
    assert.equal(c.posts.length, 3); // original untouched
    const added = withNew.posts[withNew.posts.length - 1];
    assert.match(added.id, /^pst_[a-z0-9]{8}$/);

    const assisted1 = markPostContributed(withNew, added.id, '@mossplays', {
      note: 'Watched and commented.',
      url: 'https://youtu.be/abc123?lc=1',
    });
    const assisted2 = markPostContributed(assisted1, added.id, '@MOSSPLAYS', {
      note: 'Updated Enscryption: commented and shared to #Ring.',
    });
    const postAfter = assisted2.posts.find((p) => p.id === added.id);
    assert.equal(postAfter.assists.length, 1); // upserted, never duplicated
    assert.equal(postAfter.assists[0].note, 'Updated Enscryption: commented and shared to #Ring.');
  });
});

// --- Section 9: Home ("your turn" = unassisted posts, newest first; latestActivity) ---

describe('V39 home (unassisted posts newest first, latestActivity, no pendingMembers)', () => {
  test('pendingMembers is removed from home exports', () => {
    assert.equal('pendingMembers' in home, false);
  });

  test('unassistedPostsFor returns posts newest first without assist from handle (excluding own posts)', () => {
    const c = makeCampaign();
    // @mossplays assisted founding X + Reddit devlog, and authored Instagram clip -> none left.
    assert.deepEqual(home.unassistedPostsFor(c, '@MOSSPLAYS'), []);
    // @toonsouls authored founding X + Reddit devlog, has not assisted @mossplays's Instagram clip.
    assert.deepEqual(
      home.unassistedPostsFor(c, '@toonsouls').map((p) => p.id),
      ['pst_cccc3333'],
    );
    // @benboquest authored none and assisted none -> all 3, newest first.
    assert.deepEqual(
      home.unassistedPostsFor(c, '@benboquest').map((p) => p.id),
      ['pst_cccc3333', 'pst_bbbb2222', 'pst_aaaa1111'],
    );
  });

  test('yourTurnPosts aggregates unassisted posts across my campaigns newest first', () => {
    const c1 = makeCampaign({ id: 'cmp_one00001' });
    const c2 = makeCampaign({
      id: 'cmp_two00002',
      title: 'Second ring',
      posts: [POST_X_SECOND],
      members: [
        { name: 'Benbo', handle: '@benboquest' },
        { name: 'Moss Finch', handle: '@mossplays' },
      ],
    });
    const cNotMine = makeCampaign({
      id: 'cmp_oth00003',
      posts: [{ ...POST_X_SECOND, id: 'pst_other999', createdAt: '2026-11-24T00:00:00.000Z', assists: [] }],
      members: [{ name: 'Someone', handle: '@someone' }],
    });

    // @mossplays has POST_X_SECOND in c2 (authored by @benboquest); in c1 they assisted X+Reddit and authored Insta.
    const mossItems = home.yourTurnPosts([c1, c2, cNotMine], { handle: '@mossplays' });
    assert.deepEqual(
      mossItems.map(({ campaign, post }) => `${campaign.id}:${post.id}`),
      ['cmp_two00002:pst_dddd4444'],
    );

    // @benboquest is in both c1 and c2: c1 has 3 unassisted posts (newest first); c2's post is their own.
    const benboItems = home.yourTurnPosts([c1, c2, cNotMine], { handle: '@benboquest' });
    assert.deepEqual(
      benboItems.map(({ campaign, post }) => `${campaign.id}:${post.id}`),
      [
        'cmp_one00001:pst_cccc3333',
        'cmp_one00001:pst_bbbb2222',
        'cmp_one00001:pst_aaaa1111',
      ],
    );
  });

  test('latestActivity picks newest post or assist timestamp and liveCampaign prefers most active', () => {
    const older = makeCampaign({
      id: 'cmp_older001',
      posts: [POST_X_FOUNDING],
    });
    const newer = makeCampaign({
      id: 'cmp_newer002',
      posts: [POST_X_SECOND],
    });
    assert.equal(home.latestActivity(older), '2026-11-20T12:00:00.000Z');
    assert.equal(home.latestActivity(newer), '2026-11-23T09:30:00.000Z');
    assert.equal(home.liveCampaign([older, newer]).id, 'cmp_newer002');
  });
});
