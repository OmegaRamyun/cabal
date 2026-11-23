// V34 — Shadow Cabal background (2D gradient-noise canvas).
// Slow, heavy Dark Souls menu atmosphere: drifting ash fog and sparse
// bonfire embers on a near-black ground, sitting behind a protective scrim
// so feed, composer, and campaign cards always stay legible.
//
// Zero network, zero storage writes, zero dependencies. Respects
// prefers-reduced-motion (renders one static frame, starts no loop),
// caps devicePixelRatio, pauses when the tab is hidden, and degrades
// gracefully inside zero-sized or headless embed iframes.

export const DEFAULT_SEED = 0x5caba1;
export const MAX_DPR = 1.5;
export const DEFAULT_TARGET_FPS = 30;
export const MAX_DT_SEC = 0.1;

export const DEFAULT_FOG_COUNT = 6;
export const DEFAULT_EMBER_COUNT = 32;
export const COMPACT_EMBER_COUNT = 18;
export const COMPACT_BREAKPOINT_PX = 640;

export const PALETTES = Object.freeze({
  dark: Object.freeze({
    ground: '#09080b',
    vignette: 'rgba(4, 3, 6, 0.72)',
    fogs: Object.freeze([
      // Verifier fix (V34 review): the original 0.24/0.20/0.18 alphas
      // composited ~2 levels above the ground once the 0.58 scrim was
      // applied — banding-level, invisible. Raised to 0.45–0.50 and
      // warmed so the drift actually reads through the scrim.
      'rgba(52, 40, 58, 0.50)',
      'rgba(40, 46, 58, 0.45)',
      'rgba(78, 46, 26, 0.48)',
    ]),
    embers: Object.freeze([
      '#d4a259', // muted bonfire gold
      '#c86a2b', // warm ember
      '#9b3b1e', // deep coal
      '#e6c387', // pale ash-gold
    ]),
  }),
  light: Object.freeze({
    ground: '#f5f3ef',
    vignette: 'rgba(218, 211, 198, 0.35)',
    fogs: Object.freeze([
      // Same verifier fix as the dark palette: raised so the fallback
      // is not invisible either.
      'rgba(164, 152, 136, 0.30)',
      'rgba(148, 146, 154, 0.26)',
      'rgba(176, 142, 110, 0.28)',
    ]),
    embers: Object.freeze([
      '#9a6b2f', // tarnished bronze
      '#8f4a24', // muted rust
      '#7a5c3a', // warm umber
      '#b08546', // dull gold
    ]),
  }),
});

/**
 * Hard bounds for the readability guard.
 * Scrim opacity has a floor so the backdrop never fights body text;
 * canvas opacity has a ceiling so embers stay atmospheric, never loud.
 */
export const SCRIM_BOUNDS = Object.freeze({
  dark: Object.freeze({
    scrimColor: '#09080b',
    defaultScrimOpacity: 0.58,
    minScrimOpacity: 0.45,
    maxScrimOpacity: 0.85,
    defaultCanvasOpacity: 0.75,
    minCanvasOpacity: 0.25,
    maxCanvasOpacity: 0.85,
  }),
  light: Object.freeze({
    scrimColor: '#f5f3ef',
    defaultScrimOpacity: 0.72,
    minScrimOpacity: 0.55,
    maxScrimOpacity: 0.9,
    defaultCanvasOpacity: 0.45,
    minCanvasOpacity: 0.15,
    maxCanvasOpacity: 0.65,
  }),
});

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * createRng(seed) -> () => number in [0, 1)
 * Deterministic Mulberry32 PRNG. Pure for a given seed.
 */
export function createRng(seed = DEFAULT_SEED) {
  let state = (Number(seed) >>> 0) || DEFAULT_SEED;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * prefersReducedMotion(win) -> boolean
 * Reads the OS/browser reduced-motion preference safely (defaults false in Node).
 */
export function prefersReducedMotion(win = globalThis) {
  try {
    if (!win || typeof win.matchMedia !== 'function') return false;
    return Boolean(win.matchMedia('(prefers-reduced-motion: reduce)')?.matches);
  } catch {
    return false;
  }
}

/**
 * detectTheme(doc, win) -> 'dark' | 'light'
 * Follows Pico's convention: explicit [data-theme] wins, then
 * prefers-color-scheme, defaulting to 'dark' (the Dark Souls menu ground).
 */
export function detectTheme(doc = null, win = globalThis) {
  const attr = doc?.documentElement?.getAttribute?.('data-theme');
  if (attr === 'dark' || attr === 'light') return attr;
  try {
    if (win && typeof win.matchMedia === 'function') {
      if (win.matchMedia('(prefers-color-scheme: light)')?.matches) return 'light';
      if (win.matchMedia('(prefers-color-scheme: dark)')?.matches) return 'dark';
    }
  } catch {
    // Fall through to dark default.
  }
  return 'dark';
}

/**
 * computeScrim(options) -> { theme, scrimColor, scrimOpacity, canvasOpacity,
 *   bounds }
 * Pure readability guard: clamps scrim and canvas opacities inside
 * SCRIM_BOUNDS so body text contrast always remains intact.
 */
export function computeScrim(options = {}) {
  const theme = options.theme === 'light' ? 'light' : 'dark';
  const bounds = SCRIM_BOUNDS[theme];
  const reducedMotion = Boolean(options.reducedMotion);

  const rawScrim =
    options.scrimOpacity !== undefined
      ? Number(options.scrimOpacity)
      : bounds.defaultScrimOpacity;
  const rawCanvas =
    options.canvasOpacity !== undefined
      ? Number(options.canvasOpacity)
      : reducedMotion
        ? Math.min(bounds.defaultCanvasOpacity, 0.65)
        : bounds.defaultCanvasOpacity;

  const scrimOpacity = clamp(
    Number.isFinite(rawScrim) ? rawScrim : bounds.defaultScrimOpacity,
    bounds.minScrimOpacity,
    bounds.maxScrimOpacity,
  );
  const canvasOpacity = clamp(
    Number.isFinite(rawCanvas) ? rawCanvas : bounds.defaultCanvasOpacity,
    bounds.minCanvasOpacity,
    bounds.maxCanvasOpacity,
  );

  return {
    theme,
    scrimColor: bounds.scrimColor,
    scrimOpacity,
    canvasOpacity,
    bounds,
  };
}

/**
 * computeCanvasSize(width, height, dpr, maxDpr) ->
 *   { cssWidth, cssHeight, width, height, dpr, valid }
 * Caps devicePixelRatio and returns valid: false for collapsed/zero viewports
 * (e.g. hidden or unmounted embed iframes).
 */
export function computeCanvasSize(
  cssWidth,
  cssHeight,
  dpr = 1,
  maxDpr = MAX_DPR,
) {
  const w = Math.floor(Number(cssWidth) || 0);
  const h = Math.floor(Number(cssHeight) || 0);
  const cappedMax = Number.isFinite(maxDpr) && maxDpr > 0 ? maxDpr : MAX_DPR;
  const safeDpr = clamp(
    Number.isFinite(dpr) && dpr > 0 ? dpr : 1,
    1,
    cappedMax,
  );
  if (w <= 0 || h <= 0) {
    return { cssWidth: 0, cssHeight: 0, width: 0, height: 0, dpr: safeDpr, valid: false };
  }
  return {
    cssWidth: w,
    cssHeight: h,
    width: Math.max(1, Math.round(w * safeDpr)),
    height: Math.max(1, Math.round(h * safeDpr)),
    dpr: safeDpr,
    valid: true,
  };
}

/**
 * createField(seed, options) -> { seed, time, fogs, embers }
 * Generates the deterministic fog plumes and ember motes in normalized
 * [0, 1] viewport coordinates so resizing never reallocates the field.
 */
export function createField(seed = DEFAULT_SEED, options = {}) {
  const rng = createRng(seed);
  const fogCount =
    Number.isInteger(options.fogCount) && options.fogCount >= 0
      ? options.fogCount
      : DEFAULT_FOG_COUNT;
  const emberCount =
    Number.isInteger(options.emberCount) && options.emberCount >= 0
      ? options.emberCount
      : options.compact
        ? COMPACT_EMBER_COUNT
        : DEFAULT_EMBER_COUNT;

  const fogs = new Array(fogCount);
  for (let i = 0; i < fogCount; i++) {
    const dir = rng() < 0.5 ? -1 : 1;
    fogs[i] = {
      x: rng(),
      y: 0.15 + rng() * 0.75,
      radius: 0.28 + rng() * 0.26, // fraction of max(width, height)
      vx: dir * (0.0025 + rng() * 0.0045), // funeral pace: ~2-4 min per crossing
      vy: (rng() - 0.5) * 0.0018,
      driftAmp: 0.015 + rng() * 0.025,
      driftFreq: 0.08 + rng() * 0.1,
      phase: rng() * Math.PI * 2,
      alpha: 0.55 + rng() * 0.45,
      colorIndex: i % 3,
    };
  }

  const embers = new Array(emberCount);
  for (let i = 0; i < emberCount; i++) {
    embers[i] = {
      x: rng(),
      y: rng(),
      baseX: 0, // initialized below
      radius: 0.9 + rng() * 1.7, // CSS px core radius
      speedY: 0.008 + rng() * 0.016, // slow upward bonfire drift
      swayAmp: 0.008 + rng() * 0.022,
      swayFreq: 0.25 + rng() * 0.45,
      phase: rng() * Math.PI * 2,
      pulseFreq: 0.35 + rng() * 0.55,
      pulsePhase: rng() * Math.PI * 2,
      alpha: 0.18 + rng() * 0.28, // restrained brightness (<= 0.46)
      colorIndex: Math.floor(rng() * 4),
    };
    embers[i].baseX = embers[i].x;
  }

  return {
    seed: (Number(seed) >>> 0) || DEFAULT_SEED,
    time: 0,
    fogs,
    embers,
  };
}

/**
 * stepField(field, dtSec) -> field
 * Advances fog and ember positions in-place with zero allocations.
 * Clamps dtSec to [0, MAX_DT_SEC] so tab-resume never causes jumps.
 */
export function stepField(field, dtSec) {
  const dt = clamp(Number(dtSec) || 0, 0, MAX_DT_SEC);
  if (dt === 0) return field;
  field.time += dt;
  const t = field.time;

  const fogs = field.fogs;
  for (let i = 0; i < fogs.length; i++) {
    const f = fogs[i];
    f.x += f.vx * dt;
    f.y += (f.vy + Math.sin(t * f.driftFreq + f.phase) * f.driftAmp * 0.08) * dt;
    if (f.x < -0.35) f.x = 1.35;
    else if (f.x > 1.35) f.x = -0.35;
    if (f.y < -0.25) f.y = 1.25;
    else if (f.y > 1.25) f.y = -0.25;
  }

  const embers = field.embers;
  for (let i = 0; i < embers.length; i++) {
    const e = embers[i];
    e.y -= e.speedY * dt;
    if (e.y < -0.04) {
      e.y = 1.04;
    }
    e.x = e.baseX + Math.sin(t * e.swayFreq + e.phase) * e.swayAmp;
    if (e.x < -0.02) e.x += 1.04;
    else if (e.x > 1.02) e.x -= 1.04;
  }

  return field;
}

/**
 * renderFrame(ctx2d, field, options) -> boolean
 * Draws one frame (ground -> drifting fog plumes -> subtle vignette ->
 * bonfire embers). Returns true if drawn, false if ctx2d/size invalid.
 */
export function renderFrame(ctx2d, field, options = {}) {
  if (!ctx2d || !field) return false;
  const w = Number(options.width) || 0;
  const h = Number(options.height) || 0;
  if (w <= 0 || h <= 0) return false;

  const dpr = Number(options.dpr) > 0 ? Number(options.dpr) : 1;
  const theme = options.theme === 'light' ? 'light' : 'dark';
  const palette = options.palette || PALETTES[theme];
  const maxDim = Math.max(w, h);
  const t = field.time || 0;

  // 1. Base ground
  ctx2d.globalAlpha = 1;
  ctx2d.fillStyle = palette.ground;
  ctx2d.fillRect(0, 0, w, h);

  // 2. Drifting fog plumes
  const fogs = field.fogs;
  for (let i = 0; i < fogs.length; i++) {
    const f = fogs[i];
    const cx = f.x * w;
    const cy = f.y * h;
    const r = f.radius * maxDim;
    const grad = ctx2d.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, palette.fogs[f.colorIndex % palette.fogs.length]);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx2d.globalAlpha = f.alpha;
    ctx2d.fillStyle = grad;
    ctx2d.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  // 3. Soft gothic vignette framing the viewport edges
  const vig = ctx2d.createRadialGradient(
    w * 0.5,
    h * 0.45,
    maxDim * 0.18,
    w * 0.5,
    h * 0.5,
    maxDim * 0.78,
  );
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, palette.vignette);
  ctx2d.globalAlpha = 1;
  ctx2d.fillStyle = vig;
  ctx2d.fillRect(0, 0, w, h);

  // 4. Slow-rising bonfire embers (soft halo + tiny core)
  const embers = field.embers;
  for (let i = 0; i < embers.length; i++) {
    const e = embers[i];
    const cx = e.x * w;
    const cy = e.y * h;
    const pulse = 0.65 + 0.35 * Math.sin(t * e.pulseFreq + e.pulsePhase);
    // Fade gently near top and bottom edges so wrapping is invisible
    const edgeFade = clamp(Math.min(e.y / 0.12, (1 - e.y) / 0.08), 0, 1);
    const alpha = e.alpha * pulse * edgeFade;
    if (alpha <= 0.01) continue;

    const r = e.radius * dpr;
    const color = palette.embers[e.colorIndex % palette.embers.length];

    // Outer ember glow
    ctx2d.globalAlpha = alpha * 0.35;
    ctx2d.fillStyle = color;
    ctx2d.beginPath();
    ctx2d.arc(cx, cy, r * 2.6, 0, Math.PI * 2);
    ctx2d.fill();

    // Inner ember core
    ctx2d.globalAlpha = alpha;
    ctx2d.beginPath();
    ctx2d.arc(cx, cy, r, 0, Math.PI * 2);
    ctx2d.fill();
  }

  ctx2d.globalAlpha = 1;
  return true;
}

/**
 * mount(rootEl, ctx) — attaches a fixed backdrop container (.cabal-bg)
 * holding a 2D canvas (.cabal-bg-canvas) and readability scrim
 * (.cabal-bg-scrim) behind the app, then runs the throttled animation loop
 * (or renders one static frame when prefers-reduced-motion is active).
 *
 * ctx: { seed?, theme?, scrimOpacity?, canvasOpacity?, maxDpr?, targetFps?,
 *   win?, doc?, raf?, caf?, now? }
 * Returns { container, canvas, scrim, field, start, stop, resize,
 *   renderStatic, destroy, isRunning, isReducedMotion, getScrim }.
 */
export function mount(rootEl, ctx = {}) {
  const doc = ctx.doc ?? rootEl?.ownerDocument ?? globalThis.document;
  const win = ctx.win ?? doc?.defaultView ?? globalThis;
  const raf = ctx.raf ?? win?.requestAnimationFrame?.bind(win);
  const caf = ctx.caf ?? win?.cancelAnimationFrame?.bind(win);
  const now = ctx.now ?? (() => (win?.performance?.now ? win.performance.now() : Date.now()));

  const maxDpr = ctx.maxDpr ?? MAX_DPR;
  const targetFps = ctx.targetFps > 0 ? ctx.targetFps : DEFAULT_TARGET_FPS;
  const minFrameMs = 1000 / targetFps;
  const seed = ctx.seed ?? DEFAULT_SEED;

  let reducedMotion = prefersReducedMotion(win);
  let theme = ctx.theme ?? detectTheme(doc, win);
  let scrimState = computeScrim({
    theme,
    reducedMotion,
    scrimOpacity: ctx.scrimOpacity,
    canvasOpacity: ctx.canvasOpacity,
  });

  const initialWidth = Number(win?.innerWidth) || 0;
  const field = createField(seed, {
    compact: initialWidth > 0 && initialWidth <= COMPACT_BREAKPOINT_PX,
    fogCount: ctx.fogCount,
    emberCount: ctx.emberCount,
  });

  // Build DOM: <div class="cabal-bg" aria-hidden="true"><canvas ...><div class="cabal-bg-scrim"></div></div>
  const container = doc.createElement('div');
  container.className = 'cabal-bg';
  container.setAttribute('aria-hidden', 'true');
  container.setAttribute('role', 'presentation');

  const canvas = doc.createElement('canvas');
  canvas.className = 'cabal-bg-canvas';
  canvas.setAttribute('aria-hidden', 'true');

  const scrim = doc.createElement('div');
  scrim.className = 'cabal-bg-scrim';
  scrim.setAttribute('aria-hidden', 'true');

  container.appendChild(canvas);
  container.appendChild(scrim);

  const host = rootEl || doc.body;
  if (host) {
    if (typeof host.prepend === 'function') host.prepend(container);
    else if (typeof host.insertBefore === 'function') host.insertBefore(container, host.firstChild || null);
    else if (typeof host.appendChild === 'function') host.appendChild(container);
  }

  let ctx2d = null;
  try {
    ctx2d = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  } catch {
    ctx2d = null;
  }

  let size = computeCanvasSize(win?.innerWidth, win?.innerHeight, win?.devicePixelRatio, maxDpr);
  let rafId = null;
  let running = false;
  let destroyed = false;
  let lastFrameMs = 0;
  let staticFramesRendered = 0;

  function applyVisualStyles() {
    scrimState = computeScrim({
      theme,
      reducedMotion,
      scrimOpacity: ctx.scrimOpacity,
      canvasOpacity: ctx.canvasOpacity,
    });
    if (canvas.style) {
      canvas.style.opacity = String(scrimState.canvasOpacity);
    }
    if (scrim.style) {
      scrim.style.backgroundColor = scrimState.scrimColor;
      scrim.style.opacity = String(scrimState.scrimOpacity);
    }
  }

  function resize() {
    if (destroyed) return size;
    size = computeCanvasSize(win?.innerWidth, win?.innerHeight, win?.devicePixelRatio, maxDpr);
    if (size.valid) {
      if (canvas.width !== size.width) canvas.width = size.width;
      if (canvas.height !== size.height) canvas.height = size.height;
    }
    return size;
  }

  function renderStatic() {
    if (destroyed || !ctx2d || !size.valid) return false;
    const drawn = renderFrame(ctx2d, field, {
      width: size.width,
      height: size.height,
      dpr: size.dpr,
      theme,
    });
    if (drawn) staticFramesRendered += 1;
    return drawn;
  }

  function tick(ts) {
    if (destroyed || !running) return;
    const currentMs = typeof ts === 'number' ? ts : now();
    const elapsedMs = lastFrameMs ? currentMs - lastFrameMs : minFrameMs;
    // Verifier fix (V34 review): a bare `>= minFrameMs` (33.33 ms) against
    // 60 Hz frames arriving every ~16.7 ms lands just under the threshold
    // with jitter, so the tick skips and the loop runs at ~20 fps. A 2 ms
    // tolerance keeps the ~30 fps cadence.
    if (elapsedMs >= minFrameMs - 2) {
      lastFrameMs = currentMs;
      if (ctx2d && size.valid) {
        stepField(field, elapsedMs / 1000);
        renderFrame(ctx2d, field, {
          width: size.width,
          height: size.height,
          dpr: size.dpr,
          theme,
        });
      }
    }
    if (running && !destroyed && typeof raf === 'function') {
      rafId = raf(tick);
    }
  }

  function stop() {
    running = false;
    if (rafId !== null && typeof caf === 'function') {
      caf(rafId);
    }
    rafId = null;
  }

  function start() {
    if (destroyed) return false;
    resize();
    applyVisualStyles();

    // Hard requirement: reduced motion renders ONE static frame and runs no loop.
    if (reducedMotion) {
      stop();
      renderStatic();
      return false;
    }

    if (doc?.hidden || !ctx2d || !size.valid || typeof raf !== 'function') {
      stop();
      return false;
    }

    if (running) return true;
    running = true;
    lastFrameMs = now();
    renderFrame(ctx2d, field, {
      width: size.width,
      height: size.height,
      dpr: size.dpr,
      theme,
    });
    rafId = raf(tick);
    return true;
  }

  function onResize() {
    if (destroyed) return;
    resize();
    if (reducedMotion) {
      renderStatic();
    } else if (size.valid && !running && !doc?.hidden) {
      start();
    } else if (ctx2d && size.valid) {
      renderFrame(ctx2d, field, {
        width: size.width,
        height: size.height,
        dpr: size.dpr,
        theme,
      });
    }
  }

  function onVisibilityChange() {
    if (destroyed) return;
    if (doc?.hidden) {
      stop();
    } else if (!reducedMotion) {
      start();
    }
  }

  let motionQuery = null;
  function onMotionChange(event) {
    if (destroyed) return;
    reducedMotion = Boolean(event?.matches ?? prefersReducedMotion(win));
    applyVisualStyles();
    if (reducedMotion) {
      stop();
      renderStatic();
    } else if (!doc?.hidden) {
      start();
    }
  }

  let schemeQuery = null;
  function onSchemeChange() {
    if (destroyed || ctx.theme) return;
    theme = detectTheme(doc, win);
    applyVisualStyles();
    if (ctx2d && size.valid) {
      renderFrame(ctx2d, field, {
        width: size.width,
        height: size.height,
        dpr: size.dpr,
        theme,
      });
    }
  }

  win?.addEventListener?.('resize', onResize);
  doc?.addEventListener?.('visibilitychange', onVisibilityChange);

  try {
    if (typeof win?.matchMedia === 'function') {
      motionQuery = win.matchMedia('(prefers-reduced-motion: reduce)');
      motionQuery?.addEventListener?.('change', onMotionChange);
      schemeQuery = win.matchMedia('(prefers-color-scheme: dark)');
      schemeQuery?.addEventListener?.('change', onSchemeChange);
    }
  } catch {
    // Ignore matchMedia listener errors in restricted embed contexts.
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stop();
    win?.removeEventListener?.('resize', onResize);
    doc?.removeEventListener?.('visibilitychange', onVisibilityChange);
    motionQuery?.removeEventListener?.('change', onMotionChange);
    schemeQuery?.removeEventListener?.('change', onSchemeChange);
    if (typeof container.remove === 'function') container.remove();
    else container.parentNode?.removeChild?.(container);
  }

  start();

  return {
    container,
    canvas,
    scrim,
    field,
    start,
    stop,
    resize,
    renderStatic,
    destroy,
    isRunning: () => running,
    isReducedMotion: () => reducedMotion,
    getScrim: () => scrimState,
    getStaticFramesRendered: () => staticFramesRendered,
  };
}
