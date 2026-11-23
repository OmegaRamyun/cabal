// V29 — Auto-updater: version.json polling + "new version" banner.
// Never force-reloads. The banner waits; only a tap on Refresh reloads
// the page. A Refresh tap with an unsent composer draft asks once
// ("Discard draft & refresh") so a draft is never lost silently. No
// service worker, no build step, no new dependencies: plain fetch + DOM.
// The version baked in at load is the first successful fetch — that is
// the baseline; a later fetch that differs shows the banner. After a
// refresh the new version is the baseline, so there is no reload loop.

export const VERSION_URL = 'version.json';
export const POLL_INTERVAL_MS = 60000;

/** parseVersion(data) -> { version, updatedAt } or null when malformed. */
export function parseVersion(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const version = typeof data.version === 'string' ? data.version.trim() : '';
  if (!version) return null;
  const updatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : '';
  return { version, updatedAt };
}

/** isNewer(remote, loaded) — true only when both are known and differ. */
export function isNewer(remote, loaded) {
  if (!remote || !loaded) return false;
  return remote.version !== loaded.version;
}

/**
 * hasUnsentDraft(doc) — true when any composer textarea in `doc` holds
 * non-empty text. Takes a doc-like (querySelectorAll); a doc without one
 * has no draft. Whitespace-only text is not a draft.
 */
export function hasUnsentDraft(doc) {
  const q = doc?.querySelectorAll;
  if (typeof q !== 'function') return false;
  for (const ta of q.call(doc, 'textarea.quote-draft')) {
    if (String(ta.value ?? '').trim() !== '') return true;
  }
  return false;
}

/**
 * Refresh-button state machine (pure). Tap with no draft -> reload at
 * once. Tap with a draft -> ask once ("Discard draft & refresh"); the
 * second tap reloads. Returns { reload, confirming, label }.
 */
export function refreshAction({ hasDraft, confirming }) {
  if (!hasDraft) return { reload: true, confirming: false, label: 'Refresh' };
  if (!confirming) return { reload: false, confirming: true, label: 'Discard draft & refresh' };
  return { reload: true, confirming: false, label: 'Refresh' };
}

/** fetchVersion(fetchFn, url) -> parsed version or null, never throws. */
export async function fetchVersion(fetchFn, url = VERSION_URL) {
  try {
    const res = await fetchFn(url, { cache: 'no-store' });
    if (!res || typeof res.json !== 'function') return null;
    return parseVersion(await res.json());
  } catch {
    return null;
  }
}

/** defaultFetchVersion(url) — real fetch in the browser, null in Node. */
export function defaultFetchVersion(url = VERSION_URL) {
  const f = globalThis.fetch;
  if (typeof f !== 'function') return Promise.resolve(null);
  return fetchVersion(f, url);
}

/**
 * mount(rootEl, ctx) — renders the (hidden) banner, establishes the
 * baseline on the first good fetch, then polls every `intervalMs` and
 * re-checks on visibilitychange / window focus.
 * ctx: { loadedVersion?, fetchVersion?, intervalMs?, win?, reload?,
 *   onUpdate? }. reload defaults to win.location.reload(); pass a stub
 * in tests. Returns { banner, button, check, show, stop, destroy,
 *   loaded, shown }.
 */
export function mount(rootEl, ctx = {}) {
  const doc = rootEl.ownerDocument;
  const win = ctx.win ?? globalThis;
  const fetchVersionFn = ctx.fetchVersion ?? defaultFetchVersion;
  const intervalMs = ctx.intervalMs ?? POLL_INTERVAL_MS;
  const reload = ctx.reload ?? (() => win.location.reload());
  const onUpdate = ctx.onUpdate;

  let loaded = ctx.loadedVersion ?? null;
  let shown = false;
  let confirming = false;
  let timer = null;
  let destroyed = false;

  const banner = doc.createElement('div');
  banner.className = 'cabal-update-banner';
  banner.setAttribute('role', 'status');
  banner.hidden = true;
  const text = doc.createElement('span');
  text.className = 'cabal-update-text';
  text.textContent = 'A new version is available.';
  const button = doc.createElement('button');
  button.className = 'cabal-update-refresh';
  button.type = 'button';
  button.textContent = 'Refresh';
  banner.append(text, button);
  rootEl.append(banner);

  function show(remote) {
    if (shown) return;
    shown = true;
    confirming = false;
    button.textContent = 'Refresh';
    if (remote?.version) text.textContent = `A new version is available (${remote.version}).`;
    banner.hidden = false;
    if (typeof onUpdate === 'function') onUpdate(remote);
  }

  async function check() {
    if (destroyed) return;
    const remote = await fetchVersionFn();
    if (!remote) return; // offline / bad file: stay quiet, retry next poll
    if (!loaded) {
      loaded = remote; // first good fetch is the baseline
      return;
    }
    if (isNewer(remote, loaded)) show(remote);
  }

  function onRefreshClick() {
    const action = refreshAction({ hasDraft: hasUnsentDraft(doc), confirming });
    confirming = action.confirming;
    button.textContent = action.label;
    if (action.reload) reload();
  }

  function onVisibility() {
    if (!doc.hidden) void check();
  }
  function onFocus() {
    void check();
  }

  button.addEventListener('click', onRefreshClick);

  function start() {
    void check(); // establish the baseline promptly, then poll
    timer = setInterval(() => void check(), intervalMs);
    doc.addEventListener('visibilitychange', onVisibility);
    win.addEventListener('focus', onFocus);
  }

  function stop() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('focus', onFocus);
  }

  function destroy() {
    destroyed = true;
    stop();
    button.removeEventListener('click', onRefreshClick);
    banner.remove();
  }

  start();
  return {
    banner,
    button,
    check,
    show,
    stop,
    destroy,
    get loaded() {
      return loaded;
    },
    get shown() {
      return shown;
    },
  };
}
