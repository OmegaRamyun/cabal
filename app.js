// Cabal v0.2 — campaign-first shell: router + store wiring + demo seeding.
// No feature code lives here beyond routing; each view is a src module.
// Routes (hash-based, no server):
//   #/                    home — your game dashboard ("My Rings")
//   #/rings[/<formatId>]   same dashboard; with a format id, the create
//                          view opens with that format preselected
//   #/campaign/<id>       campaign page — whole ring + join + share link
//   #/composer/<id>       quote composer for that campaign
//   #/discover            legacy route to the Campaigns view
//   #/campaigns           Campaigns — ONE node view (V53): rings +
//                          templates as nodes, edges from real data
//   #/campaigns/new       New post format (V49 create form, renamed V69)
//   #/format/<id>         one campaign template's page
//   #/tools               campaign tools (Kickstarter, Steam, Discord, checklist)
//   #/terms               disclaimers and terms
//   #/intro[/how|/theory] intro pages — what Cabal is, how it works, the theory
//   #c=<payload>          link intent — opens the app straight into a campaign

import { createStore } from './src/store.mjs';
import { decodeCampaignLink, markContributed } from './src/campaign.mjs';
import * as nostr from './src/nostr.mjs';
import * as firstRun from './src/first-run.mjs';
import * as inviteLanding from './src/invite-landing.mjs';
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
import * as formats from './src/campaign-formats.mjs';
import * as userFormats from './src/user-formats.mjs';
import * as popularity from './src/popularity.mjs';
import * as graph from './src/graph.mjs';
import * as nodeView from './src/node-view.mjs';
import * as navChrome from './src/nav.mjs';
import { mergeSyncedIntoStore } from './src/sync-target.mjs';

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

/**
 * openNodeTarget(node) -> { view: 'campaign', campaignId } |
 * { view: 'format', formatId } | null — where a node-view tap goes.
 * Ring nodes open the ring page, format nodes the template page.
 * node.ref is the bare ring/format id (V51 prefixes node.id with kind).
 * Pure, tested.
 */
export function openNodeTarget(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.kind === 'ring' && typeof node.ref === 'string' && node.ref) {
    return { view: 'campaign', campaignId: node.ref };
  }
  if (node.kind === 'format' && typeof node.ref === 'string' && node.ref) {
    return { view: 'format', formatId: node.ref };
  }
  return null;
}

/**
 * nodeViewGraph({ rings, formats, usage }, { width, height }) ->
 * { graph, positions } — the node view's input, built from the same lists
 * the old discovery view used. Pure, tested. `positions` is attached to
 * the graph as well as returned top-level: the node view reads positions
 * from `graph.positions` (V52 ctx contract), so a bare graph without
 * them renders the empty state. The radiusFor adapter the mount site
 * passes is (n) => graph.radiusForWeight(n.weight, n.kind); it lives in
 * renderCampaigns, not here, because layout and drawing must share one
 * radius function at the mount site.
 */
export function nodeViewGraph({ rings, formats, usage } = {}, { width = 800, height = 520 } = {}) {
  const g = graph.buildGraph({ rings, formats, usage });
  const positions = graph.layoutGraph(g, { width, height });
  return { graph: { ...g, positions }, positions };
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
  if (view === 'rings') {
    return { view: 'rings', formatId: param ? decodeURIComponent(param) : null };
  }
  if (view === 'campaigns' && param === 'new') return { view: 'campaigns-new' };
  if (view === 'campaigns') return { view: 'campaigns' };
  if (view === 'format' && param) {
    return { view: 'format', formatId: decodeURIComponent(param) };
  }
  if (view === 'tools') {
    // V65: Theory lives in Tools/Docs now.
    if (param === 'theory') return { view: 'intro', pageId: 'theory' };
    return { view: 'tools' };
  }
  if (view === 'terms') return { view: 'terms' };
  if (view === 'intro') {
    return { view: 'intro', pageId: param || 'intro' };
  }
  return { view: 'home' };
}

let lastSection = 'home';
let chrome = null;

/**
 * navItemForView(view, opts?) -> 'home' | 'discover' | 'tools' — which tab
 * is current for a route. Campaign/composer routes honor opts.fromSection
 * so rings opened from Network/Campaigns light the Network tab; defaults to
 * 'home' when omitted. Pure, tested.
 */
export function navItemForView(view = '', opts = {}) {
  return navChrome.navItemForRoute(view, opts);
}

function syncNav(view, opts = {}) {
  const current = navItemForView(view, opts);
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
  } else if (view === 'format' && params.formatId) {
    window.location.hash = `#/format/${encodeURIComponent(params.formatId)}`;
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
  // V64: the not-found page IS the invite landing's dead-link card —
  // friendly copy, never a raw id. (Its heading is "Ring not found",
  // which also completes the V65 Ring copy standardization.)
  inviteLanding.mount(view, { campaign: null });
}

/** Clear the demo banner (V64: invite loads never show it). */
function hideDemoBanner() {
  document.querySelector('#demo-banner')?.replaceChildren();
}

/**
 * renderSyncPanel(campaign) — the Nostr sync panel (V44, V47) in
 * #campaign-extras, a sibling of #view (same pattern as renderHomeExtras:
 * campaign-page.mjs re-renders by overwriting #view's innerHTML, which
 * would wipe anything appended there). Mounted fresh on every campaign
 * route; emptied on other routes by route(). Takes the campaign
 * findCampaign() already resolved, so static listed campaigns (e.g.
 * ToonSouls) get a panel too — they stay read-only (no key, Publish
 * disabled) and are only written to localStorage if a sync actually
 * changed them. onMerged merges by id (mergeSyncedIntoStore) instead of
 * replacing the whole stored list, and re-renders only the campaign
 * page, so the panel keeps its "Synced. N updates merged." message.
 */
function renderSyncPanel(campaign) {
  const slot = document.querySelector('#campaign-extras');
  if (!slot) return;
  slot.textContent = '';
  slot.hidden = true;
  if (!campaign) return;
  const campaignId = campaign.id;
  const original = JSON.parse(JSON.stringify(campaign));
  const view = document.querySelector('#view');
  const details = document.createElement('details');
  details.className = 'ring-sync-sheet';
  const summary = document.createElement('summary');
  summary.className = 'ring-sync-summary';
  summary.innerHTML = '<span>Relay sync settings (Nostr)</span><span class="relay-status-chip">Advanced</span>';
  const body = document.createElement('div');
  body.className = 'ring-sync-body';
  details.append(summary, body);
  slot.appendChild(details);
  nostr.mount(body, {
    campaign,
    getCampaigns: () => store.campaigns,
    me: store.me,
    onMerged: (list) => {
      store.saveCampaigns(mergeSyncedIntoStore(store.campaigns, list, original));
      // Re-render the page only ({ sync: false }) so the panel keeps its
      // "Synced. N updates merged." message.
      if (view) renderCampaign(view, campaignId, { sync: false });
    },
  });
}

function renderCampaign(view, id, opts = {}) {
  return findCampaign(id).then(async (campaign) => {
    if (!campaign) {
      hideDemoBanner();
      renderNotFound(view, id);
      return;
    }
    // V64: a ring the viewer hasn't joined gets the dedicated invite
    // landing, not the ring page. Removed viewers keep today's behaviour.
    // Pass the viewer's name too: a handle-less creator (me.handle === '')
    // is recognised by their unclaimed seed member, not routed to join
    // their own ring.
    if (inviteLanding.isInviteLanding(campaign, store.me?.handle, store.me?.name)) {
      hideDemoBanner();
      view.textContent = '';
      inviteLanding.mount(view, {
        campaign,
        me: store.me,
        onJoin: (updated, member) => {
          // Persist like campaign-page's syncCampaignToStore:
          // replace/insert in store.campaigns, save me, re-render inside.
          const list = [...(store.campaigns || [])];
          const idx = list.findIndex((c) => c.id === updated.id);
          if (idx >= 0) list[idx] = updated;
          else list.push(updated);
          store.saveCampaigns(list);
          store.saveMe(member);
          store.me = member;
          renderCampaign(view, id, opts);
        },
      });
      return;
    }
    chrome?.update({ view: 'campaign', campaignId: id }, { fromSection: lastSection, title: campaign.title });
    view.textContent = '';
    campaignPage.mount(view, {
      store,
      navigate,
      campaign,
      onTabChange: (tab) => {
        const extras = document.querySelector('#campaign-extras');
        if (extras) extras.hidden = tab !== 'sync';
      },
      onPassOn: ({ campaignId, postId }) => {
        gamify.record('passon', { campaignId, postId });
      },
      // V66: completing an assist (Enscryption) unlocks the Field Journal.
      onAssist: () => {
        gamify.record('assist', {});
      },
      // V43c seam: the page already removed the member locally and synced
      // the store. Republish the updated membership to the relays (V43b)
      // so every client honors the removal — the invite link stays stable
      // (spec §17c). Best-effort: a failed republish never undoes the
      // local removal; the sync panel can retry it.
      onMemberRemoved: async ({ campaignId, handle }) => {
        const list = store.campaigns;
        const campaign = list.find((c) => c.id === campaignId);
        if (!campaign) return;
        try {
          const { relays } = nostr.loadRelays(globalThis.localStorage);
          const client = nostr.createRelayClient({ relays });
          await nostr.publishRemoval(client, campaign, { by: store.me?.handle });
        } catch {
          // Local removal stands; relay republish retries from the panel.
        }
      },
      // V60: ring-page templates section — formats + rings + usage for the
      // pickers, and adoption/removal callbacks that republish the ring's
      // kind-30078 event so relays learn the new template list.
      // Best-effort, same as the removal republish above.
      formats: await loadMergedFormats(),
      rings: store.campaigns,
      usage: usageCache,
      onTemplateAdopted: async ({ campaign: updated }) => {
        if (!updated || !nostr.hasCampaignKey(updated)) return;
        try {
          const { relays } = nostr.loadRelays(globalThis.localStorage);
          const client = nostr.createRelayClient({ relays });
          await nostr.publishAdoption(client, updated);
        } catch {
          // Local adoption stands; relay republish retries from the panel.
        }
      },
      onTemplateRemoved: async ({ campaign: updated }) => {
        if (!updated || !nostr.hasCampaignKey(updated)) return;
        try {
          const { relays } = nostr.loadRelays(globalThis.localStorage);
          const client = nostr.createRelayClient({ relays });
          await nostr.publishAdoption(client, updated);
        } catch {
          // Local removal stands; relay republish retries from the panel.
        }
      },
    });
    if (opts.sync !== false) renderSyncPanel(campaign);
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

let formatsCache = null;

/** loadFormats() — data/formats.json, cached per load like staticCache. */
async function loadFormats() {
  if (formatsCache) return formatsCache;
  try {
    const res = await fetch('data/formats.json');
    const data = await res.json();
    formatsCache = Array.isArray(data.formats) ? data.formats : [];
  } catch {
    formatsCache = [];
  }
  return formatsCache;
}

/**
 * loadMergedFormats() — seed formats + the user's own templates (V49).
 * User templates live in localStorage, never in data/formats.json.
 * Every route that looks a format up by id uses this, so a template
 * you just made never shows "not found".
 */
async function loadMergedFormats() {
  const seeds = await loadFormats();
  return userFormats.mergeFormats(seeds, userFormats.loadUserFormats());
}

// Template usage, queried once per page load (V46). usageCache is the
// V46 Map (id -> { rings: Set, assists: n }); usageNoteCache is the
// honest-limits line shown with any count, or the couldn't-reach line
// when no relay answered. Null until the first query resolves.
let usageCache = null;
let usageNoteCache = null;

async function loadFormatUsage(formatIds) {
  if (usageCache) return usageCache;
  const configured = nostr.loadRelays(globalThis.localStorage).relays;
  const relays = configured.length ? configured : [...nostr.DEFAULT_RELAYS];
  // V48 verifier fix: the one-off client is closed in `finally` — it used
  // to leak its WebSockets for the life of the page.
  const client = nostr.createRelayClient({ relays });
  try {
    const res = await popularity.queryFormatUsage(client, formatIds, { timeoutMs: 6000 });
    usageCache = res.usage;
    usageNoteCache =
      res.relaysAnswered === 0
        ? "Couldn't reach the relays — usage counts hidden."
        : res.relaysAnswered < res.relaysTotal
          ? `${popularity.popularityNote()} Some relays didn't answer, so counts are partial.`
          : popularity.popularityNote();
    return usageCache;
  } catch {
    usageCache = new Map();
    usageNoteCache = "Couldn't reach the relays — usage counts hidden.";
    return usageCache;
  } finally {
    try { client.close(); } catch { /* ignore */ }
  }
}

/**
 * renderCampaigns(view) — the "Campaigns" view is ONE node view (V53):
 * rings + templates as nodes, edges from real data (V51 graph, V52
 * view). #/discover is the legacy route to the same view. Mounts
 * immediately with local data, then re-mounts with usage counts when the
 * relay query returns (only if still on this route). Best-effort: a
 * failed query leaves the unranked view, never an error.
 */
async function renderCampaigns(view) {
  const formatsList = await loadMergedFormats();
  const statics = await loadStaticCampaigns();
  const merged = discovery.mergeLists(statics, store.campaigns);
  const mountIt = (usage) => {
    view.textContent = '';
    const { graph: g, positions } = nodeViewGraph(
      { rings: merged, formats: formatsList, usage: usage || null },
    );
    // V60: template nodes are the people who posted them — the panel roster
    // is built from the same rings as the graph, keyed by lowercase format id.
    const postersByFormat = new Map();
    for (const f of formatsList) {
      const posters = formats.postersForFormat(f.id, merged);
      if (posters.length) postersByFormat.set(String(f.id).toLowerCase(), posters);
    }
    nodeView.mount(view, {
      graph: g,
      positions,
      postersByFormat,
      // The radius adapter the V51 verifier required: layout and drawing
      // share one radius function, or the net crowds (see verify-v52.md).
      radiusFor: (n) => graph.radiusForWeight(n.weight, n.kind),
      usageNote: usage ? usageNoteCache : null,
      onOpenNode: (node) => {
        const target = openNodeTarget(node);
        if (!target) return;
        if (target.view === 'campaign') {
          gamify.record('discover', { campaignId: target.campaignId });
          window.location.hash = `#/campaign/${encodeURIComponent(target.campaignId)}`;
        } else {
          navigate('format', { formatId: target.formatId });
        }
      },
      onStartRing: () => { window.location.hash = '#/rings'; },
      // V69: the "New post format" action only fires for rings with 2+
      // devs. Without a handler the node view falls back to
      // #/campaigns/new, where mountCreate shows the locked state.
      onNewTemplate: formats.canCreateFormat(store.campaigns, store.me)
        ? () => { window.location.hash = '#/campaigns/new'; }
        : undefined,
    });
  };
  mountIt(usageCache);
  if (!usageCache) {
    loadFormatUsage(formatsList.map((f) => f.id)).then(() => {
      // Exact route match via parseHash: '#/campaigns/new' is a different
      // view and must never be clobbered by this re-mount — the old
      // startsWith('#/campaigns') guard wiped a half-filled template
      // form the moment the relay query resolved.
      const p = parseHash(window.location.hash);
      if (p.view === 'campaigns' || p.view === 'discover') {
        mountIt(usageCache);
      }
    });
  }
}

/**
 * renderFormat(view, formatId) — one campaign template's page (V45):
 * tagline, guidance, example uses, rings running it, "Start a ring".
 * Unknown ids get a not-found message, not a crash.
 */
async function renderFormat(view, formatId) {
  const formatsList = await loadMergedFormats();
  const format = formatsList.find(
    (f) => String(f.id).toLowerCase() === String(formatId).toLowerCase(),
  );
  view.textContent = '';
  if (!format) {
    view.innerHTML = `<section><h2>Template not found</h2><p>No template with id ${esc(formatId)} here. <a href="#/campaigns">Back to Network</a>.</p></section>`;
    return;
  }
  chrome?.update({ view: 'format', formatId: format.id }, { fromSection: lastSection, title: format.tagline });
  const statics = await loadStaticCampaigns();
  const rings = discovery.mergeLists(statics, store.campaigns);
  const mountIt = (usage) => {
    view.textContent = '';
    formats.mount(view, {
      formats: formatsList,
      formatId: format.id,
      rings,
      usage: usage || null,
      usageNote: usage ? usageNoteCache : null,
      navigate: (c) => navigate('campaign', { campaignId: c.id }),
      startHref: `#/rings/${encodeURIComponent(format.id)}`,
      // V60: wire the adopt picker to the live store, and republish the
      // ring's kind-30078 event so relays learn the new template.
      // Best-effort: a failed republish never undoes the local adoption;
      // the sync panel can retry it.
      store,
      me: store.me,
      myRings: store.campaigns,
      onAdopt: async (updatedRing) => {
        if (!nostr.hasCampaignKey(updatedRing)) return;
        try {
          const { relays } = nostr.loadRelays(globalThis.localStorage);
          const client = nostr.createRelayClient({ relays });
          await nostr.publishAdoption(client, updatedRing);
        } catch {
          // Local adoption stands; relay republish retries from the panel.
        }
      },
    });
  };
  mountIt(usageCache);
  if (!usageCache) {
    loadFormatUsage(formatsList.map((f) => f.id)).then(() => {
      // Case-insensitive: the route matched the id case-insensitively.
      if (window.location.hash.toLowerCase().startsWith(`#/format/${encodeURIComponent(format.id)}`)) {
        mountIt(usageCache);
      }
    });
  }
}

/**
 * renderRings(view, formatId?) — the "My Rings" view is the home
 * dashboard (V45). With a formatId (from a format page's "Start a
 * ring" link, `#/rings/<formatId>`), the id is validated against the
 * loaded formats and handed to home.mount, which opens the create
 * view with the format preselected. Unknown ids are ignored.
 */
/**
 * renderNewTemplate(view) — the "New post format" form (V49, renamed V69):
 * tagline + description + how-to, saved to localStorage by onCreate,
 * then straight to the new template's page.
 */
function renderNewTemplate(view) {
  view.textContent = '';
  formats.mountCreate(view, {
    // V69: gate the form on 2+ devs (locked state otherwise).
    rings: store.campaigns,
    me: store.me,
    onCreate: (f) => userFormats.addUserFormat(f),
    onCreated: (f) => { window.location.hash = `#/format/${encodeURIComponent(f.id)}`; },
    onCancel: () => { window.location.hash = '#/campaigns'; },
  });
}

async function renderRings(view, formatId) {
  view.textContent = '';
  let format = null;
  if (formatId) {
    const formatsList = await loadMergedFormats();
    format =
      formatsList.find((f) => String(f.id).toLowerCase() === String(formatId).toLowerCase()) ||
      null;
  }
  home.mount(view, {
    store,
    navigate,
    ...(format ? { formatId: format.id, formatTagline: format.tagline } : {}),
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
  // V48: #/rings IS the home dashboard under its own route, so it gets
  // the primer link + field journal exactly like #/ does.
  if (view !== 'home' && view !== 'rings') return;
  const journalSlot = document.createElement('div');
  slot.appendChild(journalSlot);
  gamify.mount(journalSlot, {
    pageIds: intro.introPageIds(),
    firstPostIds: firstPostIdsFor(store.campaigns),
    // V66: the journal only renders after the user's first assist (or a
    // real assist already in the rings) — pass the evidence through.
    campaigns: store.campaigns,
    me: store.me,
  });
}

function renderTools(view) {
  view.textContent = '';
  const header = document.createElement('header');
  header.className = 'cabal-page-header';
  const mainHead = document.createElement('div');
  mainHead.className = 'cabal-page-header-main';
  const heading = document.createElement('h2');
  heading.textContent = 'Ring tools';
  mainHead.appendChild(heading);
  const explainer = document.createElement('p');
  explainer.className = 'view-lede';
  explainer.textContent =
    'Optional helpers for your game\u2019s launch rings.';
  mainHead.appendChild(explainer);
  header.appendChild(mainHead);
  view.appendChild(header);

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

  // V65: Theory lives in Tools/Docs now (reference, not onboarding).
  const docsSec = document.createElement('section');
  const docsH = document.createElement('h3');
  docsH.textContent = 'Reference docs';
  docsSec.appendChild(docsH);
  const docsP = document.createElement('p');
  docsP.className = 'view-lede';
  docsP.innerHTML = '<a href="#/tools/theory">The theory</a> — why rings work the way they do. <a href="#/intro/how">How rings work</a>.';
  docsSec.appendChild(docsP);
  view.appendChild(docsSec);

  // V66: the Field Journal lives here once unlocked — explicit open
  // (forceShow) so a user who earned it can always find it.
  const journalSec = document.createElement('section');
  const journalH = document.createElement('h3');
  journalH.textContent = 'Field journal';
  journalSec.appendChild(journalH);
  const journalMount = document.createElement('div');
  journalSec.appendChild(journalMount);
  view.appendChild(journalSec);
  gamify.mount(journalMount, {
    pageIds: intro.introPageIds(),
    firstPostIds: firstPostIdsFor(store.campaigns),
    campaigns: store.campaigns,
    me: store.me,
    forceShow: true,
  });

  const termsSec = document.createElement('section');
  termsSec.className = 'tools-disclaimer';
  termsSec.innerHTML =
    '<h3 class="section-eyebrow">Terms &amp; disclaimer</h3><p class="view-lede">Cabal is for promoting your own games. A disclaimer states the terms; it is not a shield. <a href="#/terms">Read the full terms</a> &middot; <a href="#/intro">What Cabal is</a>.</p>';
  view.appendChild(termsSec);
}

function renderTerms(view) {
  view.textContent = '';
  terms.mount(view);
}

async function route() {
  const view = document.querySelector('#view');
  if (!view) return;
  if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
    window.scrollTo(0, 0);
  }
  const parsed = parseHash(window.location.hash);
  lastSection = navChrome.sectionForRoute(parsed.view, lastSection);
  syncNav(parsed.view, { fromSection: lastSection });
  chrome?.update(parsed, { fromSection: lastSection });
  renderHomeExtras(parsed.view);
  // The sync panel slot is re-mounted by renderCampaign when applicable;
  // clear it here so a stale panel never survives a route change.
  const extras = document.querySelector('#campaign-extras');
  if (extras) {
    extras.textContent = '';
    extras.hidden = true;
  }
  if (parsed.view === 'link') {
    // Short Nostr link first (#c=<naddr>[&k=<key>]): fetch the campaign
    // from the relays (V44, spec §14). The key rides in the fragment only
    // and is attached to the merged campaign — the relay never sees it.
    // Relays: the user's configured list, else the relays embedded in the
    // naddr, else the suggested defaults (used for this fetch only — the
    // panel's opt-in list is not auto-configured).
    const frag = nostr.parseCampaignLinkFragment(parsed.hash);
    if (frag) {
      const configured = nostr.loadRelays(globalThis.localStorage).relays;
      const relays = configured.length
        ? configured
        : (frag.relays.length ? frag.relays : [...nostr.DEFAULT_RELAYS]);
      const client = nostr.createRelayClient({ relays });
      const merged = await nostr.syncCampaign(client, store.campaigns, frag.campaignId, frag.pubkey);
      let campaign = merged.campaigns.find((c) => c.id === frag.campaignId);
      if (!campaign) {
        view.innerHTML = '<p class="form-error">Couldn\'t reach the relays to open this ring. Check your connection and try again — or ask a member for the full campaign link (it works offline).</p>';
        const holder = document.createElement('div');
        view.appendChild(holder);
        home.mount(holder, { store, navigate });
        return;
      }
      if (frag.key) campaign = { ...campaign, key: frag.key };
      store.saveCampaigns(merged.campaigns.map((c) => (c.id === campaign.id ? campaign : c)));
      window.history.replaceState(null, '', `#/campaign/${encodeURIComponent(campaign.id)}`);
      await renderCampaign(view, campaign.id);
      return;
    }
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
    case 'campaigns':
      await renderCampaigns(view);
      break;
    case 'campaigns-new':
      renderNewTemplate(view);
      break;
    case 'rings':
      await renderRings(view, parsed.formatId);
      break;
    case 'format':
      await renderFormat(view, parsed.formatId);
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
      // V61: cold users (no rings, no demo opt-in) get the first-run
      // screen, not someone else's dashboard. Only on home, not #/rings.
      if (firstRun.shouldShowFirstRun({ campaigns: store.campaigns, demoFlag: backend.demoFlag() })) {
        firstRun.mount(view, {
          onStartRing: () => { window.location.hash = '#/rings'; },
          onOpenInvite: (h) => { window.location.hash = h; },
          onSeeDemo: () => {
            demo.optInDemo(globalThis.localStorage);
            window.location.reload();
          },
        });
        break;
      }
      home.mount(view, { store, navigate });
      break;
  }
  // V61/V67: sticky bottom "Start a ring" CTA while ringless. Hidden on
  // #/rings itself (already creating) and once the user has a real ring.
  const ctaSlot = document.querySelector('#ringless-cta-slot');
  if (ctaSlot) {
    if (parsed.view === 'rings') {
      ctaSlot.textContent = '';
      document.body.classList.remove('has-ringless-cta');
    } else {
      const shown = firstRun.mountStickyCta(ctaSlot, {
        campaigns: store.campaigns,
        demoFlag: backend.demoFlag(),
        onStartRing: () => { window.location.hash = '#/rings'; },
      });
      document.body.classList.toggle('has-ringless-cta', !!shown);
    }
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
  // V61: no cold-load demo seeding — demo loads only on opt-in
  // (first-run screen's "See a demo ring").
  renderDemoBanner();
  chrome = navChrome.mountChrome(document);
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
