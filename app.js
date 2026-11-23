// Cabal v0.2 — campaign-first shell: router + store wiring + demo seeding.
// No feature code lives here beyond routing; each view is a src module.
// Routes (hash-based, no server):
//   #/                    home — your game dashboard
//   #/campaign/<id>       campaign page — whole ring + join + share link
//   #/composer/<id>       quote composer for that campaign
//   #/discover            similar + popular campaigns
//   #/tools               campaign tools (Kickstarter, Steam, Discord, checklist)
//   #/terms               disclaimers and terms
//   #/intro[/how|/theory] intro pages — what Cabal is, how it works, the theory
//   #c=<payload>          link intent — opens the app straight into a campaign

import { createStore } from './src/store.mjs';
import { decodeCampaignLink, markContributed } from './src/campaign.mjs';
import * as home from './src/home.mjs';
import * as campaignPage from './src/campaign-page.mjs';
import * as quoteComposer from './src/quote-composer.mjs';
import * as discovery from './src/discovery.mjs';
import * as demo from './src/demo.mjs';
import * as updater from './src/updater.mjs';
import * as terms from './src/terms.mjs';
import * as discord from './src/discord.mjs';
import * as kickstarter from './src/kickstarter.mjs';
import * as steam from './src/steam.mjs';
import * as checklist from './src/checklist.mjs';
import * as intro from './src/intro.mjs';
import * as background from './src/background.mjs';
import * as gamify from './src/gamify.mjs';

const backend = createStore();

/**
 * makeStore(backend) — the live store object home/campaign-page expect
 * (plain fields + save functions), backed by V21's localStorage store.
 * Getters read fresh every time, so views always see the latest state.
 */
export function makeStore(b) {
  return {
    get game() {
      return b.loadGame();
    },
    set game(v) {
      b.saveGame(v);
    },
    get campaigns() {
      return b.loadCampaigns();
    },
    set campaigns(v) {
      b.saveCampaigns(v);
    },
    get me() {
      return b.loadMe();
    },
    set me(v) {
      b.saveMe(v);
    },
    saveGame: (g) => b.saveGame(g),
    saveCampaigns: (l) => b.saveCampaigns(l),
    saveMe: (m) => b.saveMe(m),
  };
}

const store = makeStore(backend);

/**
 * firstPostIdsFor(campaigns) -> [`<campaignId>:<postId>`, ...] — the
 * composite key of each ring's founding post. The journal needs these
 * to tell a kindle on a later post (Second Wind) from one on the first
 * post. Pure, tested.
 */
export function firstPostIdsFor(campaigns = []) {
  const ids = [];
  for (const c of campaigns || []) {
    const first = c && Array.isArray(c.posts) ? c.posts[0] : null;
    if (c && c.id && first && first.id) ids.push(`${c.id}:${first.id}`);
  }
  return ids;
}

/** parseHash(hash) -> { view, campaignId?, hash? } — pure, tested. */
export function parseHash(hash = '') {
  const h = String(hash || '');
  if (h.startsWith('#c=')) return { view: 'link', hash: h };
  const parts = h
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean);
  if (parts.length === 0) return { view: 'home' };
  const [view, param] = parts;
  if (view === 'campaign' && param) {
    return { view: 'campaign', campaignId: decodeURIComponent(param) };
  }
  if (view === 'composer' && param) {
    return { view: 'composer', campaignId: decodeURIComponent(param) };
  }
  if (view === 'discover') return { view: 'discover' };
  if (view === 'tools') return { view: 'tools' };
  if (view === 'terms') return { view: 'terms' };
  if (view === 'intro') {
    return { view: 'intro', pageId: param || 'intro' };
  }
  return { view: 'home' };
}

/**
 * navItemForView(view) -> 'home' | 'discover' | 'tools' — which top-bar
 * item is current for a route. Campaign, composer, intro and link-intent
 * land on Home; Terms lives under the Tools gear menu. Pure, tested.
 */
export function navItemForView(view = '') {
  if (view === 'discover') return 'discover';
  if (view === 'tools' || view === 'terms') return 'tools';
  return 'home';
}

function syncNav(view) {
  const current = navItemForView(view);
  document.querySelectorAll('[data-nav]').forEach((el) => {
    if (el.dataset.nav === current) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
}

function wireToolsMenu() {
  const button = document.querySelector('#tools-menu-button');
  const list = document.querySelector('#tools-menu-list');
  if (!button || !list) return;
  const close = () => {
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const willOpen = list.hidden;
    list.hidden = !willOpen;
    button.setAttribute('aria-expanded', String(willOpen));
  });
  document.addEventListener('click', (event) => {
    if (!list.hidden && !event.target.closest('.nav-menu')) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !list.hidden) {
      close();
      button.focus();
    }
  });
  list.addEventListener('click', (event) => {
    if (event.target.closest('a')) close();
  });
}

function navigate(view, params = {}) {
  if (view === 'campaign' && params.campaignId) {
    window.location.hash = `#/campaign/${encodeURIComponent(params.campaignId)}`;
  } else if (view === 'composer' && params.campaignId) {
    window.location.hash = `#/composer/${encodeURIComponent(params.campaignId)}`;
  } else {
    window.location.hash = '#/';
  }
}

let staticCache = null;

async function loadStaticCampaigns() {
  if (staticCache) return staticCache;
  try {
    const res = await fetch('data/campaigns.json');
    const data = await res.json();
    staticCache = Array.isArray(data.campaigns) ? data.campaigns : [];
  } catch {
    staticCache = [];
  }
  return staticCache;
}

async function findCampaign(id) {
  const local = store.campaigns.find((c) => c.id === id);
  if (local) return local;
  const statics = await loadStaticCampaigns();
  return statics.find((c) => c.id === id) || null;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderNotFound(view, id) {
  view.innerHTML = `<section><h2>Campaign not found</h2><p>No campaign with id ${esc(id)} here — it may have been cleared with the demo data. <a href="#/">Back to home</a>.</p></section>`;
}

function renderCampaign(view, id) {
  return findCampaign(id).then((campaign) => {
    if (!campaign) {
      renderNotFound(view, id);
      return;
    }
    view.textContent = '';
    campaignPage.mount(view, {
      store,
      navigate,
      campaign,
      onPassOn: ({ campaignId, postId }) => {
        gamify.record('passon', { campaignId, postId });
      },
    });
    // Kindled hooks for the inline composers: one textarea per
    // unassisted X/Bluesky post slot. Each watches its own post's text
    // with a per-post draft id, so a kindle lands on the right post.
    // (The old single `#campaign-composer textarea` hook is gone — the
    // feed renders one composer slot per post now.)
    const firstPostIds = firstPostIdsFor(store.campaigns);
    view.querySelectorAll('[data-composer-post]').forEach((slot) => {
      const postId = slot.dataset.composerPost;
      const post = (campaign.posts || []).find((p) => p.id === postId);
      const textarea = slot.querySelector('textarea');
      if (!textarea || !post) return;
      gamify.trackRevision(textarea, {
        anchorText: post.text ?? '',
        draftId: `${campaign.id}:${post.id}`,
        firstPostIds,
      });
    });
  });
}

function renderComposer(view, id) {
  return findCampaign(id).then((campaign) => {
    if (!campaign) {
      renderNotFound(view, id);
      return;
    }
    view.textContent = '';
    // Standalone composer route targets the founding post (the
    // composer's own default when no ctx.post is given).
    const target =
      (campaign.posts && campaign.posts[0]) || campaign.anchorPost || null;
    const handle = quoteComposer.mount(view, {
      campaign,
      me: store.me,
      onPosted: (quoteUrl, draft) => {
        const me = store.me;
        if (me && me.handle && target && target.id) {
          const updated = markContributed(campaign, target.id, me.handle, {
            url: quoteUrl || undefined,
            quoteText: String(draft || '').trim() || undefined,
          });
          const list = store.campaigns;
          const idx = list.findIndex((c) => c.id === campaign.id);
          if (idx >= 0) list[idx] = updated;
          else list.push(updated);
          store.saveCampaigns(list);
        }
        navigate('campaign', { campaignId: id });
      },
    });
    // Kindled: watch this draft for a flagged-then-genuinely-reworked revision.
    if (handle && handle.textarea && target) {
      gamify.trackRevision(handle.textarea, {
        anchorText: target.text ?? '',
        draftId: `${campaign.id}:${target.id}`,
        firstPostIds: firstPostIdsFor(store.campaigns),
      });
    }
    // Rest Point: the per-post pre-post checklist, persisted under
    // cabal.v2.checklist.<id>.<postId>. The Voice Card rides along as a
    // local reference while writing. Ready -> record("rest").
    const checkSlot = document.createElement('section');
    view.appendChild(checkSlot);
    checklist.mount(checkSlot, {
      campaignId: id,
      postId: target ? target.id : undefined,
      onReadyChange: (ready, info) => {
        if (ready) {
          gamify.record('rest', { campaignId: id, postId: info.postId });
        }
      },
    });
  });
}

function renderDiscover(view) {
  return loadStaticCampaigns().then((statics) => {
    const merged = discovery.mergeLists(statics, store.campaigns);
    view.textContent = '';
    discovery.mount(view, {
      myTags: (store.game && store.game.tags) || [],
      campaigns: merged,
      navigate: (campaign) => {
        gamify.record('discover', { campaignId: campaign.id });
        window.location.hash = `#/campaign/${encodeURIComponent(campaign.id)}`;
      },
    });
  });
}

function renderIntro(view, pageId) {
  const pageIds = intro.introPageIds();
  const page = intro.getIntroPage(pageId) || intro.getIntroPage('intro');
  view.textContent = '';
  intro.mount(view, page.id);
  gamify.record('page', { pageId: page.id, pageIds });
}

/**
 * renderHomeExtras() — the Home-only slot below #view: a pointer to the
 * primer + the private field journal. It lives in #home-extras (a sibling
 * of #view inside <main>), NOT inside #view: home.mjs re-renders by
 * overwriting #view's innerHTML on interactions, which would wipe
 * anything appended there. Re-mounted fresh on every route() so the
 * journal never goes stale; emptied on non-home routes.
 */
function renderHomeExtras(view) {
  const slot = document.querySelector('#home-extras');
  if (!slot) return;
  slot.textContent = '';
  if (view !== 'home') return;
  const explainer = document.createElement('p');
  explainer.className = 'explainer';
  const link = document.createElement('a');
  link.href = '#/intro';
  link.textContent = 'What Cabal is';
  explainer.append('New here? Read ', link, ' — the primer, three short pages.');
  slot.appendChild(explainer);
  const journalSlot = document.createElement('div');
  slot.appendChild(journalSlot);
  gamify.mount(journalSlot, {
    pageIds: intro.introPageIds(),
    firstPostIds: firstPostIdsFor(store.campaigns),
  });
}

function renderTools(view) {
  view.textContent = '';
  const heading = document.createElement('h2');
  heading.textContent = 'Campaign tools';
  view.appendChild(heading);
  const explainer = document.createElement('p');
  explainer.className = 'explainer';
  explainer.textContent =
    'Helpers for a launch campaign. They serve a campaign — they are not the app.';
  view.appendChild(explainer);

  const live = home.liveCampaign(store.campaigns);
  if (live) {
    const section = document.createElement('section');
    const h = document.createElement('h3');
    h.textContent = 'Announce this campaign on Discord';
    section.appendChild(h);
    const note = document.createElement('p');
    note.className = 'explainer';
    note.textContent = `For “${live.title}”. Copy this into your ring's Discord channel; the campaign link itself is shared by hand.`;
    section.appendChild(note);
    const pre = document.createElement('pre');
    pre.textContent = discord.buildCampaignAnnouncement(live).content;
    section.appendChild(pre);
    view.appendChild(section);
  }

  for (const [title, mod] of [
    ['Kickstarter planner', kickstarter],
    ['Steam links', steam],
    ['Discord #rings', discord],
    ['Pre-post checklist', checklist],
  ]) {
    const section = document.createElement('section');
    const h = document.createElement('h3');
    h.textContent = title;
    section.appendChild(h);
    const mountEl = document.createElement('div');
    section.appendChild(mountEl);
    view.appendChild(section);
    mod.mount(mountEl);
  }
}

function renderTerms(view) {
  view.textContent = '';
  terms.mount(view);
}

async function route() {
  const view = document.querySelector('#view');
  if (!view) return;
  const parsed = parseHash(window.location.hash);
  syncNav(parsed.view);
  renderHomeExtras(parsed.view);
  if (parsed.view === 'link') {
    const { campaign, error } = decodeCampaignLink(parsed.hash);
    if (error || !campaign) {
      view.innerHTML = `<p class="form-error">That campaign link could not be opened: ${esc(error || 'unknown error')}</p>`;
      const holder = document.createElement('div');
      view.appendChild(holder);
      home.mount(holder, { store, navigate });
      return;
    }
    const list = store.campaigns;
    if (!list.some((c) => c.id === campaign.id)) {
      store.saveCampaigns([...list, campaign]);
    }
    window.history.replaceState(null, '', `#/campaign/${encodeURIComponent(campaign.id)}`);
    await renderCampaign(view, campaign.id);
    return;
  }
  switch (parsed.view) {
    case 'campaign':
      await renderCampaign(view, parsed.campaignId);
      break;
    case 'composer':
      await renderComposer(view, parsed.campaignId);
      break;
    case 'discover':
      await renderDiscover(view);
      break;
    case 'tools':
      renderTools(view);
      break;
    case 'terms':
      renderTerms(view);
      break;
    case 'intro':
      renderIntro(view, parsed.pageId);
      break;
    case 'home':
    default:
      view.textContent = '';
      home.mount(view, { store, navigate });
      break;
  }
}

function renderDemoBanner() {
  const banner = document.querySelector('#demo-banner');
  if (!banner) return;
  banner.textContent = '';
  if (backend.demoFlag() !== 'on') return;
  demo.mount(banner, {
    onClear: () => {
      demo.clearDemo(globalThis.localStorage);
      window.location.reload();
    },
    onStartFresh: () => {
      demo.clearDemo(globalThis.localStorage);
      window.location.reload();
    },
  });
}

function start() {
  demo.seedDemo(globalThis.localStorage);
  renderDemoBanner();
  wireToolsMenu();
  // Shadow Cabal backdrop (V34): fixed canvas + scrim behind the app.
  // Mounted once, before the first route; forced dark (see index.html)
  // keeps the canvas and the cards on the same ground.
  try {
    background.mount(document.body, {});
  } catch {
    // A failed backdrop must never take the app down.
  }
  // Auto-updater: version.json baseline at load, 60s poll + focus/visible
  // re-checks, banner only — never a forced reload (see src/updater.mjs).
  const updateEl = document.querySelector('#update-banner');
  if (updateEl) updater.mount(updateEl, {});
  window.addEventListener('hashchange', route);
  route();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}
