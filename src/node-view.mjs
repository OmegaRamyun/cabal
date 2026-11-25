// V56 — 2D Node View UI (SVG + vendored d3-force label-aware layout).
// Replaces the split discovery lists with one data-based 2D node net.
//
// Takes a graph `{ nodes, edges, positions }` as input — never imports
// src/graph.mjs. Pure geometry/layout/query helpers live at the top (zero DOM);
// DOM + SVG + pointer/keyboard/bottom-sheet interaction live inside mount().
// No network, no scores for people.

import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceX,
  forceY,
} from "../vendor/d3-force/d3-force.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";

export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 4;
export const DEFAULT_WIDTH = 800;
export const DEFAULT_HEIGHT = 520;
export const HALO_MIN_RADIUS = 22; // >= 44px diameter tap target
export const MIN_LABEL_CSS_PX = 12;
export const DEFAULT_LABEL_CSS_PX = 13;
export const MOBILE_SHEET_BREAKPOINT = 900;
export const SHEET_SWIPE_DISMISS_PX = 64;

export const EMPTY_STATE_COPY =
  "Rings appear here once two devs are in and a real game page (Steam or itch.io) is attached.";

export const START_RING_ACTION = Object.freeze({
  label: "Start a ring",
  route: "#/rings",
  help: "Pick one of your game\u2019s posts, invite other devs, and they amplify it in their own words.",
});

export const NEW_TEMPLATE_ACTION = Object.freeze({
  label: "New post format",
  route: "#/campaigns/new",
  help: "Write a reusable post shape and disclosure line so any ring can pick it up and run it.",
});

export const EDGE_LEGEND = Object.freeze([
  Object.freeze({ kind: "runs", label: "Runs template" }),
  Object.freeze({ kind: "shares-member", label: "Shared dev" }),
  Object.freeze({ kind: "shares-tag", label: "Similar tags" }),
]);

const EDGE_RELATION_LABELS = Object.freeze({
  runs: { from: "Runs template", to: "Run by ring" },
  "shares-member": { from: "Shares a dev", to: "Shares a dev" },
  "shares-tag": { from: "Similar tags", to: "Similar tags" },
});

// --------------------------------------------------------------- pure ---

function isFiniteNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function trimStr(v) {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Deterministic PRNG (Mulberry32) so d3-force runs identically in Node and
 * browser with zero Math.random usage.
 */
function makeSeededRandom(seed = 0x56caba1) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Look up `{ x, y }` for `id` in either a Map or a plain object.
 * Returns null if missing or non-finite.
 */
export function positionOf(positions, id) {
  if (!positions || id == null) return null;
  let pos = null;
  if (positions instanceof Map) {
    pos = positions.get(id);
  } else if (typeof positions === "object" && Object.prototype.hasOwnProperty.call(positions, id)) {
    pos = positions[id];
  }
  if (!pos || !isFiniteNum(pos.x) || !isFiniteNum(pos.y)) return null;
  return { x: pos.x, y: pos.y };
}

export const DEFAULT_RADIUS = Object.freeze({
  ring: Object.freeze({ base: 10, scale: 4, max: 36 }),
  format: Object.freeze({ base: 12, scale: 5, max: 44 }),
});

/**
 * Default node radius from weight and kind, matching V51's layout radii:
 * ring: min(36, 10 + 4 * sqrt(w)); format: min(44, 12 + 5 * sqrt(w)).
 */
export function defaultRadiusFor(node) {
  const p = node?.kind === "format" ? DEFAULT_RADIUS.format : DEFAULT_RADIUS.ring;
  const raw = node && isFiniteNum(node.weight) ? node.weight : 0;
  const w = Math.max(0, raw);
  return Math.min(p.max, p.base + p.scale * Math.sqrt(w));
}

function resolveRadius(node, radiusFor) {
  if (typeof radiusFor === "function") {
    const r = radiusFor(node);
    if (isFiniteNum(r) && r > 0) return r;
  }
  return defaultRadiusFor(node);
}

/**
 * Resolve the display label for a node at the view layer.
 * For rings: prefer ring title (`node.title` or `opts.ringTitles` lookup by
 * `node.ref` / `node.id`), falling back to `node.label` (game name) then `node.id`.
 * For formats: `node.label || node.id`.
 */
export function displayLabelFor(node, opts = {}) {
  if (!node) return "";
  if (node.kind === "ring") {
    const directTitle = trimStr(node.title);
    if (directTitle) return directTitle;
    const map = opts.ringTitles;
    if (map) {
      const lookup = (key) => {
        if (!key) return "";
        if (map instanceof Map) return trimStr(map.get(key));
        if (typeof map === "object" && Object.prototype.hasOwnProperty.call(map, key)) {
          return trimStr(map[key]);
        }
        return "";
      };
      const byRef = lookup(node.ref);
      if (byRef) return byRef;
      const byId = lookup(node.id);
      if (byId) return byId;
    }
  }
  return trimStr(node.label) || trimStr(node.id) || "";
}

/**
 * Wrap a canvas label into at most `maxLines` lines of `maxChars` characters,
 * adding an ellipsis on the final line if truncated. Full text is always
 * shown in the inspector panel.
 */
export function wrapCanvasLabel(text, opts = {}) {
  const maxChars = isFiniteNum(opts.maxChars) && opts.maxChars >= 8 ? Math.floor(opts.maxChars) : 21;
  const maxLines = isFiniteNum(opts.maxLines) && opts.maxLines >= 1 ? Math.floor(opts.maxLines) : 2;
  const clean = trimStr(text).replace(/\s+/g, " ");
  if (!clean) return [""];
  if (clean.length <= maxChars) return [clean];

  const words = clean.split(" ");
  const lines = [];
  let cur = "";
  let idx = 0;

  while (idx < words.length && lines.length < maxLines) {
    const word = words[idx];
    const candidate = cur ? `${cur} ${word}` : word;
    if (candidate.length <= maxChars) {
      cur = candidate;
      idx++;
    } else if (!cur) {
      // Single word longer than maxChars: hard-split with ellipsis if last line
      if (lines.length === maxLines - 1) {
        lines.push(`${word.slice(0, maxChars - 1)}\u2026`);
        return lines;
      }
      lines.push(word.slice(0, maxChars));
      words[idx] = word.slice(maxChars);
    } else {
      lines.push(cur);
      cur = "";
    }
  }

  if (cur && lines.length < maxLines) {
    lines.push(cur);
  }

  // If words remain unconsumed, truncate the last line cleanly with ellipsis
  if (idx < words.length && lines.length > 0) {
    let last = lines[lines.length - 1];
    if (last.length >= maxChars) {
      last = last.slice(0, maxChars - 1).trimEnd();
    }
    lines[lines.length - 1] = `${last}\u2026`;
  }

  return lines;
}

/**
 * Compute the SVG user-unit font size needed so rendered text stays
 * >= `MIN_LABEL_CSS_PX` (12px) CSS pixels on any viewport or zoom level.
 */
export function labelFontSizeFor(unitsPerPx = 1, opts = {}) {
  const upp = isFiniteNum(unitsPerPx) && unitsPerPx > 0 ? unitsPerPx : 1;
  const targetCss = isFiniteNum(opts.targetCssPx)
    ? Math.max(MIN_LABEL_CSS_PX, opts.targetCssPx)
    : DEFAULT_LABEL_CSS_PX;
  return targetCss * upp;
}

/**
 * Estimated bounding box of a node's canvas label in SVG user units.
 * Returns `{ minX, maxX, minY, maxY, width, height, lines, fontSize, lineHeight }`.
 */
export function labelBoxFor(node, pos, opts = {}) {
  const r = resolveRadius(node, opts.radiusFor);
  const fontSize = isFiniteNum(opts.fontSize) && opts.fontSize > 0
    ? opts.fontSize
    : labelFontSizeFor(opts.unitsPerPx ?? 1, opts);
  const text = displayLabelFor(node, opts);
  const lines = wrapCanvasLabel(text, opts);
  // Conservative average char width for UI sans-serif (wider for ALL-CAPS templates)
  const isUpper = text.length > 4 && text === text.toUpperCase();
  const charFactor = isUpper ? 0.68 : 0.60;
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 1);
  const width = Math.max(longest * fontSize * charFactor + fontSize * 0.9, 48);
  const lineHeight = fontSize * 1.24;
  const height = lines.length * lineHeight + fontSize * 0.3;
  const gap = Math.max(8, fontSize * 0.55);
  const topY = pos.y + r + gap;

  return {
    minX: pos.x - width * 0.5,
    maxX: pos.x + width * 0.5,
    minY: topY,
    maxY: topY + height,
    width,
    height,
    lines,
    fontSize,
    lineHeight,
    gap,
  };
}

/**
 * Combined bounding box covering both the node shape and its label.
 */
export function nodeTotalBoxFor(node, pos, opts = {}) {
  const r = resolveRadius(node, opts.radiusFor);
  const lb = labelBoxFor(node, pos, opts);
  const minX = Math.min(pos.x - r, lb.minX);
  const maxX = Math.max(pos.x + r, lb.maxX);
  const minY = pos.y - r;
  const maxY = Math.max(pos.y + r, lb.maxY);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    labelBox: lb,
  };
}

/**
 * Return true if two axis-aligned bounding boxes overlap (with optional padding).
 */
export function boxesOverlap(a, b, padX = 0, padY = 0) {
  if (!a || !b) return false;
  return (
    a.minX - padX < b.maxX &&
    a.maxX + padX > b.minX &&
    a.minY - padY < b.maxY &&
    a.maxY + padY > b.minY
  );
}

/**
 * Count pairwise label-box (and label-vs-node-shape) overlaps for a positioned graph.
 */
export function countLabelOverlaps(graph, opts = {}) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const boxes = [];
  for (const node of nodes) {
    const pos = positionOf(graph?.positions, node?.id);
    if (!pos) continue;
    boxes.push({
      id: node.id,
      total: nodeTotalBoxFor(node, pos, opts),
      label: labelBoxFor(node, pos, opts),
    });
  }
  let overlaps = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxesOverlap(boxes[i].total, boxes[j].total, 0, 0)) {
        overlaps++;
      }
    }
  }
  return overlaps;
}

/**
 * Custom d3-force rectangular bounding-box collision force.
 * Separates overlapping node+label bounding boxes along the minimum-penetration axis.
 */
function forceRectCollide(padX = 14, padY = 12) {
  let simNodes = [];
  function force(alpha) {
    const strength = Math.min(1, 0.75 + alpha * 0.25);
    for (let i = 0; i < simNodes.length; i++) {
      const a = simNodes[i];
      for (let j = i + 1; j < simNodes.length; j++) {
        const b = simNodes[j];
        const aMinX = a.x - a.halfW - padX * 0.5;
        const aMaxX = a.x + a.halfW + padX * 0.5;
        const aMinY = a.y - a.topH - padY * 0.5;
        const aMaxY = a.y + a.bottomH + padY * 0.5;

        const bMinX = b.x - b.halfW - padX * 0.5;
        const bMaxX = b.x + b.halfW + padX * 0.5;
        const bMinY = b.y - b.topH - padY * 0.5;
        const bMaxY = b.y + b.bottomH + padY * 0.5;

        const overlapX = Math.min(aMaxX, bMaxX) - Math.max(aMinX, bMinX);
        const overlapY = Math.min(aMaxY, bMaxY) - Math.max(aMinY, bMinY);
        if (overlapX > 0 && overlapY > 0) {
          const cxA = (aMinX + aMaxX) * 0.5;
          const cyA = (aMinY + aMaxY) * 0.5;
          const cxB = (bMinX + bMaxX) * 0.5;
          const cyB = (bMinY + bMaxY) * 0.5;
          if (overlapX < overlapY) {
            const dir = cxB >= cxA ? 1 : -1;
            const shift = overlapX * 0.5 * strength + 0.5;
            a.x -= dir * shift;
            b.x += dir * shift;
          } else {
            const dir = cyB >= cyA ? 1 : -1;
            const shift = overlapY * 0.5 * strength + 0.5;
            a.y -= dir * shift;
            b.y += dir * shift;
          }
        }
      }
    }
  }
  force.initialize = (n) => {
    simNodes = n;
  };
  return force;
}

/**
 * Label-aware deterministic layout powered by vendored `d3-force`.
 * Uses rectangular bounding-box collision (node shape + wrapped label),
 * longer link rest lengths, charge repulsion, and a final strict AABB
 * separation pass so zero label boxes overlap.
 *
 * Returns a new `Map<nodeId, { x, y }>`.
 */
export function layoutWithLabels(graph, opts = {}) {
  const out = new Map();
  const nodes = (Array.isArray(graph?.nodes) ? graph.nodes : []).filter((n) => n && n.id != null);
  if (nodes.length === 0) return out;

  const width = isFiniteNum(opts.width) && opts.width > 0 ? opts.width : DEFAULT_WIDTH;
  const height = isFiniteNum(opts.height) && opts.height > 0 ? opts.height : DEFAULT_HEIGHT;
  const padX = isFiniteNum(opts.padX) && opts.padX >= 0 ? opts.padX : 18;
  const padY = isFiniteNum(opts.padY) && opts.padY >= 0 ? opts.padY : 16;

  const cx = width * 0.5;
  const cy = height * 0.5;
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));

  const sorted = nodes.toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const simNodes = sorted.map((node, i) => {
    const r = resolveRadius(node, opts.radiusFor);
    const lb = labelBoxFor(node, { x: 0, y: 0 }, opts);
    const seed = positionOf(graph?.positions, node.id);
    const spread = Math.min(width, height) * 0.42;
    const t = Math.sqrt((i + 0.5) / sorted.length);
    const x = seed ? cx + (seed.x - cx) * 1.45 : cx + Math.cos(i * GOLDEN) * spread * t;
    const y = seed ? cy + (seed.y - cy) * 1.45 : cy + Math.sin(i * GOLDEN) * spread * t;
    const halfW = Math.max(r, lb.width * 0.5);
    const topH = r;
    const bottomH = Math.max(r, lb.maxY);
    const collideR = Math.hypot(halfW * 0.72, (topH + bottomH) * 0.45) + 8;
    return {
      id: node.id,
      node,
      r,
      halfW,
      topH,
      bottomH,
      collideR,
      x,
      y,
      vx: 0,
      vy: 0,
    };
  });

  const byId = new Map(simNodes.map((d) => [d.id, d]));
  const simLinks = (Array.isArray(graph?.edges) ? graph.edges : [])
    .filter((e) => e && byId.has(e.from) && byId.has(e.to) && e.from !== e.to)
    .map((e) => ({ source: e.from, target: e.to, kind: e.kind }));

  const isPortrait = height > width || width < 500;
  const sim = forceSimulation(simNodes)
    .randomSource(makeSeededRandom(0x56caba1))
    .force(
      "link",
      forceLink(simLinks)
        .id((d) => d.id)
        .distance((link) => {
          const s = typeof link.source === "object" ? link.source : byId.get(link.source);
          const t = typeof link.target === "object" ? link.target : byId.get(link.target);
          const minSpan = s && t ? s.halfW + t.halfW + padX : 150;
          return isPortrait ? Math.max(120, minSpan * 0.78) : Math.max(175, minSpan * 0.92);
        })
        .strength(0.42),
    )
    .force("charge", forceManyBody().strength(isPortrait ? -300 : -460).distanceMax(650))
    .force("collide", forceCollide((d) => d.collideR).strength(0.85).iterations(3))
    .force("rectCollide", forceRectCollide(padX, padY))
    .force("x", forceX(cx).strength(isPortrait ? 0.16 : 0.06))
    .force("y", forceY(cy).strength(isPortrait ? 0.045 : 0.08))
    .stop();

  sim.tick(180);

  // Final deterministic AABB relaxation pass guaranteeing zero box overlaps
  const rectForce = forceRectCollide(padX, padY);
  rectForce.initialize(simNodes);
  for (let pass = 0; pass < 80; pass++) {
    let anyOverlap = false;
    for (let i = 0; i < simNodes.length; i++) {
      const a = simNodes[i];
      for (let j = i + 1; j < simNodes.length; j++) {
        const b = simNodes[j];
        const aBox = {
          minX: a.x - a.halfW,
          maxX: a.x + a.halfW,
          minY: a.y - a.topH,
          maxY: a.y + a.bottomH,
        };
        const bBox = {
          minX: b.x - b.halfW,
          maxX: b.x + b.halfW,
          minY: b.y - b.topH,
          maxY: b.y + b.bottomH,
        };
        if (boxesOverlap(aBox, bBox, padX * 0.5, padY * 0.5)) {
          anyOverlap = true;
          break;
        }
      }
      if (anyOverlap) break;
    }
    if (!anyOverlap) break;
    rectForce(1);
  }

  for (const d of simNodes) {
    out.set(d.id, { x: d.x, y: d.y });
  }
  return out;
}

/**
 * Pure mobile bottom-sheet helpers.
 */
export function isMobileSheetViewport(viewportWidth) {
  return isFiniteNum(viewportWidth) && viewportWidth > 0 && viewportWidth < MOBILE_SHEET_BREAKPOINT;
}

export function sheetStateFor(selectedId, viewportWidth) {
  const hasSelection = selectedId != null && selectedId !== "";
  const mobile = isMobileSheetViewport(viewportWidth);
  return {
    mode: mobile ? "sheet" : "panel",
    open: mobile ? hasSelection : true,
    hasSelection,
    selectedId: hasSelection ? selectedId : null,
  };
}

export function shouldDismissSheetSwipe(deltaY, threshold = SHEET_SWIPE_DISMISS_PX) {
  const limit = isFiniteNum(threshold) && threshold > 0 ? threshold : SHEET_SWIPE_DISMISS_PX;
  return isFiniteNum(deltaY) && deltaY >= limit;
}

/**
 * Transparent hit halo radius in SVG user units — scales HALO_MIN_RADIUS by
 * `unitsPerPx` (`viewBox.w / svgRect.width`) so the tap target stays >= 22 CSS px
 * radius (44 CSS px diameter) across viewport widths and zoom levels.
 */
export function haloRadiusFor(node, radiusFor, unitsPerPx = 1) {
  const scale = isFiniteNum(unitsPerPx) && unitsPerPx > 0 ? unitsPerPx : 1;
  return Math.max(resolveRadius(node, radiusFor) + 8, HALO_MIN_RADIUS * scale);
}

/**
 * Clamp a zoom factor into [min, max].
 */
export function clampZoom(zoom, opts = {}) {
  const min = isFiniteNum(opts.min) && opts.min > 0 ? opts.min : MIN_ZOOM;
  const max = isFiniteNum(opts.max) && opts.max >= min ? opts.max : MAX_ZOOM;
  const z = isFiniteNum(zoom) ? zoom : 1;
  if (z < min) return min;
  if (z > max) return max;
  return z;
}

/**
 * Pure viewBox zoom keeping focal point (cx, cy) fixed in viewport coordinates.
 */
export function zoomAround(viewBox, cx, cy, factor, opts = {}) {
  const vb = {
    x: isFiniteNum(viewBox?.x) ? viewBox.x : 0,
    y: isFiniteNum(viewBox?.y) ? viewBox.y : 0,
    w: isFiniteNum(viewBox?.w) && viewBox.w > 0 ? viewBox.w : DEFAULT_WIDTH,
    h: isFiniteNum(viewBox?.h) && viewBox.h > 0 ? viewBox.h : DEFAULT_HEIGHT,
  };
  const fx = isFiniteNum(cx) ? (cx - vb.x) / vb.w : 0.5;
  const fy = isFiniteNum(cy) ? (cy - vb.y) / vb.h : 0.5;
  const f = isFiniteNum(factor) && factor > 0 ? factor : 1;

  let nextW;
  let nextH;
  const base = opts.baseViewBox;
  if (base && isFiniteNum(base.w) && base.w > 0 && isFiniteNum(base.h) && base.h > 0) {
    const currentZoom = base.w / vb.w;
    const targetZoom = clampZoom(currentZoom * f, opts);
    nextW = base.w / targetZoom;
    nextH = base.h / targetZoom;
  } else {
    const clamped = clampZoom(f, opts);
    nextW = vb.w / clamped;
    nextH = vb.h / clamped;
  }

  const focalX = isFiniteNum(cx) ? cx : vb.x + vb.w * 0.5;
  const focalY = isFiniteNum(cy) ? cy : vb.y + vb.h * 0.5;
  return {
    x: focalX - fx * nextW,
    y: focalY - fy * nextH,
    w: nextW,
    h: nextH,
  };
}

function contentBoundsOf(bounds, radiusFor) {
  if (!bounds || typeof bounds !== "object") return null;
  if (
    isFiniteNum(bounds.minX) &&
    isFiniteNum(bounds.maxX) &&
    isFiniteNum(bounds.minY) &&
    isFiniteNum(bounds.maxY)
  ) {
    return bounds;
  }
  if (isFiniteNum(bounds.x) && isFiniteNum(bounds.y) && isFiniteNum(bounds.w) && isFiniteNum(bounds.h)) {
    return {
      minX: bounds.x,
      maxX: bounds.x + bounds.w,
      minY: bounds.y,
      maxY: bounds.y + bounds.h,
    };
  }
  if (Array.isArray(bounds.nodes) && bounds.positions) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const node of bounds.nodes) {
      const pos = positionOf(bounds.positions, node?.id);
      if (!pos) continue;
      const r = resolveRadius(node, radiusFor);
      if (pos.x - r < minX) minX = pos.x - r;
      if (pos.x + r > maxX) maxX = pos.x + r;
      if (pos.y - r < minY) minY = pos.y - r;
      if (pos.y + r > maxY) maxY = pos.y + r;
    }
    if (Number.isFinite(minX)) return { minX, maxX, minY, maxY };
  }
  return null;
}

/**
 * Pure viewBox pan by (dx, dy) in world coordinates.
 */
export function panBy(viewBox, dx, dy, bounds, opts = {}) {
  const vb = {
    x: isFiniteNum(viewBox?.x) ? viewBox.x : 0,
    y: isFiniteNum(viewBox?.y) ? viewBox.y : 0,
    w: isFiniteNum(viewBox?.w) && viewBox.w > 0 ? viewBox.w : DEFAULT_WIDTH,
    h: isFiniteNum(viewBox?.h) && viewBox.h > 0 ? viewBox.h : DEFAULT_HEIGHT,
  };
  let x = vb.x + (isFiniteNum(dx) ? dx : 0);
  let y = vb.y + (isFiniteNum(dy) ? dy : 0);

  const box = contentBoundsOf(bounds, opts.radiusFor);
  if (box) {
    const padX = Math.min(40, vb.w * 0.25, Math.max(0, (box.maxX - box.minX) * 0.5));
    const padY = Math.min(40, vb.h * 0.25, Math.max(0, (box.maxY - box.minY) * 0.5));
    const minViewX = box.minX + padX - vb.w;
    const maxViewX = box.maxX - padX;
    const minViewY = box.minY + padY - vb.h;
    const maxViewY = box.maxY - padY;

    if (minViewX <= maxViewX) {
      x = Math.min(maxViewX, Math.max(minViewX, x));
    } else {
      x = (minViewX + maxViewX) * 0.5;
    }
    if (minViewY <= maxViewY) {
      y = Math.min(maxViewY, Math.max(minViewY, y));
    } else {
      y = (minViewY + maxViewY) * 0.5;
    }
  }

  return { x, y, w: vb.w, h: vb.h };
}

/**
 * Hit-test world point (x, y) against positioned nodes (including their tap halo).
 */
export function nodeAtPoint(graph, x, y, opts = {}) {
  if (!graph || !Array.isArray(graph.nodes) || !isFiniteNum(x) || !isFiniteNum(y)) {
    return null;
  }
  let best = null;
  for (let i = 0; i < graph.nodes.length; i++) {
    const node = graph.nodes[i];
    if (!node || node.id == null) continue;
    const pos = positionOf(graph.positions, node.id);
    if (!pos) continue;
    const visR = resolveRadius(node, opts.radiusFor);
    const hitR = haloRadiusFor(node, opts.radiusFor, opts.unitsPerPx);
    const dx = x - pos.x;
    const dy = y - pos.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > hitR * hitR) continue;

    if (
      !best ||
      visR < best.visR ||
      (visR === best.visR && distSq < best.distSq) ||
      (visR === best.visR && distSq === best.distSq && i > best.index)
    ) {
      best = { node, visR, distSq, index: i };
    }
  }
  return best ? best.node : null;
}

/**
 * Nodes shown by the Rings/Templates filter chips ('all' | 'ring' | 'format').
 * The chips dim the other kind on the map; the side-panel "Nodes in view"
 * list is the visible list, so it must filter too — otherwise the tabs
 * look dead. Unknown filters fall back to all nodes.
 */
export function visibleNodesForFilter(nodes, filter) {
  const list = Array.isArray(nodes) ? nodes : [];
  if (filter === "ring" || filter === "format") return list.filter((n) => n && n.kind === filter);
  return list;
}

/**
 * Edges touching `selectedId`, or all edges when nothing is selected.
 */
export function visibleEdges(graph, selectedId) {
  if (!graph || !Array.isArray(graph.edges)) return [];
  const edges = graph.edges.filter((e) => e && e.from != null && e.to != null);
  if (selectedId == null || selectedId === "") return edges;
  return edges.filter((e) => e.from === selectedId || e.to === selectedId);
}

/**
 * Initial viewBox containing every positioned node AND its full wrapped label
 * bounding box with `margin` (plus optional top clearance for the corner toolbar),
 * preserving the viewport aspect ratio.
 */
export function viewBoxFor(graph, opts = {}) {
  const width = isFiniteNum(opts.width) && opts.width > 0 ? opts.width : DEFAULT_WIDTH;
  const height = isFiniteNum(opts.height) && opts.height > 0 ? opts.height : DEFAULT_HEIGHT;
  const margin = isFiniteNum(opts.margin) && opts.margin >= 0 ? opts.margin : 52;
  const topClearance = isFiniteNum(opts.topClearance) && opts.topClearance >= 0 ? opts.topClearance : 0;
  const aspect = width / height;

  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    if (!node || node.id == null) continue;
    const pos = positionOf(graph?.positions, node.id);
    if (!pos) continue;
    const box = nodeTotalBoxFor(node, pos, opts);
    if (box.minX < minX) minX = box.minX;
    if (box.maxX > maxX) maxX = box.maxX;
    if (box.minY < minY) minY = box.minY;
    if (box.maxY > maxY) maxY = box.maxY;
  }

  if (!Number.isFinite(minX)) {
    return { x: 0, y: 0, w: width, h: height };
  }

  minY -= topClearance;

  const rawW = Math.max(maxX - minX + margin * 2, 160);
  const rawH = Math.max(maxY - minY + margin * 2, 120);
  let w = rawW;
  let h = rawH;

  if (w / h < aspect) {
    w = h * aspect;
  } else {
    h = w / aspect;
  }

  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  return {
    x: cx - w * 0.5,
    y: cy - h * 0.5,
    w,
    h,
  };
}

/**
 * Honest usage line for a format node when a real positive ring count is given.
 * Never returns "0 rings".
 */
export function formatUsageLine(node) {
  if (!node || node.kind !== "format") return "";
  const count = isFiniteNum(node.weight) ? Math.floor(node.weight) : 0;
  if (count <= 0) return "";
  return count === 1 ? "Used by 1 ring" : `Used by ${count} rings`;
}

function hexPoints(r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${(Math.cos(angle) * r).toFixed(2)},${(Math.sin(angle) * r).toFixed(2)}`);
  }
  return pts.join(" ");
}

function setHashFallback(ctx, route) {
  if (ctx && ctx.location && typeof ctx.location === "object") {
    ctx.location.hash = route;
  } else if (typeof globalThis.location !== "undefined" && globalThis.location) {
    globalThis.location.hash = route;
  }
}

/**
 * Read-only helper to resolve ring titles + game names for display when
 * `src/graph.mjs` only attached `game.name` as `node.label`.
 */
function resolveRingMetadata(ctx) {
  const ringTitles = new Map();
  const ringGames = new Map();

  const ingest = (list) => {
    if (!Array.isArray(list)) return;
    for (const c of list) {
      if (!c || typeof c !== "object" || !trimStr(c.id)) continue;
      const id = trimStr(c.id);
      const title = trimStr(c.title);
      const gameName = trimStr(c.game?.name);
      if (title) {
        ringTitles.set(id, title);
        ringTitles.set(`ring:${id}`, title);
      }
      if (gameName) {
        ringGames.set(id, gameName);
        ringGames.set(`ring:${id}`, gameName);
      }
    }
  };

  if (Array.isArray(ctx?.rings)) {
    ingest(ctx.rings);
  }
  try {
    if (typeof globalThis.localStorage !== "undefined" && globalThis.localStorage) {
      const raw = globalThis.localStorage.getItem("cabal.v2.campaigns");
      if (raw) ingest(JSON.parse(raw));
    }
  } catch {
    // Ignore storage read/parse errors.
  }

  return { ringTitles, ringGames };
}

// ----------------------------------------------------------------- DOM ---

function el(doc, tag, text, cls) {
  const n = doc.createElement(tag);
  if (text != null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

function svgEl(doc, tag, attrs = {}) {
  const n = doc.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) n.setAttribute(k, String(v));
  }
  return n;
}

/**
 * mount(rootEl, ctx) — renders the 2D SVG node view with compact toolbar,
 * label-aware d3-force layout, top-layer halo labels (>= 12px CSS px),
 * corner zoom toolbar, inline edge/shape legend, and desktop full-height
 * inspector / mobile slide-up bottom sheet.
 */
export function mount(rootEl, ctx = {}) {
  const doc = rootEl.ownerDocument;
  rootEl.textContent = "";

  const graph = ctx.graph && typeof ctx.graph === "object"
    ? ctx.graph
    : { nodes: [], edges: [], positions: new Map() };
  const allNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const positionedNodes = allNodes.filter((n) => n && n.id != null && positionOf(graph.positions, n.id));
  const nodeById = new Map(positionedNodes.map((n) => [n.id, n]));
  const allEdges = (Array.isArray(graph.edges) ? graph.edges : []).filter(
    (e) => e && nodeById.has(e.from) && nodeById.has(e.to),
  );

  const { ringTitles, ringGames } = resolveRingMetadata(ctx);
  const labelOpts = {
    ...(typeof ctx.radiusFor === "function" ? { radiusFor: ctx.radiusFor } : {}),
    ringTitles,
  };

  const width = isFiniteNum(ctx.width) && ctx.width > 0 ? ctx.width : DEFAULT_WIDTH;
  const height = isFiniteNum(ctx.height) && ctx.height > 0 ? ctx.height : DEFAULT_HEIGHT;
  const radiusOpt = typeof ctx.radiusFor === "function" ? { radiusFor: ctx.radiusFor } : {};

  const win = doc.defaultView || (typeof globalThis.window !== "undefined" ? globalThis.window : null);
  const getViewportWidth = () => (win && isFiniteNum(win.innerWidth) ? win.innerWidth : 1280);

  // Initial label-aware layout with d3-force + rectangular bounding-box collision
  const rawGraph = { nodes: positionedNodes, edges: allEdges, positions: graph.positions };
  let laidOutPositions = layoutWithLabels(rawGraph, {
    width,
    height,
    ...labelOpts,
    fontSize: DEFAULT_LABEL_CSS_PX,
    padX: 20,
    padY: 16,
  });
  let validGraph = { nodes: positionedNodes, edges: allEdges, positions: laidOutPositions };

  let baseViewBox = viewBoxFor(validGraph, {
    width,
    height,
    margin: 56,
    topClearance: 54,
    ...labelOpts,
    fontSize: DEFAULT_LABEL_CSS_PX,
  });
  let viewBox = { ...baseViewBox };
  let selectedId = null;
  let activeFilter = "all"; // 'all' | 'ring' | 'format'

  const section = el(doc, "section", null, "node-view");
  rootEl.appendChild(section);

  // ---- Compact top toolbar: segmented filters + create actions ----
  const toolbar = el(doc, "div", null, "node-toolbar");

  const filtersBar = el(doc, "div", null, "node-view-filters");
  filtersBar.setAttribute("role", "group");
  filtersBar.setAttribute("aria-label", "Filter nodes by kind");
  const chipSpecs = [
    { key: "all", label: "All" },
    { key: "ring", label: "Rings" },
    { key: "format", label: "Templates" },
  ];
  const chipEls = new Map();
  for (const spec of chipSpecs) {
    const chip = el(doc, "button", spec.label, "node-chip");
    chip.type = "button";
    chip.setAttribute("aria-pressed", spec.key === activeFilter ? "true" : "false");
    chip.addEventListener("click", () => {
      activeFilter = spec.key;
      for (const [k, btn] of chipEls) {
        btn.setAttribute("aria-pressed", k === activeFilter ? "true" : "false");
      }
      if (selectedId) {
        const selNode = nodeById.get(selectedId);
        if (selNode && activeFilter !== "all" && selNode.kind !== activeFilter) {
          selectedId = null;
        }
      }
      updateSelectionState();
      renderPanel();
    });
    chipEls.set(spec.key, chip);
    filtersBar.appendChild(chip);
  }

  const actionsBar = el(doc, "div", null, "node-view-actions");
  const startBtn = el(doc, "button", START_RING_ACTION.label, "primary node-action-start");
  startBtn.type = "button";
  startBtn.title = START_RING_ACTION.help;
  startBtn.addEventListener("click", () => {
    if (typeof ctx.onStartRing === "function") ctx.onStartRing();
    else setHashFallback(ctx, START_RING_ACTION.route);
  });
  actionsBar.appendChild(startBtn);

  const tmplBtn = el(doc, "button", NEW_TEMPLATE_ACTION.label, "node-action-template");
  tmplBtn.type = "button";
  tmplBtn.title = NEW_TEMPLATE_ACTION.help;
  tmplBtn.addEventListener("click", () => {
    if (typeof ctx.onNewTemplate === "function") ctx.onNewTemplate();
    else setHashFallback(ctx, NEW_TEMPLATE_ACTION.route);
  });
  actionsBar.appendChild(tmplBtn);

  // ---- Empty state: honest share requirement, never softened ----
  if (positionedNodes.length === 0) {
    toolbar.appendChild(actionsBar);
    section.appendChild(toolbar);
    section.appendChild(el(doc, "p", EMPTY_STATE_COPY, "node-empty empty-state"));
    return {
      destroy() {},
      select() {},
      resetView() {},
      getViewBox: () => ({ ...viewBox }),
    };
  }

  toolbar.appendChild(filtersBar);
  toolbar.appendChild(actionsBar);
  section.appendChild(toolbar);

  // ---- Main grid: SVG net stage + desktop side panel / mobile bottom sheet ----
  const grid = el(doc, "div", null, "node-view-grid");
  const stage = el(doc, "div", null, "node-stage");
  const sheetBackdrop = el(doc, "div", null, "node-sheet-backdrop");
  sheetBackdrop.setAttribute("aria-hidden", "true");
  sheetBackdrop.addEventListener("click", () => select(null));

  const panel = el(doc, "aside", null, "node-panel is-empty is-sheet-closed");
  panel.setAttribute("aria-live", "polite");
  panel.setAttribute("aria-label", "Node details");

  grid.appendChild(stage);
  grid.appendChild(sheetBackdrop);
  grid.appendChild(panel);
  section.appendChild(grid);

  // ---- SVG canvas ----
  const svg = svgEl(doc, "svg", {
    class: "node-svg",
    viewBox: `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`,
    role: "region",
    "aria-label": "Interactive map of rings and campaign templates. Select a node to inspect it.",
  });
  svg.style.touchAction = "none";
  stage.appendChild(svg);

  // Gradients & subtle ember/gold glow filters
  const defs = svgEl(doc, "defs");

  const ringGrad = svgEl(doc, "radialGradient", { id: "cabal-ring-fill", cx: "38%", cy: "32%", r: "68%" });
  ringGrad.appendChild(svgEl(doc, "stop", { offset: "0%", "stop-color": "#342015" }));
  ringGrad.appendChild(svgEl(doc, "stop", { offset: "70%", "stop-color": "#1c130e" }));
  ringGrad.appendChild(svgEl(doc, "stop", { offset: "100%", "stop-color": "#120d0a" }));
  defs.appendChild(ringGrad);

  const fmtGrad = svgEl(doc, "radialGradient", { id: "cabal-format-fill", cx: "38%", cy: "32%", r: "68%" });
  fmtGrad.appendChild(svgEl(doc, "stop", { offset: "0%", "stop-color": "#352a14" }));
  fmtGrad.appendChild(svgEl(doc, "stop", { offset: "70%", "stop-color": "#1c170d" }));
  fmtGrad.appendChild(svgEl(doc, "stop", { offset: "100%", "stop-color": "#13100a" }));
  defs.appendChild(fmtGrad);

  const ringGlow = svgEl(doc, "filter", { id: "cabal-glow-ring", x: "-45%", y: "-45%", width: "190%", height: "190%" });
  ringGlow.appendChild(svgEl(doc, "feDropShadow", { dx: "0", dy: "0", stdDeviation: "3.5", "flood-color": "#c8501e", "flood-opacity": "0.42" }));
  defs.appendChild(ringGlow);

  const fmtGlow = svgEl(doc, "filter", { id: "cabal-glow-format", x: "-45%", y: "-45%", width: "190%", height: "190%" });
  fmtGlow.appendChild(svgEl(doc, "feDropShadow", { dx: "0", dy: "0", stdDeviation: "4", "flood-color": "#c9a24a", "flood-opacity": "0.45" }));
  defs.appendChild(fmtGlow);

  svg.appendChild(defs);

  // 3 strict paint layers: edges -> node shapes -> top-layer halo labels
  const edgesGroup = svgEl(doc, "g", { class: "node-edges" });
  const nodesGroup = svgEl(doc, "g", { class: "node-nodes" });
  const labelsGroup = svgEl(doc, "g", { class: "node-labels" });
  svg.appendChild(edgesGroup);
  svg.appendChild(nodesGroup);
  svg.appendChild(labelsGroup);

  const edgeEls = [];
  for (const edge of allEdges) {
    const fromPos = positionOf(validGraph.positions, edge.from);
    const toPos = positionOf(validGraph.positions, edge.to);
    const kindClass =
      edge.kind === "runs"
        ? "node-edge--runs"
        : edge.kind === "shares-member"
          ? "node-edge--shares-member"
          : "node-edge--shares-tag";
    const line = svgEl(doc, "line", {
      class: `node-edge ${kindClass}`,
      x1: fromPos.x,
      y1: fromPos.y,
      x2: toPos.x,
      y2: toPos.y,
    });
    edgesGroup.appendChild(line);
    edgeEls.push({ edge, el: line });
  }

  const nodeEls = new Map();
  const haloEls = new Map();
  const labelEls = new Map();

  for (const node of positionedNodes) {
    const pos = positionOf(validGraph.positions, node.id);
    const r = resolveRadius(node, ctx.radiusFor);
    const haloR = haloRadiusFor(node, ctx.radiusFor, viewBox.w / width);
    const isFormat = node.kind === "format";
    const kindWord = isFormat ? "Campaign template" : "Ring";
    const usage = formatUsageLine(node);
    const displayTitle = displayLabelFor(node, labelOpts);
    const ariaText = `${displayTitle}, ${kindWord}${usage ? `, ${usage}` : ""}`;

    const g = svgEl(doc, "g", {
      class: `node-item ${isFormat ? "node-item--format" : "node-item--ring"}`,
      transform: `translate(${pos.x},${pos.y})`,
      tabindex: "0",
      role: "button",
      "aria-label": ariaText,
      "data-node-id": node.id,
    });

    const halo = svgEl(doc, "circle", {
      class: "node-halo",
      r: haloR,
      fill: "transparent",
    });
    g.appendChild(halo);
    haloEls.set(node.id, halo);

    if (isFormat) {
      g.appendChild(
        svgEl(doc, "polygon", {
          class: "node-shape node-shape--format",
          points: hexPoints(r),
          fill: "url(#cabal-format-fill)",
          filter: "url(#cabal-glow-format)",
        }),
      );
    } else {
      g.appendChild(
        svgEl(doc, "circle", {
          class: "node-shape node-shape--ring",
          r,
          fill: "url(#cabal-ring-fill)",
          filter: "url(#cabal-glow-ring)",
        }),
      );
    }

    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        select(node.id);
      } else if (e.key === "Escape") {
        e.preventDefault();
        select(null);
      }
    });

    nodesGroup.appendChild(g);
    nodeEls.set(node.id, g);

    // Top-layer label (rendered above all nodes and edges)
    const labelTextEl = svgEl(doc, "text", {
      class: `node-label ${isFormat ? "node-label--format" : "node-label--ring"}`,
      x: pos.x,
      y: pos.y + r + 14,
      "text-anchor": "middle",
      "data-label-for": node.id,
    });
    labelsGroup.appendChild(labelTextEl);
    labelEls.set(node.id, labelTextEl);
  }

  // ---- Corner zoom toolbar (+ / − / reset) ----
  const tools = el(doc, "div", null, "node-tools");
  tools.setAttribute("role", "toolbar");
  tools.setAttribute("aria-label", "Map zoom controls");

  const zinBtn = el(doc, "button", "+", "node-tool-btn");
  zinBtn.type = "button";
  zinBtn.setAttribute("aria-label", "Zoom in");
  const zoutBtn = el(doc, "button", "\u2212", "node-tool-btn");
  zoutBtn.type = "button";
  zoutBtn.setAttribute("aria-label", "Zoom out");
  const zresetBtn = el(doc, "button", "\u21ba", "node-tool-btn");
  zresetBtn.type = "button";
  zresetBtn.setAttribute("aria-label", "Reset view");

  tools.appendChild(zinBtn);
  tools.appendChild(zoutBtn);
  tools.appendChild(zresetBtn);
  stage.appendChild(tools);

  // ---- Inline legend chips (shapes + all 3 edge kinds) ----
  const stageFooter = el(doc, "div", null, "node-stage-footer");
  const legend = el(doc, "div", null, "node-legend");
  legend.setAttribute("aria-label", "Map legend");

  const ringChip = el(doc, "span", null, "node-legend-chip");
  ringChip.appendChild(el(doc, "span", null, "node-legend-swatch node-legend-swatch--ring"));
  ringChip.appendChild(el(doc, "span", "Ring"));
  legend.appendChild(ringChip);

  const fmtChip = el(doc, "span", null, "node-legend-chip");
  fmtChip.appendChild(el(doc, "span", null, "node-legend-swatch node-legend-swatch--format"));
  fmtChip.appendChild(el(doc, "span", "Template"));
  legend.appendChild(fmtChip);

  for (const spec of EDGE_LEGEND) {
    const chip = el(doc, "span", null, "node-legend-chip");
    chip.appendChild(el(doc, "span", null, `node-legend-line node-legend-line--${spec.kind}`));
    chip.appendChild(el(doc, "span", spec.label));
    legend.appendChild(chip);
  }
  stageFooter.appendChild(legend);

  const hasFormats = positionedNodes.some((n) => n.kind === "format");
  if (hasFormats && typeof ctx.usageNote === "string" && ctx.usageNote) {
    stageFooter.appendChild(el(doc, "span", ctx.usageNote, "node-usage-status"));
  }
  stage.appendChild(stageFooter);

  // ---- Layout sync, viewBox, and CSS-px label counter-scaling ----
  function currentStageSize() {
    const rect = svg.getBoundingClientRect();
    if (rect && isFiniteNum(rect.width) && rect.width > 0 && isFiniteNum(rect.height) && rect.height > 0) {
      return { w: rect.width, h: rect.height };
    }
    return { w: width, h: height };
  }

  function currentUnitsPerPx() {
    const size = currentStageSize();
    return viewBox.w / size.w;
  }

  function applyPositionsToSvg() {
    for (const { edge, el: line } of edgeEls) {
      const fromPos = positionOf(validGraph.positions, edge.from);
      const toPos = positionOf(validGraph.positions, edge.to);
      if (!fromPos || !toPos) continue;
      line.setAttribute("x1", String(fromPos.x));
      line.setAttribute("y1", String(fromPos.y));
      line.setAttribute("x2", String(toPos.x));
      line.setAttribute("y2", String(toPos.y));
    }
    for (const [id, g] of nodeEls) {
      const pos = positionOf(validGraph.positions, id);
      if (!pos) continue;
      g.setAttribute("transform", `translate(${pos.x},${pos.y})`);
    }
  }

  function currentLabelOpts() {
    const narrow = currentStageSize().w < 500;
    return narrow ? { ...labelOpts, maxChars: 16 } : labelOpts;
  }

  function updateLabelsAndHalos() {
    const upp = currentUnitsPerPx();
    const curLabelOpts = currentLabelOpts();
    const fontSize = labelFontSizeFor(upp, {
      targetCssPx: isMobileSheetViewport(getViewportWidth()) ? 12.5 : DEFAULT_LABEL_CSS_PX,
    });
    const strokeW = Math.max(3, fontSize * 0.32);

    for (const [id, halo] of haloEls) {
      const node = nodeById.get(id);
      halo.setAttribute("r", String(haloRadiusFor(node, ctx.radiusFor, upp)));
    }

    for (const [id, textEl] of labelEls) {
      const node = nodeById.get(id);
      const pos = positionOf(validGraph.positions, id);
      if (!node || !pos) continue;
      const lb = labelBoxFor(node, pos, { ...curLabelOpts, fontSize });
      const baseY = lb.minY + fontSize * 0.92;
      textEl.setAttribute("x", String(pos.x));
      textEl.setAttribute("y", String(baseY));
      textEl.setAttribute("font-size", fontSize.toFixed(2));
      textEl.setAttribute("stroke-width", strokeW.toFixed(2));
      textEl.textContent = "";
      lb.lines.forEach((lineStr, idx) => {
        const tspan = svgEl(doc, "tspan", {
          x: pos.x,
          dy: idx === 0 ? "0" : lb.lineHeight.toFixed(2),
        });
        tspan.textContent = lineStr;
        textEl.appendChild(tspan);
      });
    }
  }

  let lastLayoutStageBucket = null;

  function relayoutForViewport(forceReset = false) {
    const size = currentStageSize();
    const bucket = `${Math.round(size.w / 60)}x${Math.round(size.h / 60)}`;
    if (!forceReset && bucket === lastLayoutStageBucket) {
      updateLabelsAndHalos();
      return;
    }
    lastLayoutStageBucket = bucket;

    const narrow = size.w < 500;
    const curLabelOpts = narrow ? { ...labelOpts, maxChars: 16 } : labelOpts;
    const targetCss = isMobileSheetViewport(getViewportWidth()) ? 12.5 : DEFAULT_LABEL_CSS_PX;

    // Lay out in stage-matched aspect ratio so mobile uses 2x3 portrait flow
    // (avoiding horizontal crowding) and desktop uses wide landscape flow.
    const simW = narrow ? Math.max(size.w, 320) : Math.max(size.w, 640);
    const simH = narrow ? Math.max(size.h, 420) : Math.max(size.h, 440);
    const baseFont = narrow ? 15 : DEFAULT_LABEL_CSS_PX;
    const padX = narrow ? 14 : 20;
    const padY = narrow ? 14 : 16;

    laidOutPositions = layoutWithLabels(rawGraph, {
      width: simW,
      height: simH,
      ...curLabelOpts,
      fontSize: baseFont,
      padX,
      padY,
    });
    validGraph = { nodes: positionedNodes, edges: allEdges, positions: laidOutPositions };

    const margin = narrow ? 22 : 48;
    const topClearance = narrow ? 96 : 56;
    baseViewBox = viewBoxFor(validGraph, {
      width: size.w,
      height: size.h,
      margin,
      topClearance,
      ...curLabelOpts,
      fontSize: baseFont,
    });

    // If actual rendered upp grew the SVG font size beyond baseFont and caused
    // any box overlap, run one bounded separation pass at the capped actual font.
    const actualUpp = baseViewBox.w / size.w;
    const actualFont = Math.min(26, labelFontSizeFor(actualUpp, { targetCssPx: targetCss }));
    if (
      actualFont > baseFont + 1.5 &&
      countLabelOverlaps(validGraph, { ...curLabelOpts, fontSize: actualFont }) > 0
    ) {
      laidOutPositions = layoutWithLabels(validGraph, {
        width: simW,
        height: simH,
        ...curLabelOpts,
        fontSize: actualFont,
        padX: 12,
        padY: 12,
      });
      validGraph = { nodes: positionedNodes, edges: allEdges, positions: laidOutPositions };
      baseViewBox = viewBoxFor(validGraph, {
        width: size.w,
        height: size.h,
        margin,
        topClearance,
        ...curLabelOpts,
        fontSize: actualFont,
      });
    }

    viewBox = { ...baseViewBox };
    applyPositionsToSvg();
    applyViewBox();
  }

  function applyViewBox() {
    svg.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
    updateLabelsAndHalos();
  }

  function clientToWorld(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return { x: viewBox.x + viewBox.w * 0.5, y: viewBox.y + viewBox.h * 0.5 };
    }
    return {
      x: viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.w,
      y: viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.h,
    };
  }

  function zoomByCenter(factor) {
    viewBox = zoomAround(
      viewBox,
      viewBox.x + viewBox.w * 0.5,
      viewBox.y + viewBox.h * 0.5,
      factor,
      { baseViewBox },
    );
    applyViewBox();
  }

  function resetView() {
    viewBox = { ...baseViewBox };
    applyViewBox();
  }

  zinBtn.addEventListener("click", () => zoomByCenter(1.25));
  zoutBtn.addEventListener("click", () => zoomByCenter(0.8));
  zresetBtn.addEventListener("click", () => resetView());

  // ---- Selection & dimming ----
  function updateSelectionState() {
    const activeEdgeSet = selectedId ? new Set(visibleEdges(validGraph, selectedId)) : null;
    const neighborIds = new Set();
    if (activeEdgeSet) {
      for (const e of activeEdgeSet) {
        if (e.from !== selectedId) neighborIds.add(e.from);
        if (e.to !== selectedId) neighborIds.add(e.to);
      }
    }

    for (const [id, g] of nodeEls) {
      const node = nodeById.get(id);
      const filteredOut = activeFilter !== "all" && node.kind !== activeFilter;
      const isSelected = selectedId === id;
      const isNeighbor = neighborIds.has(id);
      const isDim = filteredOut || (selectedId != null && !isSelected && !isNeighbor);
      g.classList.toggle("is-selected", isSelected);
      g.classList.toggle("is-neighbor", isNeighbor);
      g.classList.toggle("is-dim", isDim);
      g.setAttribute("aria-pressed", isSelected ? "true" : "false");

      const lbl = labelEls.get(id);
      if (lbl) {
        lbl.classList.toggle("is-selected", isSelected);
        lbl.classList.toggle("is-neighbor", isNeighbor);
        lbl.classList.toggle("is-dim", isDim);
      }
    }

    for (const { edge, el: line } of edgeEls) {
      const fromNode = nodeById.get(edge.from);
      const toNode = nodeById.get(edge.to);
      const filteredOut =
        activeFilter !== "all" &&
        fromNode?.kind !== activeFilter &&
        toNode?.kind !== activeFilter;
      const isActive = activeEdgeSet ? activeEdgeSet.has(edge) : false;
      const isDim = filteredOut || (selectedId != null && !isActive);
      line.classList.toggle("is-active", isActive);
      line.classList.toggle("is-dim", isDim);
    }
  }

  function syncSheetClasses() {
    const st = sheetStateFor(selectedId, getViewportWidth());
    const isMobile = st.mode === "sheet";
    const isSheetOpen = isMobile && st.open;

    // On mobile, portal backdrop + sheet to document.body so ancestor
    // animations/transforms on #view or <main> can never trap position:fixed.
    if (isMobile && doc.body) {
      if (sheetBackdrop.parentNode !== doc.body) doc.body.appendChild(sheetBackdrop);
      if (panel.parentNode !== doc.body) doc.body.appendChild(panel);
    } else {
      if (sheetBackdrop.parentNode !== grid) grid.appendChild(sheetBackdrop);
      if (panel.parentNode !== grid) grid.appendChild(panel);
    }

    panel.classList.toggle("is-sheet-open", isSheetOpen);
    panel.classList.toggle("is-sheet-closed", isMobile && !st.open);
    sheetBackdrop.classList.toggle("is-open", isSheetOpen);
    sheetBackdrop.setAttribute("aria-hidden", isSheetOpen ? "false" : "true");
  }

  // ---- Swipe-to-dismiss on mobile bottom sheet handle/header ----
  let sheetDragStartY = null;
  function wireSheetSwipe(handleEl) {
    handleEl.addEventListener("pointerdown", (e) => {
      if (!isMobileSheetViewport(getViewportWidth())) return;
      sheetDragStartY = e.clientY;
      panel.style.transition = "none";
      if (typeof handleEl.setPointerCapture === "function") {
        try { handleEl.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
    });
    handleEl.addEventListener("pointermove", (e) => {
      if (sheetDragStartY == null) return;
      const dy = Math.max(0, e.clientY - sheetDragStartY);
      panel.style.transform = `translateY(${dy}px)`;
    });
    const endSwipe = (e) => {
      if (sheetDragStartY == null) return;
      const dy = e.clientY - sheetDragStartY;
      sheetDragStartY = null;
      panel.style.transition = "";
      panel.style.transform = "";
      if (shouldDismissSheetSwipe(dy)) {
        select(null);
      }
    };
    handleEl.addEventListener("pointerup", endSwipe);
    handleEl.addEventListener("pointercancel", () => {
      sheetDragStartY = null;
      panel.style.transition = "";
      panel.style.transform = "";
    });
  }

  function renderPanel() {
    panel.textContent = "";
    const node = selectedId ? nodeById.get(selectedId) : null;
    syncSheetClasses();

    if (!node) {
      panel.classList.add("is-empty");
      const ringCount = positionedNodes.filter((n) => n.kind === "ring").length;
      const fmtCount = positionedNodes.filter((n) => n.kind === "format").length;
      const edgeCount = allEdges.length;

      panel.appendChild(el(doc, "p", "Network overview", "node-panel-eyebrow"));
      const stats = el(doc, "div", null, "node-panel-stats");
      const addStat = (val, lbl) => {
        const s = el(doc, "div", null, "node-panel-stat");
        s.appendChild(el(doc, "strong", String(val)));
        s.appendChild(el(doc, "span", lbl));
        stats.appendChild(s);
      };
      addStat(ringCount, ringCount === 1 ? "Ring" : "Rings");
      addStat(fmtCount, fmtCount === 1 ? "Template" : "Templates");
      addStat(edgeCount, edgeCount === 1 ? "Link" : "Links");
      panel.appendChild(stats);

      panel.appendChild(
        el(
          doc,
          "p",
          "Select a node on the map to inspect its connections and open it. Drag to pan, scroll to zoom.",
          "node-panel-summary",
        ),
      );

      // V78: the ≥2-dev + real-game-page gate is why a brand-new ring is
      // not here yet. State it on the populated view too, not only in the
      // empty state — reuse EMPTY_STATE_COPY verbatim, don't restate it.
      panel.appendChild(el(doc, "p", EMPTY_STATE_COPY, "node-panel-gate"));

      const quickHeading = el(doc, "p", "Nodes in view", "node-panel-subhead");
      panel.appendChild(quickHeading);
      const quickList = el(doc, "ul", null, "node-panel-quicklist");
      const inView = visibleNodesForFilter(positionedNodes, activeFilter);
      if (!inView.length) {
        quickList.appendChild(el(doc, "li",
          activeFilter === "format" ? "No templates in view yet." : "No rings in view yet.",
          "empty-state"));
      }
      for (const item of inView) {
        const li = el(doc, "li");
        const btn = el(doc, "button", null, "node-panel-conn-btn");
        btn.type = "button";
        btn.appendChild(el(doc, "span", displayLabelFor(item, labelOpts)));
        btn.appendChild(
          el(doc, "span", item.kind === "format" ? "Template" : "Ring", "node-panel-conn-rel"),
        );
        btn.addEventListener("click", () => select(item.id));
        li.appendChild(btn);
        quickList.appendChild(li);
      }
      panel.appendChild(quickList);
      return;
    }

    panel.classList.remove("is-empty");

    // Mobile grab handle for swipe-to-dismiss
    const grabArea = el(doc, "div", null, "node-sheet-handle-area");
    grabArea.appendChild(el(doc, "span", null, "node-sheet-handle"));
    wireSheetSwipe(grabArea);
    panel.appendChild(grabArea);

    const head = el(doc, "div", null, "node-panel-head");
    const kindWrap = el(doc, "div", null, "node-panel-kind");
    kindWrap.appendChild(
      el(doc, "span", node.kind === "format" ? "Campaign template" : "Ring"),
    );
    if (node.demo) {
      kindWrap.appendChild(el(doc, "span", "Demo", "demo-badge"));
    }
    head.appendChild(kindWrap);

    const closeBtn = el(doc, "button", "\u00d7", "node-panel-close");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close details");
    closeBtn.addEventListener("click", () => select(null));
    head.appendChild(closeBtn);
    panel.appendChild(head);

    const fullTitle = displayLabelFor(node, labelOpts);
    panel.appendChild(el(doc, "h3", fullTitle, "node-panel-title"));

    // For ring nodes, show game name as a quiet subtitle if it differs from ring title
    if (node.kind === "ring") {
      const gameName =
        trimStr(node.gameName) ||
        ringGames.get(node.ref) ||
        ringGames.get(node.id) ||
        (trimStr(node.label) !== fullTitle ? trimStr(node.label) : "");
      if (gameName && gameName !== fullTitle) {
        panel.appendChild(el(doc, "p", gameName, "node-panel-subtitle"));
      }
    }

    const usage = formatUsageLine(node);
    if (usage) {
      panel.appendChild(el(doc, "p", usage, "node-panel-usage"));
      if (typeof ctx.usageNote === "string" && ctx.usageNote) {
        panel.appendChild(el(doc, "p", ctx.usageNote, "node-panel-usage-note"));
      }
    }

    // V60: a template is the node of everybody who has posted it — show the
    // devs behind the posts, not just the ring count. Posters come from the
    // shell (ctx.postersByFormat, built from the same rings as the graph);
    // without it the panel simply shows no roster.
    if (node.kind === "format") {
      const posters =
        ctx.postersByFormat instanceof Map
          ? ctx.postersByFormat.get(String(node.ref || "").toLowerCase()) || []
          : [];
      if (posters.length > 0) {
        panel.appendChild(el(doc, "p", "Posted by", "node-panel-subhead"));
        const plist = el(doc, "ul", null, "node-panel-posters");
        for (const p of posters) {
          const li = el(doc, "li");
          li.appendChild(el(doc, "span", p.name || p.handle, "node-panel-poster-name"));
          const inRings = (p.rings || [])
            .map((x) => x.ringTitle)
            .filter(Boolean)
            .join(", ");
          if (inRings) {
            li.appendChild(el(doc, "span", `in ${inRings}`, "node-panel-poster-rings"));
          }
          plist.appendChild(li);
        }
        panel.appendChild(plist);
      }
    }

    const openBtn = el(
      doc,
      "button",
      node.kind === "format" ? "Open template" : "Open ring",
      "primary node-panel-open",
    );
    openBtn.type = "button";
    openBtn.addEventListener("click", () => {
      if (typeof ctx.onOpenNode === "function") ctx.onOpenNode(node);
    });
    panel.appendChild(openBtn);

    const touching = visibleEdges(validGraph, node.id);
    if (touching.length > 0) {
      panel.appendChild(el(doc, "p", "Connections", "node-panel-subhead"));
      const list = el(doc, "ul", null, "node-panel-connections");
      for (const edge of touching) {
        const isFrom = edge.from === node.id;
        const otherId = isFrom ? edge.to : edge.from;
        const other = nodeById.get(otherId);
        if (!other) continue;
        const relSpec = EDGE_RELATION_LABELS[edge.kind] || { from: edge.kind, to: edge.kind };
        const relText = isFrom ? relSpec.from : relSpec.to;

        const li = el(doc, "li");
        const btn = el(doc, "button", null, "node-panel-conn-btn");
        btn.type = "button";
        btn.appendChild(el(doc, "span", displayLabelFor(other, labelOpts)));
        btn.appendChild(el(doc, "span", relText, "node-panel-conn-rel"));
        btn.addEventListener("click", () => select(other.id));
        li.appendChild(btn);
        list.appendChild(li);
      }
      panel.appendChild(list);
    }
  }

  function select(id) {
    selectedId = id != null && nodeById.has(id) ? id : null;
    updateSelectionState();
    renderPanel();
  }

  // ---- Pointer pan, pinch-zoom, and tap selection ----
  const activePointers = new Map();
  let dragStart = null;
  let moved = false;
  let pinchStartDist = 0;

  function onPointerDown(e) {
    if (e.button != null && e.button !== 0 && e.pointerType === "mouse") return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (typeof svg.setPointerCapture === "function") {
      try {
        svg.setPointerCapture(e.pointerId);
      } catch {
        // Ignore synthetic/unsupported capture errors.
      }
    }
    if (activePointers.size === 1) {
      dragStart = {
        x: e.clientX,
        y: e.clientY,
        vb: { ...viewBox },
      };
      moved = false;
    } else if (activePointers.size === 2) {
      const pts = [...activePointers.values()];
      pinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      dragStart = null;
      moved = true;
    }
  }

  function onPointerMove(e) {
    if (!activePointers.has(e.pointerId)) return;
    const prev = activePointers.get(e.pointerId);
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 2) {
      const pts = [...activePointers.values()];
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (pinchStartDist > 0 && dist > 0) {
        const midX = (pts[0].x + pts[1].x) * 0.5;
        const midY = (pts[0].y + pts[1].y) * 0.5;
        const worldMid = clientToWorld(midX, midY);
        const factor = dist / pinchStartDist;
        pinchStartDist = dist;
        viewBox = zoomAround(viewBox, worldMid.x, worldMid.y, factor, { baseViewBox });
        applyViewBox();
      }
      return;
    }

    if (dragStart && activePointers.size === 1) {
      const dxPx = e.clientX - dragStart.x;
      const dyPx = e.clientY - dragStart.y;
      if (!moved && Math.hypot(dxPx, dyPx) >= 5) {
        moved = true;
      }
      if (moved) {
        const rect = svg.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) {
          const stepDx = -((e.clientX - prev.x) / rect.width) * viewBox.w;
          const stepDy = -((e.clientY - prev.y) / rect.height) * viewBox.h;
          viewBox = panBy(viewBox, stepDx, stepDy, validGraph, radiusOpt);
          applyViewBox();
        }
      }
    }
  }

  function onPointerUp(e) {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) pinchStartDist = 0;

    if (!moved && dragStart && activePointers.size === 0) {
      const worldPt = clientToWorld(e.clientX, e.clientY);
      const hit = nodeAtPoint(validGraph, worldPt.x, worldPt.y, {
        ...radiusOpt,
        unitsPerPx: currentUnitsPerPx(),
      });
      select(hit ? hit.id : null);
    }
    if (activePointers.size === 0) {
      dragStart = null;
      moved = false;
    }
  }

  function onPointerCancel(e) {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) pinchStartDist = 0;
    if (activePointers.size === 0) {
      dragStart = null;
      moved = false;
    }
  }

  function onWheel(e) {
    e.preventDefault();
    const worldPt = clientToWorld(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    viewBox = zoomAround(viewBox, worldPt.x, worldPt.y, factor, { baseViewBox });
    applyViewBox();
  }

  function onKeyDown(e) {
    if (e.key === "Escape" && selectedId != null) {
      select(null);
    }
  }

  function onResize() {
    relayoutForViewport(false);
    syncSheetClasses();
  }

  svg.addEventListener("pointerdown", onPointerDown);
  svg.addEventListener("pointermove", onPointerMove);
  svg.addEventListener("pointerup", onPointerUp);
  svg.addEventListener("pointercancel", onPointerCancel);
  svg.addEventListener("wheel", onWheel, { passive: false });
  section.addEventListener("keydown", onKeyDown);

  let resizeObserver = null;
  if (typeof globalThis.ResizeObserver === "function") {
    resizeObserver = new globalThis.ResizeObserver(() => onResize());
    resizeObserver.observe(svg);
  } else if (win && typeof win.addEventListener === "function") {
    win.addEventListener("resize", onResize);
  }

  relayoutForViewport(true);
  updateSelectionState();
  renderPanel();

  return {
    destroy() {
      svg.removeEventListener("pointerdown", onPointerDown);
      svg.removeEventListener("pointermove", onPointerMove);
      svg.removeEventListener("pointerup", onPointerUp);
      svg.removeEventListener("pointercancel", onPointerCancel);
      svg.removeEventListener("wheel", onWheel);
      section.removeEventListener("keydown", onKeyDown);
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else if (win && typeof win.removeEventListener === "function") {
        win.removeEventListener("resize", onResize);
      }
      if (sheetBackdrop.parentNode === doc.body) sheetBackdrop.remove();
      if (panel.parentNode === doc.body) panel.remove();
    },
    select,
    resetView,
    getViewBox: () => ({ ...viewBox }),
  };
}
