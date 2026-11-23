// Cabal v0.2 — Home: your game dashboard (V22 / V39 sustained ring).
//
// First open asks one question ("What's your game?"), then the app becomes
// that game's dashboard: live campaign (by latest activity, no window),
// your turn (unassisted posts newest first across your rings), your rings,
// start a campaign.
//
// Mount contract: mount(rootEl, ctx) where
//   ctx = { store, navigate(view, params), campaign? }
//   store = { game, campaigns, me, saveGame, saveCampaigns, saveMe }
//   navigate(view, params) switches view ('campaign', 'composer', ...)
// In tests, call the exported pure helpers with plain objects.

import * as campaignModel from './campaign.mjs';

export const STORE_KEYS = {
  game: 'cabal.v2.game',
  campaigns: 'cabal.v2.campaigns',
  me: 'cabal.v2.me',
  demo: 'cabal.v2.demo',
};

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
} = campaignModel;

const { relativeTime, initials, avatarHue } = campaignModel;

// ---------------------------------------------------------------- pure ---

/** Split a comma-separated tags field into clean tags. */
export function parseTags(text) {
  if (!text) return [];
  return String(text)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Setup validation: name required, at least one store link. */
export function validateGameSetup(game) {
  const errors = [];
  if (!game || !String(game.name || '').trim()) {
    errors.push('Game name is required.');
  }
  const links = (game && game.links) || {};
  if (!String(links.steam || '').trim() && !String(links.itch || '').trim()) {
    errors.push('Add at least one store link (Steam or itch).');
  }
  return errors;
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
  return campaign.demo ? ' <span class="demo-badge">DEMO</span>' : '';
}

function platformLabel(platform) {
  const key = String(platform ?? '').trim().toLowerCase();
  return PLATFORM_LABELS[key] || 'Other';
}

function gameLinksHtml(game) {
  const links = game.links || {};
  const out = [];
  if (links.steam) out.push(`<a href="${esc(links.steam)}">Steam</a>`);
  if (links.itch) out.push(`<a href="${esc(links.itch)}">itch.io</a>`);
  if (links.x) out.push(`<a href="${esc(links.x)}">X</a>`);
  return out.join(' · ');
}

function campaignCardHtml(campaign) {
  const latest = latestPost(campaign) || campaign.anchorPost || {};
  const author = latest.author || '';
  const activity = relativeTime(latestActivity(campaign));
  const memberCount = (campaign.members || []).length;
  const ringLabel = memberCount === 1 ? '1 dev in ring' : `${memberCount} devs in ring`;
  return `<article class="campaign-card" data-campaign-id="${esc(campaign.id)}">
    <div class="post-head">
      <span class="avatar avatar-h${avatarHue(author)}">${esc(initials(latest.authorName || author))}</span>
      <span class="post-author">${esc(author)}</span>
      ${latest.platform ? `<span class="post-time">· ${esc(platformLabel(latest.platform))}</span>` : ''}
      ${activity ? `<span class="post-time">· Active ${esc(activity)}</span>` : ''}
    </div>
    <h3><a href="#" data-open-campaign="${esc(campaign.id)}">${esc(campaign.title)}</a>${demoBadge(campaign)}</h3>
    ${latest.text ? `<p class="anchor-preview">&ldquo;${esc(latest.text)}&rdquo;</p>` : ''}
    <p class="campaign-meta">${esc(ringLabel)}${activity ? ` · Latest activity ${esc(activity)}` : ''}</p>
  </article>`;
}

function turnPostCardHtml({ campaign, post }) {
  const time = relativeTime(post.createdAt);
  const author = post.author || '';
  return `<article class="campaign-card turn-post-card" data-campaign-id="${esc(campaign.id)}" data-post-id="${esc(post.id)}">
    <div class="post-head">
      <span class="avatar avatar-h${avatarHue(author)}">${esc(initials(post.authorName || author))}</span>
      <span class="post-author">${esc(author)}</span>
      <span class="post-time">· ${esc(platformLabel(post.platform))}${time ? ` · ${esc(time)}` : ''}</span>
    </div>
    <h3><a href="#" data-open-campaign="${esc(campaign.id)}">${esc(campaign.title)}</a>${demoBadge(campaign)}</h3>
    ${post.text ? `<p class="anchor-preview">&ldquo;${esc(post.text)}&rdquo;</p>` : ''}
    <p><button type="button" data-open-campaign="${esc(campaign.id)}">Open in ring feed</button></p>
  </article>`;
}

export function mount(rootEl, ctx) {
  const store = resolveStore(ctx);
  const navigate = (ctx && ctx.navigate) || (() => {});
  let view = 'dashboard'; // 'dashboard' | 'create'

  function render() {
    if (!store.game) {
      renderSetup();
    } else if (view === 'create') {
      renderCreate();
    } else {
      renderDashboard();
    }
  }

  function renderSetup() {
    rootEl.innerHTML = `
      <section class="home-setup">
        <h2>What&rsquo;s your game?</h2>
        <p>One question, then this becomes your game&rsquo;s dashboard.</p>
        <form id="game-setup-form">
          <p class="form-error" id="setup-errors" hidden></p>
          <label>Game name
            <input type="text" name="name" required autocomplete="off">
          </label>
          <label>Steam link
            <input type="url" name="steam" placeholder="https://store.steampowered.com/app/..." autocomplete="off">
          </label>
          <label>itch.io link
            <input type="url" name="itch" placeholder="https://...itch.io/..." autocomplete="off">
          </label>
          <label>Tags (comma-separated)
            <input type="text" name="tags" placeholder="roguelike, cozy, pixel-art" autocomplete="off">
          </label>
          <label>X handle
            <input type="text" name="x" placeholder="@yourhandle" autocomplete="off">
          </label>
          <button type="submit">Save my game</button>
        </form>
      </section>`;
    const form = rootEl.querySelector('#game-setup-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const links = {};
      const steam = String(data.get('steam') || '').trim();
      const itch = String(data.get('itch') || '').trim();
      const x = String(data.get('x') || '').trim();
      if (steam) links.steam = steam;
      if (itch) links.itch = itch;
      if (x) links.x = x.startsWith('http') ? x : `https://x.com/${x.replace(/^@/, '')}`;
      const game = {
        name: String(data.get('name') || '').trim(),
        links,
        tags: parseTags(data.get('tags')),
      };
      const errors = validateGameSetup(game);
      const errEl = rootEl.querySelector('#setup-errors');
      if (errors.length) {
        errEl.textContent = errors.join(' ');
        errEl.hidden = false;
        return;
      }
      store.saveGame(game);
      store.game = game;
      if (links.x && typeof store.saveMe === 'function') {
        const handle = '@' + links.x.replace(/\/$/, '').split('/').pop();
        const me = { name: game.name, handle };
        store.saveMe(me);
        store.me = me;
      }
      render();
    });
  }

  function renderDashboard() {
    const game = store.game;
    const campaigns = store.campaigns || [];
    const live = liveCampaign(campaigns);
    const turnPosts = yourTurnPosts(campaigns, store.me);
    const rings = myCampaigns(campaigns, store.me);

    rootEl.innerHTML = `
      <section class="home-dashboard">
        <header class="game-header">
          <h2>${esc(game.name)}</h2>
          <p class="game-links">${gameLinksHtml(game)}</p>
          ${game.tags && game.tags.length ? `<p class="game-tags">${game.tags.map(esc).join(', ')}</p>` : ''}
        </header>
        <p><button type="button" id="start-campaign" class="primary">Start a campaign</button></p>
        <section class="live-campaign">
          <h3>Latest activity</h3>
          ${live ? campaignCardHtml(live) : '<p class="empty-state">No active ring yet. Start one and add your first post.</p>'}
        </section>
        <section class="your-turn">
          <h3>Your turn</h3>
          ${turnPosts.length ? turnPosts.map(turnPostCardHtml).join('') : '<p class="empty-state">No new posts to assist.</p>'}
        </section>
        <section class="your-rings">
          <h3>Your rings</h3>
          ${rings.length ? rings.map((c) => campaignCardHtml(c)).join('') : '<p class="empty-state">No campaigns yet.</p>'}
        </section>
      </section>`;

    rootEl.querySelector('#start-campaign').addEventListener('click', () => {
      view = 'create';
      render();
    });
    rootEl.querySelectorAll('[data-open-campaign]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        navigate('campaign', { campaignId: el.dataset.openCampaign });
      });
    });
  }

  function renderCreate() {
    rootEl.innerHTML = `
      <section class="campaign-create">
        <h2>Start a campaign</h2>
        <p>For <strong>${esc(store.game.name)}</strong>. Start a ring with your founding post &mdash; add more posts as you build, no window, no deadline.</p>
        <form id="campaign-create-form">
          <p class="form-error" id="create-errors" hidden></p>
          <label>Campaign title
            <input type="text" name="title" required autocomplete="off" placeholder="e.g. Devlog &amp; launch ring">
          </label>
          <label>First post platform
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
          <label>First post URL
            <input type="url" name="url" required placeholder="https://x.com/.../status/..." autocomplete="off">
          </label>
          <label>First post text or context
            <textarea name="text" required rows="3" placeholder="Paste the post text (required for X / Bluesky) or a line of context"></textarea>
          </label>
          <label>First post author
            <input type="text" name="author" required placeholder="@yourhandle" value="${esc(store.me?.handle || '')}" autocomplete="off">
          </label>
          <button type="submit">Create campaign</button>
          <button type="button" id="create-cancel">Cancel</button>
        </form>
      </section>`;
    rootEl.querySelector('#create-cancel').addEventListener('click', () => {
      view = 'dashboard';
      render();
    });
    const form = rootEl.querySelector('#campaign-create-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const title = String(data.get('title') || '').trim();
      const anchorPost = {
        platform: String(data.get('platform') || 'x'),
        url: String(data.get('url') || '').trim(),
        text: String(data.get('text') || '').trim(),
        author: String(data.get('author') || '').trim(),
      };
      const errors = [];
      if (!title) errors.push('Campaign title is required.');
      if (!anchorPost.url) errors.push('First post URL is required.');
      if (!anchorPost.text && (anchorPost.platform === 'x' || anchorPost.platform === 'bluesky')) {
        errors.push('Post text is required for X and Bluesky posts.');
      }
      if (!anchorPost.author) errors.push('First post author is required.');
      const errEl = rootEl.querySelector('#create-errors');
      if (errors.length) {
        errEl.textContent = errors.join(' ');
        errEl.hidden = false;
        return;
      }
      const creator =
        store.me && store.me.handle
          ? store.me
          : {
              name: store.game.name,
              handle:
                '@' +
                store.game.name
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '')
                  .slice(0, 20),
            };
      let campaign;
      try {
        campaign = createCampaign({
          game: store.game,
          title,
          anchorPost,
          window: null,
          creator,
        });
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
        return;
      }
      const campaigns = [...(store.campaigns || []), campaign];
      store.saveCampaigns(campaigns);
      store.campaigns = campaigns;
      view = 'dashboard';
      render();
      navigate('campaign', { campaignId: campaign.id });
    });
  }

  render();
}
