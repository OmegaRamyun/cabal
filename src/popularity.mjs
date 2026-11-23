// V46 — Template popularity detection via Nostr relay events.
// Pure counting, sorting, display labels, filter builder, and best-effort
// relay-query helper consuming src/nostr.mjs's relay client (never edits it).
// No server, no click tracking, no X API, no per-user scores, no assist totals shown.

import { KIND_CAMPAIGN, KIND_NOTE } from "./nostr.mjs";

export const FORMAT_TAG_PREFIX = "cabal:format:";
export const DEFAULT_TIMEOUT_MS = 5000;

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const cleanId = (v) => (typeof v === "string" ? v.trim() : "");

/** Build the exact Nostr tag referencing a template format: ["t", "cabal:format:<id>"]. */
export function formatTag(formatId) {
  const id = cleanId(formatId);
  return id ? ["t", `${FORMAT_TAG_PREFIX}${id}`] : null;
}

/** Extract unique non-empty format IDs from an event's tags array. */
function extractTagFormatIds(tags) {
  if (!Array.isArray(tags)) return [];
  const found = new Set();
  for (const t of tags) {
    if (!Array.isArray(t) || t.length < 2) continue;
    if (t[0] !== "t" || typeof t[1] !== "string") continue;
    if (!t[1].startsWith(FORMAT_TAG_PREFIX)) continue;
    const id = t[1].slice(FORMAT_TAG_PREFIX.length).trim();
    if (id) found.add(id);
  }
  return [...found];
}

function ringCountOf(entry) {
  if (!entry || typeof entry !== "object") return 0;
  if (entry.rings instanceof Set) return entry.rings.size;
  if (Array.isArray(entry.rings)) return entry.rings.length;
  if (typeof entry.rings === "number" && Number.isFinite(entry.rings) && entry.rings > 0) {
    return Math.floor(entry.rings);
  }
  return 0;
}

function assistCountOf(entry) {
  if (!entry || typeof entry !== "object") return 0;
  if (typeof entry.assists === "number" && Number.isFinite(entry.assists) && entry.assists > 0) {
    return Math.floor(entry.assists);
  }
  return 0;
}

function lookupUsage(usageMap, id) {
  if (!usageMap || !id) return null;
  if (usageMap instanceof Map) return usageMap.get(id) ?? null;
  if (typeof usageMap === "object" && Object.prototype.hasOwnProperty.call(usageMap, id)) {
    return usageMap[id] ?? null;
  }
  return null;
}

/**
 * countFormatUsage(events) -> Map<formatId, { rings: Set<pubkey>, assists: number }>
 *  - Campaign events (kind 30078): read formatId from content JSON when present,
 *    else from ["t", "cabal:format:<id>"]. Dedupe rings by pubkey (not event id).
 *    Malformed non-empty content is ignored.
 *  - Note events (kind 1): read tag only. Count as an assist for that format
 *    (never attributed to a ring — assists are not rings).
 *  - Unknown kinds, missing format refs, and malformed inputs are ignored.
 *    Never throws.
 */
export function countFormatUsage(events) {
  const usage = new Map();
  if (!Array.isArray(events)) return usage;

  const ensure = (formatId) => {
    let entry = usage.get(formatId);
    if (!entry) {
      entry = { rings: new Set(), assists: 0 };
      usage.set(formatId, entry);
    }
    return entry;
  };

  const seenIds = new Set();

  for (const ev of events) {
    if (!isPlainObject(ev)) continue;

    if (typeof ev.id === "string" && ev.id) {
      if (seenIds.has(ev.id)) continue;
      seenIds.add(ev.id);
    }

    if (ev.kind === KIND_CAMPAIGN) {
      const pubkey = cleanId(ev.pubkey);
      if (!pubkey) continue;

      let formatId = "";
      if (ev.content !== undefined && ev.content !== null) {
        if (typeof ev.content !== "string") continue;
        const trimmed = ev.content.trim();
        if (trimmed.length > 0) {
          let parsed;
          try {
            parsed = JSON.parse(trimmed);
          } catch {
            continue;
          }
          if (!isPlainObject(parsed)) continue;
          if (typeof parsed.formatId === "string" && parsed.formatId.trim()) {
            formatId = parsed.formatId.trim();
          }
        }
      }

      if (!formatId) {
        const tagIds = extractTagFormatIds(ev.tags);
        if (tagIds.length > 0) formatId = tagIds[0];
      }
      if (!formatId) continue;

      ensure(formatId).rings.add(pubkey);
    } else if (ev.kind === KIND_NOTE) {
      const tagIds = extractTagFormatIds(ev.tags);
      for (const formatId of tagIds) {
        ensure(formatId).assists += 1;
      }
    }
  }

  return usage;
}

/**
 * sortFormatsByUsage(formats, usageMap) -> NEW array of formats.
 * Most-used first:
 *  1. Distinct ring count (desc)
 *  2. Assist count (desc)
 *  3. Format id (asc, deterministic)
 * Formats with no usage (0 rings and 0 assists, or absent) sort last in their
 * existing order. Accepts a Map or plain object for usageMap.
 */
export function sortFormatsByUsage(formats, usageMap) {
  if (!Array.isArray(formats)) return [];

  return formats
    .map((format, idx) => {
      const id = cleanId(format?.id);
      const entry = lookupUsage(usageMap, id);
      const rings = ringCountOf(entry);
      const assists = assistCountOf(entry);
      return {
        format,
        idx,
        id,
        rings,
        assists,
        hasUsage: rings > 0 || assists > 0,
      };
    })
    .sort((a, b) => {
      if (a.hasUsage !== b.hasUsage) return a.hasUsage ? -1 : 1;
      if (!a.hasUsage) return a.idx - b.idx;
      if (b.rings !== a.rings) return b.rings - a.rings;
      if (b.assists !== a.assists) return b.assists - a.assists;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : a.idx - b.idx;
    })
    .map((x) => x.format);
}

/**
 * usageLabel(usage) -> "Used by 1 ring" | "Used by N rings" | "".
 * The ONLY display string for a format's usage. Zero or unknown returns "".
 * Never displays "0 rings", assist totals, or a rank number.
 */
export function usageLabel(usage) {
  if (usage == null) return "";
  let n = 0;
  if (typeof usage === "number") {
    n = Number.isFinite(usage) && usage > 0 ? Math.floor(usage) : 0;
  } else if (typeof usage === "object") {
    n = ringCountOf(usage);
  }
  if (n <= 0) return "";
  return n === 1 ? "Used by 1 ring" : `Used by ${n} rings`;
}

/**
 * One-line honest-limits note for wherever template usage counts are shown.
 */
export function popularityNote() {
  return "Usage counts only Nostr-synced rings on the relays you query — rings shared purely by link or on X aren't counted.";
}

/**
 * filtersForFormat(formatId) -> Nostr NIP-01 filter object for querying relays
 * for events referencing a format, or null for an invalid/empty formatId.
 */
export function filtersForFormat(formatId) {
  const id = cleanId(formatId);
  if (!id) return null;
  return {
    kinds: [KIND_NOTE, KIND_CAMPAIGN],
    "#t": [`${FORMAT_TAG_PREFIX}${id}`],
  };
}

function readRelayStatus(client) {
  try {
    const st = typeof client?.status === "function" ? client.status() : null;
    if (!isPlainObject(st)) return { relaysAnswered: 0, relaysTotal: 0 };
    const vals = Object.values(st);
    return {
      relaysAnswered: vals.filter((v) => v === "connected").length,
      relaysTotal: vals.length,
    };
  } catch {
    return { relaysAnswered: 0, relaysTotal: 0 };
  }
}

/**
 * queryFormatUsage(client, formatIds, { timeoutMs }?) ->
 *   Promise<{ usage: Map, relaysAnswered: number, relaysTotal: number }>
 * Subscribes the relay client to filtersForFormat for each format id, collects
 * events until EOSE or timeout, and counts usage. Best-effort: a relay failing
 * or timing out yields partial results from answering relays, never throws.
 */
export async function queryFormatUsage(client, formatIds, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const timeout = typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_TIMEOUT_MS;

  const uniqueIds = Array.isArray(formatIds)
    ? [...new Set(formatIds.map(cleanId).filter(Boolean))]
    : [];
  const filters = uniqueIds.map(filtersForFormat).filter(Boolean);

  if (!client || typeof client.fetch !== "function" || filters.length === 0) {
    const { relaysTotal } = readRelayStatus(client);
    return { usage: new Map(), relaysAnswered: 0, relaysTotal };
  }

  let timer;
  try {
    const fetchPromise = Promise.resolve()
      .then(() => client.fetch(filters, { waitMs: timeout }))
      .then((events) => ({ ok: true, timedOut: false, events: Array.isArray(events) ? events : [] }))
      .catch(() => ({ ok: false, timedOut: false, events: [] }));

    // Safety guard slightly past waitMs so createRelayClient's own timeout wins first,
    // while a broken client that ignores waitMs still cannot hang indefinitely.
    const guardPromise = new Promise((resolve) => {
      timer = setTimeout(() => resolve({ ok: false, timedOut: true, events: [] }), timeout + 50);
    });

    const result = await Promise.race([fetchPromise, guardPromise]);
    clearTimeout(timer);

    const { relaysAnswered, relaysTotal } = readRelayStatus(client);
    if (!result.ok && !result.timedOut) {
      return { usage: new Map(), relaysAnswered: 0, relaysTotal };
    }
    return {
      usage: countFormatUsage(result.events),
      relaysAnswered,
      relaysTotal,
    };
  } catch {
    clearTimeout(timer);
    const { relaysTotal } = readRelayStatus(client);
    return { usage: new Map(), relaysAnswered: 0, relaysTotal };
  }
}
