// V49 — user-created campaign templates (formats), kept in localStorage.
// `data/formats.json` is seed/repo data; user data never goes there.
// Pure helpers, storage injected for tests (same pattern as src/nostr.mjs).
// No network, no scores, no per-user keys.

import { normalizeFormat, validateFormat } from "./campaign-formats.mjs";

export const USER_FORMATS_KEY = "cabal.v2.formats";

function storageOf(storage) {
  if (storage) return storage;
  try { if (globalThis.localStorage?.getItem) return globalThis.localStorage; } catch { /* none */ }
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

/** Tolerant read: bad JSON, wrong shape, or invalid entries -> dropped. Never throws. */
export function loadUserFormats(storage) {
  let raw = null;
  try {
    const s = storageOf(storage).getItem(USER_FORMATS_KEY);
    raw = s == null ? null : JSON.parse(s);
  } catch { raw = null; }
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const f = normalizeFormat(item);
    if (validateFormat(f).length > 0 || seen.has(f.id)) continue;
    seen.add(f.id);
    out.push(f);
  }
  return out;
}

/** Saves valid, id-unique formats; returns the list actually stored. */
export function saveUserFormats(formats, storage) {
  const seen = new Set();
  const list = [];
  for (const item of Array.isArray(formats) ? formats : []) {
    const f = normalizeFormat(item);
    if (validateFormat(f).length > 0 || seen.has(f.id)) continue;
    seen.add(f.id);
    list.push(f);
  }
  try { storageOf(storage).setItem(USER_FORMATS_KEY, JSON.stringify(list)); } catch { /* quota/private mode */ }
  return list;
}

/** Append one format (replacing an entry with the same id). Returns the stored list. */
export function addUserFormat(format, storage) {
  const f = normalizeFormat(format);
  return saveUserFormats([...loadUserFormats(storage).filter((x) => x.id !== f.id), f], storage);
}

/**
 * Seed order first, user formats appended. Dedupe by id ONLY (never by
 * tagline): on an id clash the seed wins and the user entry is dropped.
 */
export function mergeFormats(seedFormats, userFormats) {
  const out = [];
  const seen = new Set();
  for (const f of [...(Array.isArray(seedFormats) ? seedFormats : []), ...(Array.isArray(userFormats) ? userFormats : [])]) {
    if (!f || typeof f !== "object" || typeof f.id !== "string" || !f.id) continue;
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    out.push(f);
  }
  return out;
}
