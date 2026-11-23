// V51 — Node graph model. Pure functions only: no DOM, no storage, no network,
// no Math.random, no Date. V52 renders what this returns.
//
//   buildGraph({ rings, formats, usage }) -> { nodes, edges }
//   radiusForWeight(weight, kind)         -> px radius
//   layoutGraph(graph, { width, height }) -> Map<nodeId, { x, y }>
//
// Nothing is invented: a node exists only for a listable ring or a format
// that some ring really uses; a weight is a real member count or a real
// distinct-ring usage count; an edge comes from real shared data.

import { isListable } from "./discovery.mjs";
import {
  ringsRunningFormat,
  toUsageMap,
} from "./campaign-formats.mjs";

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v) => (typeof v === "string" ? v.trim() : "");
const lc = (v) => str(v).toLowerCase();

export const RING_PREFIX = "ring:";
export const FORMAT_PREFIX = "format:";

// Radius model: r = BASE + SCALE * sqrt(weight), capped at MAX. The sqrt
// keeps area roughly proportional to weight; the cap stops a huge node
// from eating the view. Weight <= 0 / non-finite gets the minimum radius.
export const RADIUS = {
  ring: { base: 10, scale: 4, max: 36 },
  format: { base: 12, scale: 5, max: 44 },
};

export function radiusForWeight(weight, kind) {
  const p = kind === "format" ? RADIUS.format : RADIUS.ring;
  const w = Number.isFinite(weight) && weight > 0 ? weight : 0;
  return Math.min(p.max, p.base + p.scale * Math.sqrt(w));
}

const handleKey = (h) => lc(h).replace(/^@+/, "");

function memberHandles(ring) {
  const out = new Set();
  for (const m of Array.isArray(ring.members) ? ring.members : []) {
    const h = handleKey(isObj(m) ? m.handle : m);
    if (h) out.add(h);
  }
  return out;
}

function tagsOf(ring) {
  const out = new Set();
  const tags = Array.isArray(ring.game?.tags) ? ring.game.tags : [];
  for (const t of tags) {
    const k = lc(typeof t === "string" ? t : "");
    if (k) out.add(k);
  }
  return out;
}

const intersects = (a, b) => {
  const [s, l] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of s) if (l.has(x)) return true;
  return false;
};

/**
 * Tolerances (never throws): non-array rings/formats -> []; non-object
 * entries dropped; rings without a string id dropped; duplicate ring or
 * format ids keep the first; formats without a string id dropped; unusable
 * usage (null, junk) -> local counts only; ring label falls back
 * game.name -> title -> id; format label falls back tagline -> id.
 */
export function buildGraph(input) {
  const { rings, formats, usage } = isObj(input) ? input : {};
  const nodes = [];
  const edges = [];

  const seenRing = new Set();
  const ringList = [];
  for (const r of Array.isArray(rings) ? rings : []) {
    if (!isObj(r) || !str(r.id) || !isListable(r)) continue;
    const id = str(r.id);
    if (seenRing.has(id)) continue;
    seenRing.add(id);
    ringList.push(r);
  }

  const u = toUsageMap(usage);
  const seenFmt = new Set();
  const fmtNodes = [];
  for (const f of Array.isArray(formats) ? formats : []) {
    if (!isObj(f) || !str(f.id)) continue;
    const id = str(f.id);
    if (seenFmt.has(lc(id))) continue;
    seenFmt.add(lc(id));
    const local = ringsRunningFormat(id, ringList).length;
    const relay = u && u.has(lc(id)) ? u.get(lc(id)) : 0;
    const count = relay >= 1 ? Math.floor(relay) : local;
    if (count < 1) continue; // unused templates stay invisible
    fmtNodes.push({
      id: FORMAT_PREFIX + id,
      kind: "format",
      label: str(f.tagline) || id,
      weight: count,
      ref: id,
    });
  }

  for (const r of ringList) {
    const members = Array.isArray(r.members) ? r.members.length : 0;
    nodes.push({
      id: RING_PREFIX + str(r.id),
      kind: "ring",
      label: str(r.game?.name) || str(r.title) || str(r.id),
      weight: members,
      ref: str(r.id),
    });
  }
  nodes.push(...fmtNodes);

  // runs: ring -> format
  for (const f of fmtNodes) {
    for (const r of ringsRunningFormat(f.ref, ringList)) {
      edges.push({ from: RING_PREFIX + str(r.id), to: f.id, kind: "runs" });
    }
  }

  // ring <-> ring
  const info = ringList.map((r) => ({
    id: RING_PREFIX + str(r.id),
    members: memberHandles(r),
    tags: tagsOf(r),
  }));
  for (let i = 0; i < info.length; i++) {
    for (let j = i + 1; j < info.length; j++) {
      const [a, b] = info[i].id < info[j].id ? [info[i], info[j]] : [info[j], info[i]];
      if (intersects(a.members, b.members)) {
        edges.push({ from: a.id, to: b.id, kind: "shares-member" });
      } else if (intersects(a.tags, b.tags)) {
        edges.push({ from: a.id, to: b.id, kind: "shares-tag" });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Deterministic layout. Golden-angle spiral seed ordered by node id, then a
 * fixed number of relaxation passes (edge attraction, pairwise separation,
 * clamp to the viewport minus radius margin). Pure: same input, same output.
 * If the viewport is too small for the node radii, nodes stay in bounds and
 * overlap rather than escaping — spread is best-effort, not guaranteed.
 * Tolerates non-finite sizes (falls back to 800x600) and bad graphs.
 */
export function layoutGraph(graph, size) {
  const { width, height } = isObj(size) ? size : {};
  const out = new Map();
  const W = Number.isFinite(width) && width > 0 ? width : 800;
  const H = Number.isFinite(height) && height > 0 ? height : 600;
  const nodes = (isObj(graph) && Array.isArray(graph.nodes) ? graph.nodes : [])
    .filter((n) => isObj(n) && typeof n.id === "string");
  if (nodes.length === 0) return out;

  const sorted = [...new Map(nodes.map((n) => [n.id, n])).values()]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const items = sorted.map((n) => ({
    id: n.id,
    r: radiusForWeight(n.weight, n.kind),
    x: 0,
    y: 0,
  }));
  const byId = new Map(items.map((p) => [p.id, p]));

  const cx = W / 2, cy = H / 2;
  const spread = Math.min(W, H) / 2;
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  items.forEach((p, i) => {
    const t = Math.sqrt((i + 0.5) / items.length);
    p.x = cx + Math.cos(i * GOLDEN) * spread * t;
    p.y = cy + Math.sin(i * GOLDEN) * spread * t;
  });

  const links = (isObj(graph) && Array.isArray(graph.edges) ? graph.edges : [])
    .map((e) => (isObj(e) ? [byId.get(e.from), byId.get(e.to)] : []))
    .filter(([a, b]) => a && b && a !== b);

  const clamp = (p) => {
    const lo = (r, size) => Math.min(r, size / 2);
    p.x = Math.min(W - lo(p.r, W), Math.max(lo(p.r, W), p.x));
    p.y = Math.min(H - lo(p.r, H), Math.max(lo(p.r, H), p.y));
  };

  const separate = () => {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        const want = 0.9 * (a.r + b.r);
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= want) continue;
        if (d < 1e-6) { // coincident: deterministic nudge by index
          const ang = (i + j) * GOLDEN;
          dx = Math.cos(ang); dy = Math.sin(ang); d = 1;
        }
        const push = (want - d) / 2 + 0.01;
        const ux = dx / d, uy = dy / d;
        a.x -= ux * push; a.y -= uy * push;
        b.x += ux * push; b.y += uy * push;
        moved = true;
      }
    }
    return moved;
  };

  for (let iter = 0; iter < 150; iter++) {
    for (const [a, b] of links) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const rest = 1.6 * (a.r + b.r);
      const f = ((d - rest) / d) * 0.05;
      a.x += dx * f; a.y += dy * f;
      b.x -= dx * f; b.y -= dy * f;
    }
    separate();
    items.forEach(clamp);
  }
  for (let iter = 0; iter < 100; iter++) {
    const moved = separate();
    items.forEach(clamp);
    if (!moved) break;
  }

  for (const p of items) out.set(p.id, { x: p.x, y: p.y });
  return out;
}
