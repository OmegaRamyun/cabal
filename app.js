// Cabal v0.2 — campaign-first shell: router + store wiring + demo seeding.
// No feature code lives here beyond routing; each view is a src module.
// Routes (hash-based, no server):
//   #/                    home — your game dashboard
//   #/campaign/<id>       campaign page — whole ring + join + share link
//   #/composer/<id>       quote composer for that campaign
//   #/discover            similar + popular campaigns
//   #/tools               campaign tools (Kickstarter, Steam, Discord, checklist)
//   #/terms               disclaimers and terms
//   #c=<payload>          link intent — opens the app straight into a campaign

import { createStore } from './src/store.mjs';
import { decodeCampaignLink, markPosted } from './src/campaign.mjs';
import * as home from './src/home.mjs';
import * as campaignPage from './src/campaign-page.mjs';
import * as quoteComposer from './src/quote-composer.mjs';
import * as discovery from './src/discovery.mjs';
import * as demo from './src/demo.mjs';
import * as terms from './src/terms.mjs';
import * as discord from './src/discord.mjs';
import * as kickstarter from './src/kickstarter.mjs';
import * as steam from './src/steam.mjs';
import * as checklist from './src/checklist.mjs';

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
  return { view: 'home' };
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
    campaignPage.mount(view, { store, navigate, campaign });
  });
}

function renderComposer(view, id) {
  return findCampaign(id).then((campaign) => {
    if (!campaign) {
      renderNotFound(view, id);
      return;
    }
    view.textContent = '';
    quoteComposer.mount(view, {
      campaign,
      me: store.me,
      onPosted: (quoteUrl, draft) => {
        const me = store.me;
        if (me && me.handle) {
          const updated = markPosted(campaign, me.handle, quoteUrl || undefined);
          const member = (updated.members || []).find(
            (mm) => String(mm.handle).trim().toLowerCase() === String(me.handle).trim().toLowerCase(),
          );
          if (member && String(draft || '').trim()) member.quoteText = String(draft).trim();
          const list = store.campaigns;
          const idx = list.findIndex((c) => c.id === campaign.id);
          if (idx >= 0) list[idx] = updated;
          else list.push(updated);
          store.saveCampaigns(list);
        }
        navigate('campaign', { campaignId: id });
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
        window.location.hash = `#/campaign/${encodeURIComponent(campaign.id)}`;
      },
    });
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
