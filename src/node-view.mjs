// V52 — 2D Node View UI (SVG).
// Replaces the split discovery lists (Campaigns + Similar games + Popular)
// with one data-based 2D node net inspired by Idra's Net.
//
// Takes a graph `{ nodes, edges, positions }` as input — never imports
// src/graph.mjs. Pure geometry/query helpers live at the top (zero DOM);
// DOM + SVG + pointer/keyboard interaction live strictly inside mount().
// No storage, no network, no scores for people, no animated transitions.

const SVG_NS = "http://www.w3.org/2000/svg";

export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 4;
export const DEFAULT_WIDTH = 800;
export const DEFAULT_HEIGHT = 520;
export const HALO_MIN_RADIUS = 22; // >= 44px diameter tap target

export const EMPTY_STATE_COPY =
  "Rings appear here once two devs are in and a real game page (Steam or itch.io) is attached.";

export const START_RING_ACTION = Object.freeze({
  label: "Start a ring",
  route: "#/rings",
  help: "Pick one of your game\u2019s posts, invite other devs, and they amplify it in their own words.",
});

export const NEW_TEMPLATE_ACTION = Object.freeze({
  label: "New campaign template",
  route: "#/campaigns/new",
  help: "Write a reusable post shape and disclosure line so any ring can pick it up and run it.",
});

const EDGE_RELATION_LABELS = Object.freeze({
  runs: { from: "Runs template", to: "Run by ring" },
  "shares-member": { from: "Shares a dev", to: "Shares a dev" },
  "shares-tag": { from: "Similar tags", to: "Similar tags" },
});

// --------------------------------------------------------------- pure ---

function isFiniteNum(v) {
  return typeof v === "number" && Number.isFinite(v);
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
 * Bigger/heavier nodes are the formats more rings run (or larger rings).
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
 * Non-finite inputs fall back to 1 (clamped into [min, max]).
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
 * When `opts.baseViewBox` is provided, clamping is enforced against the total
 * zoom relative to `baseViewBox.w`; otherwise `factor` is clamped directly via
 * `clampZoom(factor, opts)`.
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
 * When `bounds` is given (a graph, `{ minX, maxX, minY, maxY }`, or a base
 * viewBox `{ x, y, w, h }`), panning is clamped so at least a sliver of the
 * content remains inside the viewport — you can never push every node out of frame.
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
 * Returns the matching node or null. On overlap, prefers the smallest visible
 * radius first (so small nodes sitting on a large node stay tappable), then
 * closest center distance, then topmost (highest index in `graph.nodes`).
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
 * Edges touching `selectedId`, or all edges when nothing is selected.
 */
export function visibleEdges(graph, selectedId) {
  if (!graph || !Array.isArray(graph.edges)) return [];
  const edges = graph.edges.filter((e) => e && e.from != null && e.to != null);
  if (selectedId == null || selectedId === "") return edges;
  return edges.filter((e) => e.from === selectedId || e.to === selectedId);
}

/**
 * Initial viewBox containing every positioned node (plus radius and label
 * allowance) with `margin`, preserving the viewport aspect ratio.
 * Empty or unpositioned graphs return a sane default viewBox, never NaN.
 */
export function viewBoxFor(graph, opts = {}) {
  const width = isFiniteNum(opts.width) && opts.width > 0 ? opts.width : DEFAULT_WIDTH;
  const height = isFiniteNum(opts.height) && opts.height > 0 ? opts.height : DEFAULT_HEIGHT;
  const margin = isFiniteNum(opts.margin) && opts.margin >= 0 ? opts.margin : 64;
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
    const r = resolveRadius(node, opts.radiusFor);
    // Reserve horizontal + bottom space for the SVG label underneath each node.
    const labelBottom = r + 22;
    const labelSide = Math.max(r, 42);
    if (pos.x - labelSide < minX) minX = pos.x - labelSide;
    if (pos.x + labelSide > maxX) maxX = pos.x + labelSide;
    if (pos.y - r < minY) minY = pos.y - r;
    if (pos.y + labelBottom > maxY) maxY = pos.y + labelBottom;
  }

  if (!Number.isFinite(minX)) {
    return { x: 0, y: 0, w: width, h: height };
  }

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

/**
 * Positions for a graph: `graph.positions` wins when present; otherwise
 * fall back to `ctxPositions` (the positions the mount site computed
 * alongside the graph). The two can disagree when the app shell and the
 * view are cached at different versions — V54 proved it live: the v0.2.27
 * shell built the graph WITHOUT positions attached (fixed in app.js by
 * c681594) yet still passed positions as a separate mount argument, so a
 * mount that reads only `graph.positions` renders the empty state with
 * nodes in hand. A missing/empty candidate never wins over a populated one.
 */
export function resolvePositions(graph, ctxPositions) {
  const hasEntries = (p) => {
    if (p instanceof Map) return p.size > 0;
    return !!p && typeof p === "object" && Object.keys(p).length > 0;
  };
  if (hasEntries(graph?.positions)) return graph.positions;
  if (hasEntries(ctxPositions)) return ctxPositions;
  return graph?.positions ?? ctxPositions ?? new Map();
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
 * mount(rootEl, ctx) — renders the 2D SVG node view with create actions,
 * filter chips, pan/zoom controls, keyboard access, and Idra-style detail panel.
 *
 * ctx: {
 *   graph: { nodes, edges, positions },
 *   onOpenNode(node),
 *   onStartRing(),
 *   onNewTemplate(),
 *   usageNote?,
 *   width?,
 *   height?,
 *   radiusFor?,
 *   location?,
 * }
 */
export function mount(rootEl, ctx = {}) {
  const doc = rootEl.ownerDocument;
  rootEl.textContent = "";

  const graph = ctx.graph && typeof ctx.graph === "object"
    ? ctx.graph
    : { nodes: [], edges: [], positions: new Map() };
  // V54: positions may arrive beside the graph (ctx.positions) when the
  // mount site built them separately — use them when graph.positions is
  // missing, e.g. a stale shell that never attached them (see
  // resolvePositions). Never let a present graph.positions be overridden.
  const positions = resolvePositions(graph, ctx.positions);
  const allNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const positionedNodes = allNodes.filter((n) => n && n.id != null && positionOf(positions, n.id));
  const nodeById = new Map(positionedNodes.map((n) => [n.id, n]));
  const allEdges = (Array.isArray(graph.edges) ? graph.edges : []).filter(
    (e) => e && nodeById.has(e.from) && nodeById.has(e.to),
  );
  const validGraph = { nodes: positionedNodes, edges: allEdges, positions: positions };

  const width = isFiniteNum(ctx.width) && ctx.width > 0 ? ctx.width : DEFAULT_WIDTH;
  const height = isFiniteNum(ctx.height) && ctx.height > 0 ? ctx.height : DEFAULT_HEIGHT;
  const radiusOpt = typeof ctx.radiusFor === "function" ? { radiusFor: ctx.radiusFor } : {};

  const baseViewBox = viewBoxFor(validGraph, { width, height, ...radiusOpt });
  let viewBox = { ...baseViewBox };
  let selectedId = null;
  let activeFilter = "all"; // 'all' | 'ring' | 'format'

  const section = el(doc, "section", null, "node-view");
  rootEl.appendChild(section);

  // ---- Create actions (V49 requirement: visible without scrolling) ----
  const actionsBar = el(doc, "div", null, "node-view-actions");

  const startWrap = el(doc, "div", null, "node-action");
  const startBtn = el(doc, "button", START_RING_ACTION.label, "primary node-action-start");
  startBtn.type = "button";
  startBtn.addEventListener("click", () => {
    if (typeof ctx.onStartRing === "function") ctx.onStartRing();
    else setHashFallback(ctx, START_RING_ACTION.route);
  });
  startWrap.appendChild(startBtn);
  startWrap.appendChild(el(doc, "p", START_RING_ACTION.help, "node-action-help view-lede"));
  actionsBar.appendChild(startWrap);

  const tmplWrap = el(doc, "div", null, "node-action");
  const tmplBtn = el(doc, "button", NEW_TEMPLATE_ACTION.label, "node-action-template");
  tmplBtn.type = "button";
  tmplBtn.addEventListener("click", () => {
    if (typeof ctx.onNewTemplate === "function") ctx.onNewTemplate();
    else setHashFallback(ctx, NEW_TEMPLATE_ACTION.route);
  });
  tmplWrap.appendChild(tmplBtn);
  tmplWrap.appendChild(el(doc, "p", NEW_TEMPLATE_ACTION.help, "node-action-help view-lede"));
  actionsBar.appendChild(tmplWrap);

  section.appendChild(actionsBar);

  // ---- Empty state: honest share requirement, never softened ----
  if (positionedNodes.length === 0) {
    section.appendChild(el(doc, "p", EMPTY_STATE_COPY, "node-empty empty-state"));
    return {
      destroy() {},
      select() {},
      resetView() {},
      getViewBox: () => ({ ...viewBox }),
    };
  }

  // ---- Filter chips (All / Rings / Templates) ----
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
  section.appendChild(filtersBar);

  // ---- Main grid: SVG net stage + Idra-style detail panel ----
  const grid = el(doc, "div", null, "node-view-grid");
  const stage = el(doc, "div", null, "node-stage");
  const panel = el(doc, "aside", null, "node-panel is-empty");
  panel.setAttribute("aria-live", "polite");
  grid.appendChild(stage);
  grid.appendChild(panel);
  section.appendChild(grid);

  // ---- SVG canvas ----
  const svg = svgEl(doc, "svg", {
    class: "node-svg",
    viewBox: `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`,
    role: "application",
    "aria-label": "Interactive map of rings and campaign templates. Tap or press Enter on a node to inspect it.",
  });
  svg.style.touchAction = "none";
  stage.appendChild(svg);

  const edgesGroup = svgEl(doc, "g", { class: "node-edges" });
  const nodesGroup = svgEl(doc, "g", { class: "node-nodes" });
  svg.appendChild(edgesGroup);
  svg.appendChild(nodesGroup);

  const edgeEls = [];
  for (const edge of allEdges) {
    const fromPos = positionOf(positions, edge.from);
    const toPos = positionOf(positions, edge.to);
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
  for (const node of positionedNodes) {
    const pos = positionOf(positions, node.id);
    const r = resolveRadius(node, ctx.radiusFor);
    const haloR = haloRadiusFor(node, ctx.radiusFor, viewBox.w / width);
    const isFormat = node.kind === "format";
    const kindWord = isFormat ? "Campaign template" : "Ring";
    const usage = formatUsageLine(node);
    const ariaText = `${node.label || node.id}, ${kindWord}${usage ? `, ${usage}` : ""}`;

    const g = svgEl(doc, "g", {
      class: `node-item ${isFormat ? "node-item--format" : "node-item--ring"}`,
      transform: `translate(${pos.x},${pos.y})`,
      tabindex: "0",
      role: "button",
      "aria-label": ariaText,
      "data-node-id": node.id,
    });

    // Transparent hit halo for >= 44 CSS px tap target (scaled on viewBox/resize)
    const halo = svgEl(doc, "circle", {
      class: "node-halo",
      r: haloR,
      fill: "transparent",
    });
    g.appendChild(halo);
    haloEls.set(node.id, halo);

    // Visually distinct shape: circle for ring, hexagon for campaign template
    if (isFormat) {
      g.appendChild(
        svgEl(doc, "polygon", {
          class: "node-shape node-shape--format",
          points: hexPoints(r),
        }),
      );
    } else {
      g.appendChild(
        svgEl(doc, "circle", {
          class: "node-shape node-shape--ring",
          r,
        }),
      );
    }

    const label = svgEl(doc, "text", {
      class: "node-label",
      y: r + 15,
      "text-anchor": "middle",
    });
    label.textContent = node.label || node.id;
    g.appendChild(label);

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
  }

  // ---- Zoom controls (+ / − / reset) ----
  const tools = el(doc, "div", null, "node-tools");
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

  stage.appendChild(
    el(
      doc,
      "div",
      "Circle = ring \u00b7 Hex = template \u00b7 Size = usage \u00b7 Drag to pan \u00b7 Scroll to zoom",
      "node-hint",
    ),
  );

  // Honest-limits note at the foot of the view when formats are present
  const hasFormats = positionedNodes.some((n) => n.kind === "format");
  if (hasFormats && typeof ctx.usageNote === "string" && ctx.usageNote) {
    section.appendChild(el(doc, "p", ctx.usageNote, "node-view-footnote view-lede"));
  }

  // ---- ViewBox application & screen-px halo scaling (instant, zero animation) ----
  function currentUnitsPerPx() {
    const rect = svg.getBoundingClientRect();
    if (rect && isFiniteNum(rect.width) && rect.width > 0) {
      return viewBox.w / rect.width;
    }
    return viewBox.w / width;
  }

  function updateHalos() {
    const upp = currentUnitsPerPx();
    for (const [id, halo] of haloEls) {
      const node = nodeById.get(id);
      halo.setAttribute("r", String(haloRadiusFor(node, ctx.radiusFor, upp)));
    }
  }

  function applyViewBox() {
    svg.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
    updateHalos();
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

  function renderPanel() {
    panel.textContent = "";
    const node = selectedId ? nodeById.get(selectedId) : null;
    if (!node) {
      panel.classList.add("is-empty");
      panel.appendChild(
        el(doc, "p", "Tap a node to inspect its connections and open it.", "view-lede"),
      );
      return;
    }
    panel.classList.remove("is-empty");

    const head = el(doc, "div", null, "node-panel-head");
    const kindWrap = el(doc, "div", null, "node-panel-kind");
    kindWrap.appendChild(
      el(doc, "span", node.kind === "format" ? "Campaign template" : "Ring"),
    );
    if (node.demo) {
      kindWrap.appendChild(el(doc, "span", "DEMO", "demo-badge"));
    }
    head.appendChild(kindWrap);

    const closeBtn = el(doc, "button", "\u00d7", "node-panel-close");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close details");
    closeBtn.addEventListener("click", () => select(null));
    head.appendChild(closeBtn);
    panel.appendChild(head);

    panel.appendChild(el(doc, "h3", node.label || node.id, "node-panel-title"));

    const usage = formatUsageLine(node);
    if (usage) {
      panel.appendChild(el(doc, "p", usage, "node-panel-usage"));
      if (typeof ctx.usageNote === "string" && ctx.usageNote) {
        panel.appendChild(el(doc, "p", ctx.usageNote, "node-panel-usage-note"));
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
        btn.appendChild(el(doc, "span", other.label || other.id));
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

  svg.addEventListener("pointerdown", onPointerDown);
  svg.addEventListener("pointermove", onPointerMove);
  svg.addEventListener("pointerup", onPointerUp);
  svg.addEventListener("pointercancel", onPointerCancel);
  svg.addEventListener("wheel", onWheel, { passive: false });
  section.addEventListener("keydown", onKeyDown);

  const win = doc.defaultView || (typeof globalThis.window !== "undefined" ? globalThis.window : null);
  let resizeObserver = null;
  if (typeof globalThis.ResizeObserver === "function") {
    resizeObserver = new globalThis.ResizeObserver(() => updateHalos());
    resizeObserver.observe(svg);
  } else if (win && typeof win.addEventListener === "function") {
    win.addEventListener("resize", updateHalos);
  }

  updateHalos();
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
        win.removeEventListener("resize", updateHalos);
      }
    },
    select,
    resetView,
    getViewBox: () => ({ ...viewBox }),
  };
}
