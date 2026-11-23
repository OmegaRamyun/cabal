// V21 — localStorage wrapper for Cabal v0.2.
// All keys under cabal.v2.*. Every read/write is try/catch: missing storage
// (private mode, Node) or corrupt JSON yields sane defaults, never a throw.
// No credentials or tokens are stored here — game/campaign/me/demo only.

export const KEYS = Object.freeze({
  game: "cabal.v2.game",
  campaigns: "cabal.v2.campaigns",
  demo: "cabal.v2.demo",
  me: "cabal.v2.me",
  journal: "cabal.v2.journal",
});

// Storage-like adapter over a Map (used by createMemoryStore).
function mapStorage(map = new Map()) {
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => { map.clear(); },
  };
}

function defaultStorage() {
  try {
    const ls = globalThis.localStorage;
    if (ls && typeof ls.getItem === "function") return ls;
  } catch { /* private mode / no storage — fall through */ }
  return mapStorage();
}

/**
 * createStore(storage?) -> the full store API bound to `storage`
 * (defaults to globalThis.localStorage, in-memory fallback when absent).
 * createMemoryStore() is createStore() over a fresh in-memory Map — the
 * fallback used by tests (no localStorage in node).
 */
export function createStore(storage = defaultStorage()) {
  const readJson = (key, fallback) => {
    try {
      const raw = storage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };
  const writeJson = (key, value) => {
    try {
      if (value === null || value === undefined) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(value));
    } catch { /* storage full / unavailable: fail silent, keep defaults */ }
  };
  const remove = (key) => { try { storage.removeItem(key); } catch { /* ignore */ } };

  return {
    loadGame() {
      const v = readJson(KEYS.game, null);
      return v && typeof v === "object" && !Array.isArray(v) ? v : null;
    },
    saveGame(game) { writeJson(KEYS.game, game ?? null); },

    loadCampaigns() {
      const v = readJson(KEYS.campaigns, []);
      return Array.isArray(v) ? v : [];
    },
    saveCampaigns(list) { writeJson(KEYS.campaigns, Array.isArray(list) ? list : []); },

    loadMe() {
      const v = readJson(KEYS.me, null);
      return v && typeof v === "object" && !Array.isArray(v) ? v : null;
    },
    saveMe(me) { writeJson(KEYS.me, me ?? null); },

    demoFlag() {
      try {
        const v = storage.getItem(KEYS.demo);
        return v === "on" || v === "off" ? v : "off";
      } catch {
        return "off";
      }
    },
    setDemoFlag(v) {
      try {
        if (v === "on" || v === "off") storage.setItem(KEYS.demo, v);
      } catch { /* ignore */ }
    },

    clearAll() {
      for (const key of Object.values(KEYS)) remove(key);
    },
  };
}

export function createMemoryStore() {
  return createStore(mapStorage());
}

// Module-level API bound to the ambient storage (localStorage in the
// browser, in-memory fallback in Node / private mode).
const ambient = createStore();

export const loadGame = (...a) => ambient.loadGame(...a);
export const saveGame = (...a) => ambient.saveGame(...a);
export const loadCampaigns = (...a) => ambient.loadCampaigns(...a);
export const saveCampaigns = (...a) => ambient.saveCampaigns(...a);
export const loadMe = (...a) => ambient.loadMe(...a);
export const saveMe = (...a) => ambient.saveMe(...a);
export const demoFlag = (...a) => ambient.demoFlag(...a);
export const setDemoFlag = (...a) => ambient.setDemoFlag(...a);
export const clearAll = (...a) => ambient.clearAll(...a);
