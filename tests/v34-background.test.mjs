import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SEED,
  MAX_DPR,
  MAX_DT_SEC,
  PALETTES,
  SCRIM_BOUNDS,
  COMPACT_EMBER_COUNT,
  DEFAULT_EMBER_COUNT,
  createRng,
  prefersReducedMotion,
  detectTheme,
  computeScrim,
  computeCanvasSize,
  createField,
  stepField,
  renderFrame,
  mount,
} from '../src/background.mjs';

// ---- Lightweight fake DOM / canvas / window helpers for Node tests ----

function createFakeCtx2d() {
  const calls = { fillRect: 0, arc: 0, fill: 0, createRadialGradient: 0 };
  return {
    calls,
    globalAlpha: 1,
    fillStyle: '',
    fillRect() {
      calls.fillRect += 1;
    },
    createRadialGradient() {
      calls.createRadialGradient += 1;
      return { addColorStop() {} };
    },
    beginPath() {},
    arc() {
      calls.arc += 1;
    },
    fill() {
      calls.fill += 1;
    },
  };
}

function createFakeEnv({
  width = 1280,
  height = 720,
  dpr = 2,
  reducedMotion = false,
  colorScheme = 'dark',
  hidden = false,
  nullContext = false,
} = {}) {
  const winListeners = new Map();
  const docListeners = new Map();
  const mqListeners = new Map();

  function add(map, type, fn) {
    if (!map.has(type)) map.set(type, new Set());
    map.get(type).add(fn);
  }
  function remove(map, type, fn) {
    map.get(type)?.delete(fn);
  }
  function emit(map, type, event) {
    for (const fn of [...(map.get(type) || [])]) fn(event);
  }

  const ctx2d = nullContext ? null : createFakeCtx2d();

  function makeElement(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      className: '',
      attributes: {},
      style: {},
      children: [],
      parentNode: null,
      width: 0,
      height: 0,
      setAttribute(k, v) {
        this.attributes[k] = String(v);
      },
      getAttribute(k) {
        return this.attributes[k] ?? null;
      },
      appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
      },
      prepend(child) {
        child.parentNode = this;
        this.children.unshift(child);
      },
      removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx >= 0) this.children.splice(idx, 1);
        child.parentNode = null;
      },
      remove() {
        if (this.parentNode) this.parentNode.removeChild(this);
      },
      getContext(kind) {
        return kind === '2d' ? ctx2d : null;
      },
    };
    return el;
  }

  const body = makeElement('body');
  const docEl = makeElement('html');

  const doc = {
    hidden,
    body,
    documentElement: docEl,
    createElement: makeElement,
    addEventListener: (t, fn) => add(docListeners, t, fn),
    removeEventListener: (t, fn) => remove(docListeners, t, fn),
    emit: (t, ev) => emit(docListeners, t, ev),
    listenerCount: (t) => docListeners.get(t)?.size || 0,
  };

  let nextRafId = 1;
  const rafQueue = new Map();
  let rafCalls = 0;
  let cafCalls = 0;
  let currentMs = 1000;

  const win = {
    innerWidth: width,
    innerHeight: height,
    devicePixelRatio: dpr,
    performance: { now: () => currentMs },
    matchMedia(query) {
      const matches =
        query === '(prefers-reduced-motion: reduce)'
          ? reducedMotion
          : query === `(prefers-color-scheme: ${colorScheme})`;
      return {
        media: query,
        matches,
        addEventListener: (t, fn) => add(mqListeners, `${query}:${t}`, fn),
        removeEventListener: (t, fn) => remove(mqListeners, `${query}:${t}`, fn),
      };
    },
    addEventListener: (t, fn) => add(winListeners, t, fn),
    removeEventListener: (t, fn) => remove(winListeners, t, fn),
    emit: (t, ev) => emit(winListeners, t, ev),
    listenerCount: (t) => winListeners.get(t)?.size || 0,
    mqListenerCount: (query) => mqListeners.get(`${query}:change`)?.size || 0,
    emitMqChange(query, matches) {
      if (query === '(prefers-reduced-motion: reduce)') reducedMotion = matches;
      emit(mqListeners, `${query}:change`, { matches, media: query });
    },
    requestAnimationFrame(cb) {
      rafCalls += 1;
      const id = nextRafId++;
      rafQueue.set(id, cb);
      return id;
    },
    cancelAnimationFrame(id) {
      cafCalls += 1;
      rafQueue.delete(id);
    },
  };

  doc.defaultView = win;
  body.ownerDocument = doc;

  return {
    win,
    doc,
    body,
    ctx2d,
    get rafCalls() {
      return rafCalls;
    },
    get cafCalls() {
      return cafCalls;
    },
    get pendingRafCount() {
      return rafQueue.size;
    },
    stepRaf(deltaMs = 40) {
      currentMs += deltaMs;
      const entries = [...rafQueue.entries()];
      rafQueue.clear();
      for (const [, cb] of entries) cb(currentMs);
    },
  };
}

// ---- Pure function tests ----

test('createRng and createField are deterministic for a given seed', () => {
  const a = createRng(DEFAULT_SEED);
  const b = createRng(DEFAULT_SEED);
  const c = createRng(DEFAULT_SEED + 1);

  const seqA = [a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b()];
  const seqC = [c(), c(), c(), c()];

  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);

  const fieldA = createField(42);
  const fieldB = createField(42);
  const fieldC = createField(99);

  assert.deepEqual(fieldA, fieldB);
  assert.notDeepEqual(fieldA.embers, fieldC.embers);
  assert.equal(fieldA.embers.length, DEFAULT_EMBER_COUNT);
  assert.equal(createField(42, { compact: true }).embers.length, COMPACT_EMBER_COUNT);

  for (const ember of fieldA.embers) {
    assert.ok(ember.x >= 0 && ember.x <= 1);
    assert.ok(ember.y >= 0 && ember.y <= 1);
    assert.ok(ember.alpha > 0 && ember.alpha <= 0.5, 'ember brightness stays restrained');
  }
});

test('stepField advances in place, clamps large dt, and wraps embers', () => {
  const field = createField(DEFAULT_SEED, { fogCount: 2, emberCount: 4 });
  const fogRef = field.fogs;
  const emberRef = field.embers;
  const firstEmber = field.embers[0];
  firstEmber.y = 0.001;
  firstEmber.speedY = 0.5;

  // Huge dt (e.g. after tab sleep) must clamp to MAX_DT_SEC
  stepField(field, 12.5);
  assert.equal(field.fogs, fogRef, 'no fog array reallocation');
  assert.equal(field.embers, emberRef, 'no ember array reallocation');
  assert.equal(field.time, MAX_DT_SEC);
  assert.equal(firstEmber.y, 1.04, 'ember wraps cleanly from top to bottom');

  // Zero or negative dt is a no-op
  const prevTime = field.time;
  stepField(field, 0);
  stepField(field, -2);
  assert.equal(field.time, prevTime);
});

test('computeScrim keeps scrim and canvas opacity strictly inside readability bounds', () => {
  for (const theme of ['dark', 'light']) {
    const b = SCRIM_BOUNDS[theme];

    const def = computeScrim({ theme });
    assert.ok(def.scrimOpacity >= b.minScrimOpacity && def.scrimOpacity <= b.maxScrimOpacity);
    assert.ok(def.canvasOpacity >= b.minCanvasOpacity && def.canvasOpacity <= b.maxCanvasOpacity);
    assert.equal(def.scrimColor, b.scrimColor);

    const tooLow = computeScrim({ theme, scrimOpacity: 0, canvasOpacity: -1 });
    assert.equal(tooLow.scrimOpacity, b.minScrimOpacity);
    assert.equal(tooLow.canvasOpacity, b.minCanvasOpacity);

    const tooHigh = computeScrim({ theme, scrimOpacity: 1, canvasOpacity: 2 });
    assert.equal(tooHigh.scrimOpacity, b.maxScrimOpacity);
    assert.equal(tooHigh.canvasOpacity, b.maxCanvasOpacity);

    const nan = computeScrim({ theme, scrimOpacity: NaN, canvasOpacity: NaN });
    assert.ok(nan.scrimOpacity >= b.minScrimOpacity && nan.scrimOpacity <= b.maxScrimOpacity);
    assert.ok(nan.canvasOpacity >= b.minCanvasOpacity && nan.canvasOpacity <= b.maxCanvasOpacity);
  }

  const reduced = computeScrim({ theme: 'dark', reducedMotion: true });
  assert.ok(reduced.canvasOpacity <= 0.65);
  assert.ok(reduced.scrimOpacity >= SCRIM_BOUNDS.dark.minScrimOpacity);
});

test('computeCanvasSize caps DPR and degrades cleanly on collapsed viewports', () => {
  const highDpr = computeCanvasSize(1000, 600, 3, MAX_DPR);
  assert.equal(highDpr.valid, true);
  assert.equal(highDpr.dpr, MAX_DPR);
  assert.equal(highDpr.width, Math.round(1000 * MAX_DPR));
  assert.equal(highDpr.height, Math.round(600 * MAX_DPR));

  const zero = computeCanvasSize(0, 500, 2);
  assert.equal(zero.valid, false);
  assert.equal(zero.width, 0);
  assert.equal(zero.height, 0);

  const neg = computeCanvasSize(-10, -20, 2);
  assert.equal(neg.valid, false);
});

test('prefersReducedMotion and detectTheme handle browser and Node defaults', () => {
  assert.equal(prefersReducedMotion(null), false);
  assert.equal(
    prefersReducedMotion({ matchMedia: () => ({ matches: true }) }),
    true,
  );
  assert.equal(
    prefersReducedMotion({
      matchMedia: () => {
        throw new Error('blocked');
      },
    }),
    false,
  );

  const darkDoc = { documentElement: { getAttribute: () => 'dark' } };
  const lightDoc = { documentElement: { getAttribute: () => 'light' } };
  assert.equal(detectTheme(darkDoc, null), 'dark');
  assert.equal(detectTheme(lightDoc, null), 'light');
  assert.equal(detectTheme(null, null), 'dark');
  assert.ok(PALETTES.dark.ground && PALETTES.light.ground);
});

test('renderFrame draws ground, fogs, vignette, and embers, and guards invalid inputs', () => {
  const field = createField(DEFAULT_SEED, { fogCount: 3, emberCount: 5 });
  const ctx2d = createFakeCtx2d();

  assert.equal(renderFrame(null, field, { width: 800, height: 600 }), false);
  assert.equal(renderFrame(ctx2d, field, { width: 0, height: 600 }), false);

  const ok = renderFrame(ctx2d, field, { width: 800, height: 600, dpr: 1, theme: 'dark' });
  assert.equal(ok, true);
  assert.ok(ctx2d.calls.fillRect >= 1 + 3 + 1, 'draws ground + fogs + vignette');
  assert.ok(ctx2d.calls.createRadialGradient >= 3 + 1, 'creates fog + vignette gradients');
  assert.ok(ctx2d.calls.arc > 0, 'draws ember halos and cores');
});

// ---- Mount / lifecycle tests ----

test('mount: prefers-reduced-motion renders ONE static frame and starts NO loop', () => {
  const env = createFakeEnv({ reducedMotion: true });
  const handle = mount(env.body, { win: env.win, doc: env.doc });

  assert.equal(handle.isReducedMotion(), true);
  assert.equal(handle.isRunning(), false);
  assert.equal(env.rafCalls, 0, 'no animation loop scheduled');
  assert.equal(handle.getStaticFramesRendered(), 1, 'exactly one static frame rendered');
  assert.ok(env.ctx2d.calls.fillRect > 0, 'static frame actually drew to canvas');

  // Calling start() manually still honors reduced motion and never starts a loop
  const started = handle.start();
  assert.equal(started, false);
  assert.equal(handle.isRunning(), false);
  assert.equal(env.rafCalls, 0);

  handle.destroy();
});

test('mount: pauses on visibilitychange hidden, resumes when visible, and destroy cleans up', () => {
  const env = createFakeEnv({ reducedMotion: false, dpr: 3 });
  const handle = mount(env.body, { win: env.win, doc: env.doc });

  assert.equal(handle.isRunning(), true);
  assert.equal(env.rafCalls, 1);
  assert.equal(handle.canvas.width, Math.round(1280 * MAX_DPR), 'DPR capped');
  assert.equal(env.body.children[0], handle.container, 'prepended behind app');
  assert.equal(handle.container.getAttribute('aria-hidden'), 'true');

  // Advance one frame
  env.stepRaf(50);
  assert.ok(handle.field.time > 0);
  assert.equal(env.rafCalls, 2);

  // Tab hidden -> pauses loop
  env.doc.hidden = true;
  env.doc.emit('visibilitychange');
  assert.equal(handle.isRunning(), false);
  assert.equal(env.pendingRafCount, 0);

  // Tab visible -> resumes loop
  env.doc.hidden = false;
  env.doc.emit('visibilitychange');
  assert.equal(handle.isRunning(), true);
  assert.equal(env.pendingRafCount, 1);

  // Live toggle to reduced motion stops loop immediately
  env.win.emitMqChange('(prefers-reduced-motion: reduce)', true);
  assert.equal(handle.isRunning(), false);
  assert.equal(env.pendingRafCount, 0);

  // destroy() removes DOM and all listeners
  handle.destroy();
  assert.equal(env.body.children.length, 0);
  assert.equal(env.win.listenerCount('resize'), 0);
  assert.equal(env.doc.listenerCount('visibilitychange'), 0);
  assert.equal(env.win.mqListenerCount('(prefers-reduced-motion: reduce)'), 0);
  assert.equal(env.win.mqListenerCount('(prefers-color-scheme: dark)'), 0);

  // Post-destroy start() is a safe no-op
  assert.equal(handle.start(), false);
  assert.equal(handle.isRunning(), false);
});

test('fog plumes stay visible through the scrim (verifier fix)', () => {
  // The original dark fog alphas (0.24/0.20/0.18) composited ~2 levels
  // above the ground once the 0.58 scrim was applied — invisible.
  // Guard the raised values so the drift actually reads.
  const parseAlpha = (rgba) => {
    const m = /rgba\(\d+, \d+, \d+, ([0-9.]+)\)/.exec(rgba);
    assert.ok(m, `fog color parses: ${rgba}`);
    return Number(m[1]);
  };
  for (const fog of PALETTES.dark.fogs) {
    assert.ok(parseAlpha(fog) >= 0.4, `dark fog alpha ${fog} reads through the scrim`);
  }
  for (const fog of PALETTES.light.fogs) {
    assert.ok(parseAlpha(fog) >= 0.24, `light fog alpha ${fog} reads through the scrim`);
  }
});

test('frame pacer tolerates 60 Hz jitter (renders ~30 fps, not ~20 fps)', () => {
  const env = createFakeEnv({ reducedMotion: false });
  const handle = mount(env.body, { win: env.win, doc: env.doc });
  assert.equal(handle.isRunning(), true);
  const t0 = handle.field.time;
  // Two 16.6 ms frames: elapsed 33.2 ms on the second tick. A bare
  // `>= 33.33` threshold skips it (loop drops to ~20 fps); the 2 ms
  // tolerance renders it.
  env.stepRaf(16.6);
  env.stepRaf(16.6);
  assert.ok(handle.field.time > t0, 'second 16.6 ms tick renders within tolerance');
  handle.destroy();
});

test('mount: degrades gracefully on zero-sized iframe or missing 2D context', () => {
  const collapsed = createFakeEnv({ width: 0, height: 0 });
  const h1 = mount(collapsed.body, { win: collapsed.win, doc: collapsed.doc });
  assert.equal(h1.isRunning(), false);
  assert.equal(collapsed.rafCalls, 0);
  // Recovers if iframe later gets a real size
  collapsed.win.innerWidth = 640;
  collapsed.win.innerHeight = 480;
  collapsed.win.emit('resize');
  assert.equal(h1.isRunning(), true);
  assert.equal(collapsed.rafCalls, 1);
  h1.destroy();

  const noCtx = createFakeEnv({ nullContext: true });
  const h2 = mount(noCtx.body, { win: noCtx.win, doc: noCtx.doc });
  assert.equal(h2.isRunning(), false);
  assert.equal(noCtx.rafCalls, 0);
  h2.destroy();
});
