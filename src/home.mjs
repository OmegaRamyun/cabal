// Cabal v0.2 — Home: your game dashboard (V22 / V39 sustained ring / V57 polish).
//
// First open asks one question ("What's your game?"), then the app becomes
// that game's dashboard: dismissible first-run primer card, compact one-line
// activity strip, collapsible quiet "Your turn" status pill, dense clickable
// My Rings list rows, and a shared .cabal-form for creating a ring.
//
// Mount contract: mount(rootEl, ctx) where
//   ctx = { store, navigate(view, params), campaign? }
//   store = { game, campaigns, me, saveGame, saveCampaigns, saveMe }
//   navigate(view, params) switches view ('campaign', 'composer', ...)
// In tests, call the exported pure helpers with plain objects.

import * as campaignModel from './campaign.mjs';
import { generateCampaignKey } from './nostr.mjs';
import { NAV_ICONS } from './nav.mjs';

export const STORE_KEYS = {
  game: 'cabal.v2.game',
  campaigns: 'cabal.v2.campaigns',
  me: 'cabal.v2.me',
  demo: 'cabal.v2.demo',
  primerDismissed: 'cabal.v2.primerDismissed',
};

export const HOME_COPY = Object.freeze({
  ringsLede: 'Your dev rings, sorted by latest activity.',
  primerTitle: 'New to Cabal?',
  primerBody:
    'Small rings of indie devs boost each other\u2019s posts in their own words — no accounts, no auto-posting.',
  primerLink: 'Read the primer',
  turnQuiet: 'Your turn \u00b7 All caught up',
});

const PLATFORM_LABELS = Object.freeze({
  x: 'X',
  bluesky: 'Bluesky',
  threads: 'Threads',
  reddit: 'Reddit',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  other: 'Other',
});

// Re-export model helpers (pendingMembers removed per spec section 3b).
export const {
  postedCount,
  isLive,
  isUpcoming,
  addMember,
  createCampaign,
  validateGameSetup,
} = campaignModel;

const { relativeTime, initials, avatarHue, parsePostUrl } = campaignModel;

// ---------------------------------------------------------------- pure ---

/** Split a comma-separated tags field into clean tags. */
export function parseTags(text) {
  if (!text) return [];
  return String(text)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Normalize a user-supplied handle (or profile URL) to `@handle`.
 * Returns '' when empty — NEVER fabricates a handle from the game name (V62).
 */
export function normalizeHandle(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const parts = u.pathname.split('/').filter(Boolean);
      const host = u.hostname.toLowerCase();
      if ((host === 'bsky.app' || host.endsWith('.bsky.app')) && parts[0] === 'profile' && parts[1]) {
        return '@' + parts[1].replace(/^@+/, '');
      }
      const last = parts[parts.length - 1] || '';
      const clean = last.replace(/^@+/, '');
      return clean ? '@' + clean : '';
    } catch {
      return '';
    }
  }
  const clean = s.replace(/^@+/, '').trim();
  return clean ? '@' + clean : '';
}

function isHttpUrl(s) {
  if (typeof s !== 'string' || !/^https?:\/\//i.test(s.trim())) return false;
  try {
    const u = new URL(s.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * V62 merged creation validation: ONLY Game name and Ring name are required.
 * Store links, tags, handle, and anchor post are all optional.
 * When a post URL IS supplied, validates the URL and (for X/Bluesky) post text.
 */
export function validateRingCreation(input = {}) {
  const errors = [];
  const gameName = String(input.gameName ?? input.game?.name ?? '').trim();
  const ringName = String(input.ringName ?? input.title ?? '').trim();
  if (!gameName) errors.push('Game name is required.');
  if (!ringName) errors.push('Ring name is required.');

  const postUrl = String(input.postUrl ?? input.url ?? '').trim();
  if (postUrl) {
    if (!isHttpUrl(postUrl)) {
      errors.push('Post link must be a valid http(s) URL.');
    } else {
      const parsed = parsePostUrl(postUrl);
      const platform =
        parsed.platform && parsed.platform !== 'other'
          ? parsed.platform
          : String(input.platform || parsed.platform || 'other').trim().toLowerCase();
      const handle = normalizeHandle(input.handle) || parsed.author || normalizeHandle(input.existingMe?.handle);
      const postText = String(input.postText ?? input.text ?? '').trim();
      if (!handle) {
        errors.push('Add your handle for this post (or leave the post link blank to add one later).');
      }
      if ((platform === 'x' || platform === 'bluesky') && !postText) {
        errors.push('Post text is required for X and Bluesky posts (or leave the post link blank to add one later).');
      }
    }
  }
  return errors;
}

/**
 * V62 pure builder for the merged Game + Ring creation form.
 * Never fabricates a handle; preserves optional tags; allows no store links
 * and no anchor post.
 */
export function buildMergedCreation(input = {}) {
  const errors = validateRingCreation(input);
  if (errors.length > 0) {
    return { ok: false, errors, game: null, me: null, campaign: null };
  }

  const gameName = String(input.gameName ?? input.game?.name ?? '').trim();
  const ringName = String(input.ringName ?? input.title ?? '').trim();
  const steam = String(input.steam ?? '').trim();
  const itch = String(input.itch ?? '').trim();
  const postUrl = String(input.postUrl ?? input.url ?? '').trim();
  const postText = String(input.postText ?? input.text ?? '').trim();
  const parsedUrl = postUrl ? parsePostUrl(postUrl) : { platform: 'other' };

  const handle =
    normalizeHandle(input.handle) ||
    parsedUrl.author ||
    normalizeHandle(input.existingMe?.handle) ||
    '';

  const prevLinks = (input.existingGame && input.existingGame.links) || {};
  const links = {};
  const finalSteam = steam || (input.steam === undefined ? prevLinks.steam || '' : '');
  const finalItch = itch || (input.itch === undefined ? prevLinks.itch || '' : '');
  if (finalSteam) links.steam = finalSteam;
  if (finalItch) links.itch = finalItch;
  if (handle && (parsedUrl.platform === 'x' || (!postUrl && prevLinks.x))) {
    links.x = prevLinks.x || `https://x.com/${handle.replace(/^@/, '')}`;
  } else if (prevLinks.x) {
    links.x = prevLinks.x;
  }

  const tags =
    Array.isArray(input.tags)
      ? input.tags.map((t) => String(t).trim()).filter(Boolean)
      : input.tags !== undefined
      ? parseTags(input.tags)
      : Array.isArray(input.existingGame?.tags)
      ? [...input.existingGame.tags]
      : [];

  const game = { name: gameName, links, tags };
  // Handle-less creator (V62 + smoke fix): still record me, with an empty
  // handle, so the creator is recognised as their own ring's member
  // (invite-landing's unclaimed-seed check) instead of being routed to
  // join their own ring as a second member. The handle is backfilled on
  // their first post, as before.
  const me = handle
    ? { name: (input.existingMe && input.existingMe.name) || gameName, handle }
    : input.existingMe || { name: gameName, handle: '' };
  const creator = {
    name: (me && me.name) || gameName,
    handle,
  };

  let posts;
  if (postUrl) {
    const platform =
      parsedUrl.platform && parsedUrl.platform !== 'other'
        ? parsedUrl.platform
        : String(input.platform || parsedUrl.platform || 'other').trim().toLowerCase();
    posts = [
      {
        author: handle,
        authorName: creator.name,
        platform,
        url: postUrl,
        ...(postText ? { text: postText } : {}),
        kind: 'announcement',
      },
    ];
  }

  try {
    const campaign = createCampaign({
      game,
      title: ringName,
      ...(posts ? { posts } : {}),
      window: null,
      creator,
      ...(input.key ? { key: input.key } : {}),
      ...(input.formatId ? { formatIds: [input.formatId] } : {}),
    });
    return { ok: true, errors: [], game, me, campaign };
  } catch (err) {
    return { ok: false, errors: [err.message], game: null, me: null, campaign: null };
  }
}

/** True when at least one ring has any posts or an anchorPost. */
export function hasRingActivity(campaigns) {
  return (campaigns || []).some(
    (c) => (Array.isArray(c?.posts) && c.posts.length > 0) || Boolean(c?.anchorPost),
  );
}

/**
 * V70: decide what to render for the "Your turn" section on Home.
 * Returns 'posts' when unassisted posts exist, 'caught-up' when the user has
 * ring activity and nothing pending, or 'none' when there is no activity
 * (kills the "Your turn · All caught up" pill on a quiet/empty account).
 */
export function shouldShowTurnSection(campaigns, me) {
  if (yourTurnPosts(campaigns, me).length > 0) return 'posts';
  const mine = myCampaigns(campaigns, me);
  if (mine.length > 0 && hasRingActivity(mine)) return 'caught-up';
  return 'none';
}

/** V70: hide "Explore Network ›" while the user has no rings. */
export function shouldShowExploreNetwork(rings) {
  return Array.isArray(rings) && rings.length > 0;
}

function handleKey(me) {
  const h = typeof me === 'string' ? me : me?.handle;
  return String(h ?? '').trim().toLowerCase();
}

function toTimestamp(iso) {
  const t = Date.parse(iso ?? '');
  return Number.isNaN(t) ? 0 : t;
}

function postsOf(campaign) {
  if (Array.isArray(campaign?.posts) && campaign.posts.length > 0) {
    return campaign.posts;
  }
  return [];
}

/**
 * Newest post by createdAt, or null (delegates to V38 campaignModel.latestPost
 * when available).
 */
export function latestPost(campaign) {
  if (typeof campaignModel.latestPost === 'function') {
    return campaignModel.latestPost(campaign);
  }
  const posts = postsOf(campaign);
  if (posts.length === 0) return campaign?.anchorPost ?? null;
  let best = posts[0];
  let bestTime = toTimestamp(best.createdAt);
  for (let i = 1; i < posts.length; i++) {
    const t = toTimestamp(posts[i].createdAt);
    if (t >= bestTime) {
      best = posts[i];
      bestTime = t;
    }
  }
  return best;
}

/**
 * ISO timestamp of the newest post OR newest assist, or campaign.createdAt
 * (delegates to V38 campaignModel.latestActivity when available).
 */
export function latestActivity(campaign) {
  if (typeof campaignModel.latestActivity === 'function') {
    return campaignModel.latestActivity(campaign);
  }
  if (!campaign || typeof campaign !== 'object') return '';
  let bestIso = campaign.createdAt || '';
  let bestTime = toTimestamp(bestIso);
  for (const p of postsOf(campaign)) {
    const pt = toTimestamp(p.createdAt);
    if (pt > bestTime) {
      bestTime = pt;
      bestIso = p.createdAt;
    }
    for (const a of p.assists || []) {
      const at = toTimestamp(a.contributedAt);
      if (at > bestTime) {
        bestTime = at;
        bestIso = a.contributedAt;
      }
    }
  }
  return bestIso;
}

/**
 * Posts in `campaign` (newest first) with no assist from `handle`
 * (delegates to V38 campaignModel.unassistedPostsFor when available).
 */
export function unassistedPostsFor(campaign, handle) {
  if (typeof campaignModel.unassistedPostsFor === 'function') {
    return campaignModel.unassistedPostsFor(campaign, handle);
  }
  const target = handleKey(handle);
  if (!target || !campaign) return [];
  const posts = postsOf(campaign);
  if (posts.length === 0) return [];
  return posts
    .map((post, idx) => ({ post, idx }))
    .filter(
      ({ post }) =>
        handleKey(post.author) !== target &&
        !(post.assists || []).some((a) => handleKey(a?.handle) === target),
    )
    .sort((a, b) => {
      const diff = toTimestamp(b.post.createdAt) - toTimestamp(a.post.createdAt);
      return diff !== 0 ? diff : b.idx - a.idx;
    })
    .map(({ post }) => post);
}

/** { posted, total, pending } for a campaign's ring. */
export function ringSummary(campaign) {
  const members = campaign?.members || [];
  const posted = postedCount(campaign);
  return { posted, total: members.length, pending: Math.max(0, members.length - posted) };
}

/** Most recently active live campaign, or null. */
export function liveCampaign(campaigns, now = new Date()) {
  const live = (campaigns || []).filter((c) => isLive(c, now));
  if (live.length === 0) return null;
  return live
    .map((c, idx) => ({ c, idx, t: toTimestamp(latestActivity(c)) }))
    .sort((a, b) => (b.t !== a.t ? b.t - a.t : a.idx - b.idx))[0].c;
}

/** Campaigns I'm a member of — "your rings". No me: all. */
export function myCampaigns(campaigns, me) {
  const mine = handleKey(me);
  if (!mine) return [...(campaigns || [])];
  return (campaigns || []).filter((c) =>
    (c.members || []).some((m) => handleKey(m?.handle) === mine),
  );
}

/**
 * Sustained-ring "your turn": all unassisted posts across my campaigns,
 * newest first by post.createdAt. Returns `Array<{ campaign, post }>`.
 */
export function yourTurnPosts(campaigns, me) {
  const mine = handleKey(me);
  if (!mine) return [];
  const items = [];
  for (const campaign of myCampaigns(campaigns, me)) {
    for (const post of unassistedPostsFor(campaign, mine)) {
      items.push({ campaign, post });
    }
  }
  return items
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const diff =
        toTimestamp(b.item.post.createdAt) - toTimestamp(a.item.post.createdAt);
      return diff !== 0 ? diff : a.idx - b.idx;
    })
    .map(({ item }) => item);
}

/**
 * Campaigns where me has unassisted posts (v2), or is a pending member
 * (legacy v1 compat). No me, no turn.
 */
export function yourTurn(campaigns, me) {
  const mine = handleKey(me);
  if (!mine) return [];
  return myCampaigns(campaigns, me).filter((c) => {
    if (Array.isArray(c.posts) && c.posts.length > 0) {
      return unassistedPostsFor(c, mine).length > 0;
    }
    return (c.members || []).some(
      (m) => handleKey(m?.handle) === mine && m.status !== 'posted',
    );
  });
}

/**
 * buildRingRow(campaign, { me, now }?) -> dense row view model for Home.
 * Pure, tested.
 */
export function buildRingRow(campaign, { me = null, now = new Date() } = {}) {
  const memberCount = (campaign?.members || []).length;
  const memberLabel = memberCount === 1 ? '1 dev' : `${memberCount} devs`;
  const activityIso = latestActivity(campaign);
  const activity = activityIso ? relativeTime(activityIso, now) : '';
  const unassisted = handleKey(me) ? unassistedPostsFor(campaign, handleKey(me)).length : 0;
  let status = 'Active';
  let statusKind = 'active';
  if (unassisted > 0) {
    status = `${unassisted} to assist`;
    statusKind = 'turn';
  } else if (!isLive(campaign, now)) {
    status = 'Resting';
    statusKind = 'quiet';
  }
  return {
    id: campaign?.id || '',
    title: campaign?.title || 'Untitled ring',
    memberCount,
    memberLabel,
    activity,
    activityTs: toTimestamp(activityIso),
    status,
    statusKind,
    demo: Boolean(campaign?.demo),
  };
}

/** Sort rings newest activity first (stable). Pure, tested. */
export function sortRingsByActivity(campaigns) {
  return [...(campaigns || [])]
    .map((c, idx) => ({ c, idx, t: toTimestamp(latestActivity(c)) }))
    .sort((a, b) => (b.t !== a.t ? b.t - a.t : a.idx - b.idx))
    .map(({ c }) => c);
}

export function isPrimerDismissed(storage) {
  try {
    const s = storage || globalThis.localStorage;
    return s ? s.getItem(STORE_KEYS.primerDismissed) === '1' : false;
  } catch {
    return false;
  }
}

export function dismissPrimer(storage) {
  try {
    const s = storage || globalThis.localStorage;
    if (s) s.setItem(STORE_KEYS.primerDismissed, '1');
  } catch {
    // ignore storage errors
  }
}

// ------------------------------------------------------- localStorage ---

/** Temporary fallback until store module is passed: read localStorage
 *  directly with try/catch, return a store-shaped object. Node-safe. */
export function loadLocalStore() {
  const read = (key, fallback) => {
    try {
      if (typeof localStorage === 'undefined') return fallback;
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // private mode / full storage: keep going in memory
    }
  };
  return {
    game: read(STORE_KEYS.game, null),
    campaigns: read(STORE_KEYS.campaigns, []),
    me: read(STORE_KEYS.me, null),
    saveGame: (game) => write(STORE_KEYS.game, game),
    saveCampaigns: (list) => write(STORE_KEYS.campaigns, list),
    saveMe: (me) => write(STORE_KEYS.me, me),
  };
}

/** Use the shell-provided store when it looks complete, else localStorage. */
export function resolveStore(ctx) {
  const s = ctx && ctx.store;
  if (s && Array.isArray(s.campaigns) && typeof s.saveCampaigns === 'function') {
    return s;
  }
  return loadLocalStore();
}

// ----------------------------------------------------------------- DOM ---

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function demoBadge(campaign) {
  return campaign.demo ? '<span class="demo-badge">DEMO</span>' : '';
}

function platformLabel(platform) {
  const key = String(platform ?? '').trim().toLowerCase();
  return PLATFORM_LABELS[key] || 'Other';
}

function gameLinksHtml(game) {
  const links = game.links || {};
  const out = [];
  if (links.steam) out.push(`<a class="platform-chip" href="${esc(links.steam)}" target="_blank" rel="noopener noreferrer">Steam</a>`);
  if (links.itch) out.push(`<a class="platform-chip" href="${esc(links.itch)}" target="_blank" rel="noopener noreferrer">itch.io</a>`);
  if (links.x) out.push(`<a class="platform-chip" href="${esc(links.x)}" target="_blank" rel="noopener noreferrer">X</a>`);
  return out.join('');
}

function ringRowHtml(campaign, me) {
  const row = buildRingRow(campaign, { me });
  return `<li class="ring-row" data-open-campaign="${esc(row.id)}" tabindex="0" role="link" aria-label="${esc(row.title)}">
    <div class="ring-row-main">
      <div class="ring-row-title-line">
        <a class="ring-row-title" href="#/campaign/${encodeURIComponent(row.id)}" data-open-campaign="${esc(row.id)}">${esc(row.title)}</a>
        ${row.demo ? '<span class="demo-badge">DEMO</span>' : ''}
      </div>
      <div class="ring-row-meta">${esc(row.memberLabel)}${row.activity ? ` &middot; Active ${esc(row.activity)}` : ''}</div>
    </div>
    <span class="status-pill status-pill--${esc(row.statusKind)}">${esc(row.status)}</span>
  </li>`;
}

function turnPostRowHtml({ campaign, post }) {
  const time = relativeTime(post.createdAt);
  const author = post.author || '';
  return `<li class="ring-row turn-post-row" data-open-campaign="${esc(campaign.id)}" data-post-id="${esc(post.id)}" tabindex="0" role="link">
    <span class="avatar avatar-h${avatarHue(author)}">${esc(initials(post.authorName || author))}</span>
    <div class="ring-row-main">
      <div class="ring-row-title-line">
        <a class="ring-row-title" href="#/campaign/${encodeURIComponent(campaign.id)}" data-open-campaign="${esc(campaign.id)}">${esc(campaign.title)}</a>
        ${demoBadge(campaign)}
      </div>
      <div class="ring-row-meta">${esc(author)} &middot; ${esc(platformLabel(post.platform))}${time ? ` &middot; ${esc(time)}` : ''}</div>
    </div>
    <span class="status-pill status-pill--turn">Assist</span>
  </li>`;
}

// V49: the Rings view's create action — what a ring is and what comes next.
export const START_RING = {
  button: 'Start a ring',
  help:
    'A ring is a small group of devs who boost each other\u2019s posts, always in their own words. ' +
    'Tap it, pick your game\u2019s post, invite the ring, and they amplify it.',
};

export function mount(rootEl, ctx) {
  const store = resolveStore(ctx);
  const navigate = (ctx && ctx.navigate) || (() => {});
  // V48: a preselected format (from a format page's "Start a ring" link,
  // `#/rings/<formatId>`) opens straight into the create view. The id
  // was validated against the loaded formats by app.js; home trusts it.
  let view = ctx && ctx.formatId ? 'create' : 'dashboard'; // 'dashboard' | 'create'

  function render() {
    if (!store.game) {
      renderCreate({ isFirstTime: true });
    } else if (view === 'create') {
      renderCreate({ isFirstTime: false });
    } else {
      renderDashboard();
    }
  }

  function renderDashboard() {
    const game = store.game;
    const campaigns = store.campaigns || [];
    const live = liveCampaign(campaigns);
    const turnPosts = yourTurnPosts(campaigns, store.me);
    const turnState = shouldShowTurnSection(campaigns, store.me);
    const rings = sortRingsByActivity(myCampaigns(campaigns, store.me));
    const showExplore = shouldShowExploreNetwork(rings);
    const showPrimer = !isPrimerDismissed();
    const liveActivity = live ? relativeTime(latestActivity(live)) : '';

    const turnHtml =
      turnState === 'posts'
        ? `<div class="turn-section">
            <section class="your-turn">
              <h3 class="section-eyebrow">Your turn (${turnPosts.length})</h3>
              <ul class="ring-list-rows">${turnPosts.map(turnPostRowHtml).join('')}</ul>
            </section>
          </div>`
        : turnState === 'caught-up'
        ? `<div class="turn-section">
            <div class="turn-status-row"><span class="status-pill status-pill--quiet">${esc(HOME_COPY.turnQuiet)}</span></div>
          </div>`
        : '';

    rootEl.innerHTML = `
      <section class="home-dashboard">
        <p class="ring-explainer-line">${esc(START_RING.help)}</p>
        ${
          showPrimer
            ? `<aside class="primer-card" id="home-primer-card">
                <div class="primer-card-body">
                  <strong>${esc(HOME_COPY.primerTitle)}</strong>
                  <span>${esc(HOME_COPY.primerBody)}</span>
                  <a href="#/intro" class="primer-card-link">${esc(HOME_COPY.primerLink)}</a>
                </div>
                <button type="button" class="icon-btn btn-sm" id="dismiss-primer" aria-label="Dismiss primer">${NAV_ICONS.close}</button>
              </aside>`
            : ''
        }
        <header class="cabal-page-header game-header">
          <div class="cabal-page-header-main">
            <h2>${esc(game.name)}</h2>
            <div class="game-meta-bar">
              ${gameLinksHtml(game)}
              ${game.tags && game.tags.length ? `<span class="game-tags">${game.tags.map(esc).join(' &middot; ')}</span>` : ''}
            </div>
          </div>
          <div class="cabal-page-header-actions">
            <button type="button" id="start-campaign" class="primary btn-md">${esc(START_RING.button)}</button>
          </div>
        </header>

        ${
          live
            ? `<button type="button" class="activity-strip" data-open-campaign="${esc(live.id)}">
                <span class="activity-strip-label">Latest</span>
                <span class="activity-strip-title">${esc(live.title)}</span>
                ${liveActivity ? `<span class="activity-strip-time">${esc(liveActivity)}</span>` : ''}
              </button>`
            : ''
        }

        ${turnHtml}

        <section class="your-rings">
          <div class="section-head-row">
            <h3 class="section-eyebrow">My Rings</h3>
            ${showExplore ? '<a class="section-head-link" href="#/campaigns">Explore Network &rsaquo;</a>' : ''}
          </div>
          <p class="view-lede">${esc(HOME_COPY.ringsLede)}</p>
          ${
            rings.length
              ? `<ul class="ring-list-rows">${rings.map((c) => ringRowHtml(c, store.me)).join('')}</ul>`
              : '<p class="empty-state">No rings yet. Start a ring to gather other devs around your game.</p>'
          }
        </section>
      </section>`;

    const dismissBtn = rootEl.querySelector('#dismiss-primer');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        dismissPrimer();
        const card = rootEl.querySelector('#home-primer-card');
        if (card) card.remove();
      });
    }

    rootEl.querySelector('#start-campaign').addEventListener('click', () => {
      view = 'create';
      render();
    });

    rootEl.querySelectorAll('[data-open-campaign]').forEach((el) => {
      const openIt = (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigate('campaign', { campaignId: el.dataset.openCampaign });
      };
      el.addEventListener('click', openIt);
      if (el.tagName === 'LI') {
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') openIt(e);
        });
      }
    });
  }

  function renderCreate({ isFirstTime = false } = {}) {
    const existingGame = store.game || null;
    const existingLinks = (existingGame && existingGame.links) || {};
    const existingTags = Array.isArray(existingGame?.tags) ? existingGame.tags.join(', ') : '';
    const existingHandle = store.me?.handle || '';

    rootEl.innerHTML = `
      <section class="campaign-create cabal-form-page">
        <p class="ring-explainer-line">${esc(START_RING.help)}</p>
        <header class="cabal-page-header">
          <div class="cabal-page-header-main">
            <h2>${esc(START_RING.button)}</h2>
            <p class="view-lede">Name your game and your ring &mdash; everything else is optional and can be added on the ring page.</p>
          </div>
        </header>
        ${ctx && ctx.formatId ? `<p class="format-preselected">Template: <strong>${esc(ctx.formatTagline || ctx.formatId)}</strong></p>` : ''}
        <form id="campaign-create-form" class="cabal-form">
          <p class="form-error" id="create-errors" hidden></p>
          <div class="cabal-form-row">
            <label>Game name
              <input type="text" name="gameName" required value="${esc(existingGame?.name || '')}" placeholder="e.g. Brass Orchard" autocomplete="off">
            </label>
            <label>Ring name
              <input type="text" name="ringName" required autocomplete="off" placeholder="e.g. Devlog &amp; launch ring">
            </label>
          </div>
          <div class="cabal-form-row">
            <label>Tags (optional, comma-separated)
              <input type="text" name="tags" value="${esc(existingTags)}" placeholder="roguelike, cozy, pixel-art" autocomplete="off">
            </label>
            <label>Your handle (optional)
              <input type="text" name="handle" value="${esc(existingHandle)}" placeholder="@yourhandle" autocomplete="off">
            </label>
          </div>
          <details class="create-optional-details">
            <summary>Optional: store links &amp; first post (or add later on the ring page)</summary>
            <div class="cabal-form-row">
              <label>Steam link (optional)
                <input type="url" name="steam" value="${esc(existingLinks.steam || '')}" placeholder="https://store.steampowered.com/app/..." autocomplete="off">
              </label>
              <label>itch.io link (optional)
                <input type="url" name="itch" value="${esc(existingLinks.itch || '')}" placeholder="https://...itch.io/..." autocomplete="off">
              </label>
            </div>
            <label>Link to a post (optional)
              <input type="url" name="url" placeholder="https://x.com/.../status/... or bsky.app / reddit / youtube" autocomplete="off">
            </label>
            <div class="cabal-form-row">
              <label>Platform (inferred from link)
                <select name="platform">
                  <option value="x">X</option>
                  <option value="bluesky">Bluesky</option>
                  <option value="reddit">Reddit</option>
                  <option value="instagram">Instagram</option>
                  <option value="tiktok">TikTok</option>
                  <option value="youtube">YouTube</option>
                  <option value="threads">Threads</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>What the post says (optional; needed for X / Bluesky)
                <textarea name="text" rows="2" placeholder="Paste the post text or a line of context"></textarea>
              </label>
            </div>
          </details>
          <div class="cabal-form-footer">
            <button type="submit" class="primary btn-md">Start my ring</button>
            ${isFirstTime ? '' : '<button type="button" id="create-cancel" class="btn-md">Cancel</button>'}
          </div>
        </form>
      </section>`;

    const cancelBtn = rootEl.querySelector('#create-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        view = 'dashboard';
        render();
      });
    }

    const form = rootEl.querySelector('#campaign-create-form');
    const urlInput = form.querySelector('input[name="url"]');
    const platformSelect = form.querySelector('select[name="platform"]');
    const handleInput = form.querySelector('input[name="handle"]');
    const textInput = form.querySelector('textarea[name="text"]');
    const touched = {
      platform: false,
      handle: Boolean(existingHandle),
      text: false,
    };

    platformSelect.addEventListener('change', () => { touched.platform = true; });
    handleInput.addEventListener('input', () => { touched.handle = Boolean(handleInput.value.trim()); });
    textInput.addEventListener('input', () => { touched.text = Boolean(textInput.value.trim()); });

    const prefillFromUrl = () => {
      const parsed = parsePostUrl(urlInput.value);
      if (!touched.platform && parsed.platform) {
        platformSelect.value = parsed.platform;
      }
      if (!touched.handle && parsed.author) {
        handleInput.value = parsed.author;
      }
      if (!touched.text && (parsed.text || parsed.title)) {
        textInput.value = parsed.text || parsed.title;
      }
    };
    urlInput.addEventListener('input', prefillFromUrl);
    urlInput.addEventListener('change', prefillFromUrl);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const result = buildMergedCreation({
        gameName: data.get('gameName'),
        ringName: data.get('ringName'),
        tags: data.get('tags'),
        handle: data.get('handle'),
        steam: data.get('steam'),
        itch: data.get('itch'),
        postUrl: data.get('url'),
        platform: data.get('platform'),
        postText: data.get('text'),
        existingGame: store.game,
        existingMe: store.me,
        key: generateCampaignKey().key,
        formatId: ctx && ctx.formatId ? ctx.formatId : undefined,
      });
      const errEl = rootEl.querySelector('#create-errors');
      if (!result.ok) {
        errEl.textContent = result.errors.join(' ');
        errEl.hidden = false;
        return;
      }
      store.saveGame(result.game);
      store.game = result.game;
      if (result.me && typeof store.saveMe === 'function') {
        store.saveMe(result.me);
        store.me = result.me;
      }
      const campaigns = [...(store.campaigns || []), result.campaign];
      store.saveCampaigns(campaigns);
      store.campaigns = campaigns;
      view = 'dashboard';
      render();
      navigate('campaign', { campaignId: result.campaign.id });
    });
  }

  render();
}
