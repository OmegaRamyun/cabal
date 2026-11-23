// Cabal v0.2 — Home: your game dashboard (V22).
//
// First open asks one question ("What's your game?"), then the app becomes
// that game's dashboard: live campaign, your turn, your rings, start a
// campaign.
//
// NOTE (integration): the pure helpers postedCount / pendingMembers /
// isLive / addMember / createCampaign duplicate V21's src/campaign.mjs
// (built in parallel on another branch — do not import it). Dedupe at
// integration: keep V21's versions, delete these. The localStorage fallback
// in resolveStore is likewise temporary: V21's src/store.mjs replaces it.
//
// Mount contract: mount(rootEl, ctx) where
//   ctx = { store, navigate(view, params), campaign? }
//   store = { game, campaigns, me, saveGame, saveCampaigns, saveMe }
//           (plain object with functions the shell provides)
//   navigate(view, params) switches view ('campaign', 'composer', ...)
// In tests, call the exported pure helpers with plain objects.

export const STORE_KEYS = {
  game: 'cabal.v2.game',
  campaigns: 'cabal.v2.campaigns',
  me: 'cabal.v2.me',
  demo: 'cabal.v2.demo',
};

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

// --- duplicated from V21 (src/campaign.mjs) — see note above ---

export function postedCount(campaign) {
  return (campaign.members || []).filter((m) => m.status === 'posted').length;
}

export function pendingMembers(campaign) {
  return (campaign.members || []).filter((m) => m.status !== 'posted');
}

export function isLive(campaign, now = new Date()) {
  const w = campaign.window;
  if (!w) return true;
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (w.start && t < new Date(w.start).getTime()) return false;
  if (w.end && t > new Date(w.end).getTime()) return false;
  return true;
}

export function isUpcoming(campaign, now = new Date()) {
  const w = campaign.window;
  if (!w || !w.start) return false;
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return t < new Date(w.start).getTime();
}

/** Add a member (no mutation, no-op if the handle is already in the ring). */
export function addMember(campaign, { name, handle }) {
  const members = campaign.members || [];
  if (members.some((m) => m.handle === handle)) return campaign;
  return {
    ...campaign,
    members: [...members, { name, handle, status: 'pending' }],
  };
}

/** Create a campaign in the frozen shape; creator is members[0], pending. */
export function createCampaign({ game, title, anchorPost, window: win, me }) {
  const creator =
    me && me.handle ? { name: me.name || me.handle, handle: me.handle } : null;
  return {
    id: 'cmp_' + Math.random().toString(36).slice(2, 10),
    game: {
      name: game.name,
      links: { ...(game.links || {}) },
      tags: [...(game.tags || [])],
    },
    title,
    anchorPost: { ...anchorPost },
    window: win || null,
    members: creator ? [{ ...creator, status: 'pending' }] : [],
    createdAt: new Date().toISOString(),
  };
}

// --- end V21 duplication ---

/** { posted, total, pending } for a campaign's ring. */
export function ringSummary(campaign) {
  const members = campaign.members || [];
  const posted = postedCount(campaign);
  return { posted, total: members.length, pending: members.length - posted };
}

/** First live campaign (in list order), or null. */
export function liveCampaign(campaigns, now = new Date()) {
  return (campaigns || []).find((c) => isLive(c, now)) || null;
}

/**
 * Campaigns where me is a pending member — the quote-posts still owed.
 * me is matched by handle. No me, no turn.
 */
export function yourTurn(campaigns, me) {
  if (!me || !me.handle) return [];
  return (campaigns || []).filter((c) =>
    (c.members || []).some(
      (m) => m.handle === me.handle && m.status !== 'posted',
    ),
  );
}

/** Campaigns I'm a member of (any status) — "your rings". No me: all. */
export function myCampaigns(campaigns, me) {
  if (!me || !me.handle) return [...(campaigns || [])];
  return (campaigns || []).filter((c) =>
    (c.members || []).some((m) => m.handle === me.handle),
  );
}

// ------------------------------------------------------- localStorage ---

/** Temporary fallback until V21's store module lands: read localStorage
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

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? esc(iso) : d.toLocaleDateString();
}

function windowLabel(campaign) {
  const w = campaign.window;
  if (!w) return 'Open-ended — no window';
  if (w.start && w.end) return `${fmtDate(w.start)} – ${fmtDate(w.end)}`;
  if (w.start) return `From ${fmtDate(w.start)}`;
  if (w.end) return `Until ${fmtDate(w.end)}`;
  return 'Open-ended — no window';
}

function demoBadge(campaign) {
  return campaign.demo ? ' <span class="demo-badge">DEMO</span>' : '';
}

function gameLinksHtml(game) {
  const links = game.links || {};
  const out = [];
  if (links.steam) out.push(`<a href="${esc(links.steam)}">Steam</a>`);
  if (links.itch) out.push(`<a href="${esc(links.itch)}">itch.io</a>`);
  if (links.x) out.push(`<a href="${esc(links.x)}">X</a>`);
  return out.join(' · ');
}

function campaignCardHtml(campaign, { showTurnButton = false } = {}) {
  const s = ringSummary(campaign);
  return `<article class="campaign-card" data-campaign-id="${esc(campaign.id)}">
    <h3><a href="#" data-open-campaign="${esc(campaign.id)}">${esc(campaign.title)}</a>${demoBadge(campaign)}</h3>
    <p class="anchor-preview">&ldquo;${esc(campaign.anchorPost.text)}&rdquo; — ${esc(campaign.anchorPost.author)}</p>
    <p class="campaign-meta">${esc(windowLabel(campaign))} · Posted ${s.posted}/${s.total}</p>
    ${showTurnButton ? `<button type="button" data-open-composer="${esc(campaign.id)}">Open quote composer</button>` : ''}
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
      render();
    });
  }

  function renderDashboard() {
    const game = store.game;
    const campaigns = store.campaigns || [];
    const live = liveCampaign(campaigns);
    const turn = yourTurn(campaigns, store.me);
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
          <h3>Live campaign</h3>
          ${live ? campaignCardHtml(live) : '<p>No live campaign yet. Start one and get the ring pushing.</p>'}
        </section>
        <section class="your-turn">
          <h3>Your turn</h3>
          ${turn.length ? turn.map((c) => campaignCardHtml(c, { showTurnButton: true })).join('') : '<p>Nothing owed — no quote-posts pending.</p>'}
        </section>
        <section class="your-rings">
          <h3>Your rings</h3>
          ${rings.length ? rings.map((c) => campaignCardHtml(c)).join('') : '<p>No campaigns yet.</p>'}
        </section>
      </section>`;

    rootEl.querySelector('#start-campaign').addEventListener('click', () => {
      view = 'create';
      render();
    });
    rootEl.querySelectorAll('[data-open-campaign]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        navigate('campaign', { campaignId: a.dataset.openCampaign });
      });
    });
    rootEl.querySelectorAll('[data-open-composer]').forEach((b) => {
      b.addEventListener('click', () => {
        navigate('composer', { campaignId: b.dataset.openComposer });
      });
    });
  }

  function renderCreate() {
    rootEl.innerHTML = `
      <section class="campaign-create">
        <h2>Start a campaign</h2>
        <p>For <strong>${esc(store.game.name)}</strong>. One post to amplify, a window, and the ring does the rest — in their own words, by hand.</p>
        <form id="campaign-create-form">
          <p class="form-error" id="create-errors" hidden></p>
          <label>Campaign title
            <input type="text" name="title" required autocomplete="off" placeholder="e.g. Launch week push">
          </label>
          <label>Anchor post platform
            <select name="platform">
              <option value="x">X</option>
              <option value="bluesky">Bluesky</option>
              <option value="threads">Threads</option>
            </select>
          </label>
          <label>Anchor post URL
            <input type="url" name="url" required placeholder="https://x.com/.../status/..." autocomplete="off">
          </label>
          <label>Anchor post text
            <textarea name="text" required rows="3" placeholder="Paste the post to amplify"></textarea>
          </label>
          <label>Anchor post author
            <input type="text" name="author" required placeholder="@yourhandle" autocomplete="off">
          </label>
          <label>Window start (optional)
            <input type="date" name="start">
          </label>
          <label>Window end (optional)
            <input type="date" name="end">
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
      if (!anchorPost.url) errors.push('Anchor post URL is required.');
      if (!anchorPost.text) errors.push('Anchor post text is required.');
      if (!anchorPost.author) errors.push('Anchor post author is required.');
      const errEl = rootEl.querySelector('#create-errors');
      if (errors.length) {
        errEl.textContent = errors.join(' ');
        errEl.hidden = false;
        return;
      }
      const start = String(data.get('start') || '').trim();
      const end = String(data.get('end') || '').trim();
      const campaign = createCampaign({
        game: store.game,
        title,
        anchorPost,
        window: start || end ? { start: start || null, end: end || null } : null,
        me: store.me,
      });
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
