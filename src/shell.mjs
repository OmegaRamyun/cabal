// V55 — App shell helpers: tokens/font config, non-sticky dismissible banners,
// duplicate demo-exit button cleanup, and route scroll reset.
// Pure functions are exported for unit tests; mount() wires DOM enhancements
// without touching app.js or demo.mjs.

export const DEMO_DISMISS_KEY = 'cabal.v55.demoBannerDismissed';
export const UPDATE_DISMISS_KEY = 'cabal.v55.updateBannerDismissed';

export const SHELL_TOKENS = Object.freeze({
  topbarHeightPx: 56,
  desktopBreakpointPx: 1024,
  radiusPx: 4,
  radiusSmPx: 3,
  fadeDurationMs: 600,
  surfaces: Object.freeze({
    ground: '#0b0908',
    panel: 'rgba(20, 16, 13, 0.86)',
    raised: '#1c1612',
    overlay: '#251d18',
  }),
  accents: Object.freeze({
    ember: '#c8501e',
    emberDeep: '#a84318',
    gold: '#c9a24a',
    bone: '#d8cfc0',
    muted: '#9a8f7e',
  }),
});

export const FONT_MANIFEST = Object.freeze([
  Object.freeze({
    family: 'Cinzel',
    role: 'display',
    weights: Object.freeze([400, 600]),
    subsets: Object.freeze(['latin', 'latin-ext']),
    license: 'vendor/fonts/cinzel/LICENSE',
    files: Object.freeze([
      'vendor/fonts/cinzel/cinzel-latin-400-normal.woff2',
      'vendor/fonts/cinzel/cinzel-latin-ext-400-normal.woff2',
      'vendor/fonts/cinzel/cinzel-latin-600-normal.woff2',
      'vendor/fonts/cinzel/cinzel-latin-ext-600-normal.woff2',
    ]),
  }),
  Object.freeze({
    family: 'Inter',
    role: 'ui',
    weights: Object.freeze([400, 500, 600, 700]),
    subsets: Object.freeze(['latin', 'latin-ext']),
    license: 'vendor/fonts/inter/LICENSE',
    files: Object.freeze([
      'vendor/fonts/inter/inter-latin-400-normal.woff2',
      'vendor/fonts/inter/inter-latin-ext-400-normal.woff2',
      'vendor/fonts/inter/inter-latin-500-normal.woff2',
      'vendor/fonts/inter/inter-latin-ext-500-normal.woff2',
      'vendor/fonts/inter/inter-latin-600-normal.woff2',
      'vendor/fonts/inter/inter-latin-ext-600-normal.woff2',
      'vendor/fonts/inter/inter-latin-700-normal.woff2',
      'vendor/fonts/inter/inter-latin-ext-700-normal.woff2',
    ]),
  }),
]);

/**
 * findDuplicateDemoButton(buttons) -> button | null
 * Both "Clear demo data" and "Start with my own game" run the exact same
 * demo-exit handler in app.js. When both are present, return the redundant
 * "Clear demo data" button so the shell can remove it. Pure, tested.
 */
export function findDuplicateDemoButton(buttons = []) {
  const list = Array.from(buttons || []);
  let clearBtn = null;
  let hasStartFresh = false;
  for (const btn of list) {
    const label = String(btn?.textContent ?? '').trim().toLowerCase();
    if (label === 'clear demo data') clearBtn = btn;
    if (label === 'start with my own game') hasStartFresh = true;
  }
  return hasStartFresh ? clearBtn : null;
}

/** isDismissed(storage, key) -> boolean (safe on missing/throwing storage). */
export function isDismissed(storage, key) {
  try {
    return storage?.getItem?.(key) === '1';
  } catch {
    return false;
  }
}

/** markDismissed(storage, key) -> boolean */
export function markDismissed(storage, key) {
  try {
    if (typeof storage?.setItem !== 'function') return false;
    storage.setItem(key, '1');
    return true;
  } catch {
    return false;
  }
}

function getSessionStorage(win) {
  try {
    return win?.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * enhanceDemoBanner(container, opts) — removes the duplicate demo-exit button,
 * strips the awkward leading em-dash if present, and appends a dismiss button
 * so the non-sticky demo notice is one clean dismissible line.
 */
export function enhanceDemoBanner(container, opts = {}) {
  if (!container) return false;
  const banner = container.querySelector?.('.cabal-demo-banner');
  if (!banner) return false;

  const storage = opts.storage !== undefined ? opts.storage : getSessionStorage(opts.win ?? globalThis);
  if (isDismissed(storage, DEMO_DISMISS_KEY)) {
    banner.hidden = true;
    return true;
  }

  const dup = findDuplicateDemoButton(banner.querySelectorAll?.('button'));
  if (dup && typeof dup.remove === 'function') dup.remove();

  // Clean up leading " — " from the demo copy so it reads cleanly inline.
  const copy = banner.querySelector?.('span');
  if (copy && typeof copy.textContent === 'string' && /^\s*—\s*/.test(copy.textContent)) {
    copy.textContent = copy.textContent.replace(/^\s*—\s*/, '');
  }

  if (!banner.querySelector?.('.banner-dismiss')) {
    const doc = banner.ownerDocument ?? opts.doc ?? globalThis.document;
    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'banner-dismiss';
    closeBtn.setAttribute('aria-label', 'Dismiss demo notice');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => {
      banner.hidden = true;
      markDismissed(storage, DEMO_DISMISS_KEY);
    });
    banner.appendChild(closeBtn);
  }
  return true;
}

/**
 * enhanceUpdateBanner(container, opts) — adds a dismiss button to the
 * non-sticky update banner so the user can dismiss it without reloading.
 */
export function enhanceUpdateBanner(container, opts = {}) {
  if (!container) return false;
  const banner = container.querySelector?.('.cabal-update-banner');
  if (!banner) return false;

  if (!banner.querySelector?.('.banner-dismiss')) {
    const doc = banner.ownerDocument ?? opts.doc ?? globalThis.document;
    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'banner-dismiss';
    closeBtn.setAttribute('aria-label', 'Dismiss update notice');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => {
      banner.hidden = true;
    });
    banner.appendChild(closeBtn);
  }
  return true;
}

/**
 * resetScroll(win, doc) — resets scroll position for both window and
 * internally scrollable app-shell panes on route change so headings never
 * open clipped or mid-scroll.
 */
export function resetScroll(win = globalThis, doc = globalThis.document) {
  try {
    if (typeof win?.scrollTo === 'function') win.scrollTo(0, 0);
  } catch {
    // Ignore in restricted contexts.
  }
  if (!doc || typeof doc.querySelectorAll !== 'function') return;
  for (const el of doc.querySelectorAll('main, #view, #home-extras, #campaign-extras')) {
    if (el && typeof el.scrollTop === 'number') el.scrollTop = 0;
  }
}

/**
 * mount(doc, win) — observes #demo-banner and #update-banner so enhancements
 * apply regardless of script execution order, and resets scroll on hashchange.
 */
export function mount(doc = globalThis.document, win = globalThis) {
  if (!doc) return { destroy() {} };

  const demoEl = doc.querySelector?.('#demo-banner');
  const updateEl = doc.querySelector?.('#update-banner');
  const observers = [];

  if (demoEl) {
    enhanceDemoBanner(demoEl, { doc, win });
    if (typeof win?.MutationObserver === 'function') {
      const obs = new win.MutationObserver(() => enhanceDemoBanner(demoEl, { doc, win }));
      obs.observe(demoEl, { childList: true });
      observers.push(obs);
    }
  }

  if (updateEl) {
    enhanceUpdateBanner(updateEl, { doc, win });
    if (typeof win?.MutationObserver === 'function') {
      const obs = new win.MutationObserver(() => enhanceUpdateBanner(updateEl, { doc, win }));
      obs.observe(updateEl, { childList: true });
      observers.push(obs);
    }
  }

  const onHashChange = () => resetScroll(win, doc);
  win?.addEventListener?.('hashchange', onHashChange);

  return {
    destroy() {
      for (const obs of observers) obs.disconnect();
      win?.removeEventListener?.('hashchange', onHashChange);
    },
  };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mount(document, window), { once: true });
  } else {
    mount(document, window);
  }
}
