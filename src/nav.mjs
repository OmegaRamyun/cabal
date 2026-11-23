// V57 — Navigation chrome, wayfinding, Lucide inline SVGs, and toast helper.
// Icons adapted from Lucide (https://lucide.dev), ISC License.
// Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022
// as part of Feather (MIT). All other copyright (c) for Lucide are held
// by Lucide Contributors 2022. ISC License.
//
// Mounts the mobile bottom tab bar, contextual detail back chevron + title,
// unified topbar icons/labels, and compact demo banner without editing
// index.html. Pure routing/wayfinding helpers are exported for unit tests.

export const LUCIDE_ATTRIBUTION =
  'Icons adapted from Lucide (https://lucide.dev), ISC License.';

export const NAV_ICONS = Object.freeze({
  // Lucide: house
  home: '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  // Lucide: share-2 / network nodes
  network: '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>',
  // Lucide: wrench
  tools: '<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  // Lucide: chevron-left
  chevronLeft: '<svg class="nav-icon nav-icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  // Lucide: share
  share: '<svg class="nav-icon nav-icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/></svg>',
  // Lucide: copy
  copy: '<svg class="nav-icon nav-icon--sm" viewBox="0 0 24 24" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
  // Lucide: info
  info: '<svg class="nav-icon nav-icon--sm" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  // Lucide: x
  close: '<svg class="nav-icon nav-icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
});

export const NAV_TABS = Object.freeze([
  Object.freeze({ id: 'home', href: '#/', label: 'Home', icon: 'home' }),
  Object.freeze({ id: 'discover', href: '#/campaigns', label: 'Network', icon: 'network' }),
  Object.freeze({ id: 'tools', href: '#/tools', label: 'Tools', icon: 'tools' }),
]);

export const DEMO_BANNER_SHORT =
  'Demo mode — fictional rings so you can explore Cabal.';

/**
 * navItemForRoute(view, opts?) -> 'home' | 'discover' | 'tools'
 * Maps a route view to its active tab. Ring/composer routes honor
 * opts.fromSection so rings reached from Network/Campaigns light the
 * Network tab, while defaulting to 'home' when omitted. Pure, tested.
 */
export function navItemForRoute(view = '', opts = {}) {
  if (
    view === 'discover' ||
    view === 'campaigns' ||
    view === 'campaigns-new' ||
    view === 'format'
  ) {
    return 'discover';
  }
  if (view === 'tools' || view === 'terms') {
    return 'tools';
  }
  if ((view === 'campaign' || view === 'composer') && opts?.fromSection === 'discover') {
    return 'discover';
  }
  return 'home';
}

/**
 * sectionForRoute(view, prevSection?) -> 'home' | 'discover'
 * Tracks which primary section the user came from so detail views
 * (like a ring page) keep the right active tab and back link. Pure, tested.
 */
export function sectionForRoute(view = '', prevSection = 'home') {
  if (
    view === 'campaigns' ||
    view === 'discover' ||
    view === 'format' ||
    view === 'campaigns-new'
  ) {
    return 'discover';
  }
  if (view === 'home' || view === 'rings') {
    return 'home';
  }
  return prevSection === 'discover' ? 'discover' : 'home';
}

/**
 * backTargetForRoute(parsed, opts?) -> { href, label, title } | null
 * Returns the contextual back-chevron destination and title for detail
 * routes, or null on top-level tab routes. Pure, tested.
 */
export function backTargetForRoute(parsed, opts = {}) {
  const view = parsed?.view || '';
  const fromDiscover = opts?.fromSection === 'discover';
  if (view === 'campaign') {
    return {
      href: fromDiscover ? '#/campaigns' : '#/',
      label: fromDiscover ? 'Network' : 'Home',
      title: String(opts?.title || 'Ring'),
    };
  }
  if (view === 'composer') {
    const id = parsed?.campaignId ? encodeURIComponent(parsed.campaignId) : '';
    return {
      href: id ? `#/campaign/${id}` : '#/',
      label: 'Ring',
      title: String(opts?.title || 'Quote composer'),
    };
  }
  if (view === 'format') {
    return {
      href: '#/campaigns',
      label: 'Network',
      title: String(opts?.title || 'Template'),
    };
  }
  if (view === 'campaigns-new') {
    return {
      href: '#/campaigns',
      label: 'Network',
      title: 'New campaign template',
    };
  }
  if (view === 'intro') {
    return {
      href: '#/',
      label: 'Home',
      title: String(opts?.title || 'What Cabal is'),
    };
  }
  if (view === 'terms') {
    return {
      href: '#/tools',
      label: 'Tools',
      title: 'Terms & disclaimer',
    };
  }
  return null;
}

// ----------------------------------------------------------------- DOM ---

let toastTimer = null;

/**
 * showToast(message, opts?) — transient status toast for copy actions.
 * Node-safe when document is absent.
 */
export function showToast(message, { durationMs = 2400, doc = globalThis.document } = {}) {
  if (!doc || !doc.body) return;
  let el = doc.querySelector('#cabal-toast');
  if (!el) {
    el = doc.createElement('div');
    el.id = 'cabal-toast';
    el.className = 'cabal-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    doc.body.appendChild(el);
  }
  el.textContent = String(message ?? '');
  el.classList.add('is-visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('is-visible');
  }, durationMs);
}

function upgradeTopbarNav(doc) {
  const nav = doc.querySelector('header nav');
  if (!nav) return;
  nav.classList.add('topbar-nav');
  const map = {
    home: { icon: NAV_ICONS.home, label: 'Home' },
    discover: { icon: NAV_ICONS.network, label: 'Network' },
    tools: { icon: NAV_ICONS.tools, label: 'Tools' },
  };
  nav.querySelectorAll('[data-nav]').forEach((item) => {
    const key = item.dataset.nav;
    const spec = map[key];
    if (!spec) return;
    const oldSvg = item.querySelector('svg');
    if (oldSvg) {
      const tpl = doc.createElement('template');
      tpl.innerHTML = spec.icon;
      oldSvg.replaceWith(tpl.content.firstChild);
    }
    const span = item.querySelector('span');
    if (span) span.textContent = spec.label;
    item.setAttribute('aria-label', spec.label);
  });
}

function compactDemoBanner(doc) {
  const banner = doc.querySelector('#demo-banner .cabal-demo-banner');
  if (!banner) return;
  const textSpan = banner.querySelector('span');
  if (textSpan) {
    textSpan.textContent = DEMO_BANNER_SHORT;
  }
  const buttons = [...banner.querySelectorAll('button')];
  // Hide the duplicate "Clear demo data" button; keep "Start with my own game".
  for (const btn of buttons) {
    if (/clear demo/i.test(btn.textContent || '')) {
      btn.hidden = true;
      btn.classList.add('demo-btn-duplicate');
    } else {
      btn.classList.add('btn-sm');
    }
  }
  if (!banner.querySelector('.demo-primer-link')) {
    const link = doc.createElement('a');
    link.href = '#/intro';
    link.className = 'demo-primer-link';
    link.textContent = 'How it works';
    const firstBtn = buttons.find((b) => !b.hidden);
    if (firstBtn) banner.insertBefore(link, firstBtn);
    else banner.appendChild(link);
  }
}

function ensureBottomTabBar(doc) {
  let bar = doc.querySelector('.bottom-tab-bar');
  if (bar) return bar;
  bar = doc.createElement('nav');
  bar.className = 'bottom-tab-bar';
  bar.setAttribute('aria-label', 'Primary navigation');
  for (const tab of NAV_TABS) {
    const a = doc.createElement('a');
    a.href = tab.href;
    a.className = 'bottom-tab-item';
    a.dataset.nav = tab.id;
    a.setAttribute('aria-label', tab.label);
    a.innerHTML = `${NAV_ICONS[tab.icon]}<span class="bottom-tab-label">${tab.label}</span>`;
    bar.appendChild(a);
  }
  doc.body.appendChild(bar);
  return bar;
}

function ensureBackBar(doc) {
  let bar = doc.querySelector('#detail-back-bar');
  if (bar) return bar;
  const main = doc.querySelector('main');
  if (!main) return null;
  bar = doc.createElement('div');
  bar.id = 'detail-back-bar';
  bar.className = 'detail-back-bar';
  bar.hidden = true;
  const link = doc.createElement('a');
  link.className = 'detail-back-link';
  link.href = '#/';
  link.innerHTML = `${NAV_ICONS.chevronLeft}<span class="detail-back-label">Back</span>`;
  const title = doc.createElement('span');
  title.className = 'detail-back-title';
  bar.append(link, title);
  const view = doc.querySelector('#view');
  if (view && view.parentNode === main) main.insertBefore(bar, view);
  else main.prepend(bar);
  return bar;
}

/**
 * mountChrome(doc) — mounts the unified nav icons, mobile bottom tab bar,
 * contextual detail back bar, and compact demo banner. Returns { update }.
 */
export function mountChrome(doc = globalThis.document) {
  if (!doc || !doc.body) {
    return { update() {} };
  }
  upgradeTopbarNav(doc);
  compactDemoBanner(doc);
  ensureBottomTabBar(doc);
  const backBar = ensureBackBar(doc);

  return {
    update(parsed, opts = {}) {
      const current = navItemForRoute(parsed?.view, opts);
      doc.querySelectorAll('[data-nav]').forEach((el) => {
        if (el.dataset.nav === current) el.setAttribute('aria-current', 'page');
        else el.removeAttribute('aria-current');
      });
      if (!backBar) return;
      const target = backTargetForRoute(parsed, opts);
      if (!target) {
        backBar.hidden = true;
        return;
      }
      const link = backBar.querySelector('.detail-back-link');
      const labelEl = backBar.querySelector('.detail-back-label');
      const titleEl = backBar.querySelector('.detail-back-title');
      if (link) link.href = target.href;
      if (labelEl) labelEl.textContent = target.label;
      if (titleEl) titleEl.textContent = target.title;
      backBar.hidden = false;
    },
  };
}
