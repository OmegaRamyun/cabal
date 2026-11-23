/**
 * T04 — Similarity gate, MiniLM embeddings (opt-in).
 *
 * Pure core functions + lazy Web Worker loader for Transformers.js v4.3.2
 * running Xenova/all-MiniLM-L6-v2 (~23 MB quantized ONNX, 384-dim) in-browser.
 * Never loads on first page load; degrades silently to lexical gate (T03).
 */

export const TRANSFORMERS_CDN_URL =
  'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';
export const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIM = 384;
export const FIRST_EMBED_TIMEOUT_MS = 2000;

export const THRESHOLDS = Object.freeze({
  WARN: 0.85,
  BLOCK: 0.92,
});

export const THRESHOLD_DISCLAIMER =
  'Thresholds (0.85 warn / 0.92 block) are recommendations to validate on real ring copy, not measured results.';

/**
 * Compute cosine similarity between two numeric embedding vectors.
 * Returns a value in [-1, 1]. Returns 0 if either vector has zero magnitude.
 *
 * @param {ArrayLike<number>} a
 * @param {ArrayLike<number>} b
 * @returns {number}
 */
export function cosine(a, b) {
  if (!a || !b || typeof a.length !== 'number' || typeof b.length !== 'number') {
    throw new TypeError('cosine() requires two array-like vectors');
  }
  if (a.length === 0 || a.length !== b.length) {
    throw new RangeError(
      `cosine() requires non-empty vectors of equal length (got ${a.length} and ${b.length})`
    );
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    const va = Number(a[i]);
    const vb = Number(b[i]);
    if (!Number.isFinite(va) || !Number.isFinite(vb)) {
      throw new TypeError(`cosine() encountered non-finite value at index ${i}`);
    }
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;

  const raw = dot / denom;
  if (raw > 1) return 1;
  if (raw < -1) return -1;
  return raw;
}

/**
 * Map a cosine similarity score to a gate verdict.
 * Never auto-passes/auto-posts: below 0.85 is 'review'.
 *
 * @param {number} score
 * @returns {{ verdict: 'review' | 'warn' | 'block', severity: 'neutral' | 'amber' | 'red', message: string }}
 */
export function classifySimilarity(score) {
  if (!Number.isFinite(score)) {
    throw new TypeError('classifySimilarity() requires a finite number');
  }

  if (score >= THRESHOLDS.BLOCK) {
    return {
      verdict: 'block',
      severity: 'red',
      message:
        'Very close to another ring member’s draft — treat as hard block pending human review (never auto-rejected on embedding alone).',
    };
  }

  if (score >= THRESHOLDS.WARN) {
    return {
      verdict: 'warn',
      severity: 'amber',
      message:
        "Reads very close to another ring member's draft — rewrite in your own words.",
    };
  }

  return {
    verdict: 'review',
    severity: 'neutral',
    message:
      'No close semantic match found — still requires human review before posting.',
  };
}

/**
 * Compare a draft embedding against other ring members' embeddings.
 * Pure function; never auto-posts or auto-rejects.
 *
 * @param {ArrayLike<number>} draftEmbedding
 * @param {Array<{ id?: string, text?: string, embedding: ArrayLike<number> }>} others
 */
export function gateWithEmbeddings(draftEmbedding, others = []) {
  if (!Array.isArray(others) || others.length === 0) {
    return {
      score: 0,
      verdict: 'review',
      severity: 'neutral',
      match: null,
      message: 'No other ring drafts to compare.',
      disclaimer: THRESHOLD_DISCLAIMER,
    };
  }

  let bestScore = -Infinity;
  let bestMatch = null;

  for (const entry of others) {
    if (!entry || !entry.embedding) continue;
    const score = cosine(draftEmbedding, entry.embedding);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  if (bestMatch === null) {
    return {
      score: 0,
      verdict: 'review',
      severity: 'neutral',
      match: null,
      message: 'No comparable ring embeddings provided.',
      disclaimer: THRESHOLD_DISCLAIMER,
    };
  }

  const classified = classifySimilarity(bestScore);
  return {
    score: bestScore,
    ...classified,
    match: bestMatch,
    disclaimer: THRESHOLD_DISCLAIMER,
  };
}

/**
 * Inline Web Worker source so no extra worker file is needed and
 * Transformers.js never runs on the main thread.
 */
const WORKER_SOURCE = `
let extractor = null;
let loadPromise = null;

async function ensureModel(cdnUrl, modelId) {
  if (extractor) return extractor;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const { pipeline, env } = await import(cdnUrl);
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    let device = 'wasm';
    if (typeof navigator !== 'undefined' && navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) device = 'webgpu';
      } catch {
        device = 'wasm';
      }
    }

    extractor = await pipeline('feature-extraction', modelId, {
      dtype: 'q8',
      device,
    });
    return extractor;
  })();

  return loadPromise;
}

self.onmessage = async (event) => {
  const { id, type, text, cdnUrl, modelId } = event.data || {};
  try {
    if (type === 'init') {
      await ensureModel(cdnUrl, modelId);
      self.postMessage({ id, type: 'ready' });
      return;
    }
    if (type === 'embed') {
      const model = await ensureModel(cdnUrl, modelId);
      const output = await model(text, { pooling: 'mean', normalize: true });
      const vector = Array.from(output.data);
      self.postMessage({ id, type: 'embedding', vector });
    }
  } catch (err) {
    self.postMessage({
      id,
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
`;

/**
 * Check whether browser runtime supports Web Workers and WebGPU/WASM.
 * @returns {{ ok: boolean, reason?: string }}
 */
export function checkRuntimeSupport() {
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
    return { ok: false, reason: 'Web Workers are unavailable in this environment' };
  }
  const hasWasm = typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';
  const hasWebGpu = typeof navigator !== 'undefined' && Boolean(navigator.gpu);
  if (!hasWasm && !hasWebGpu) {
    return { ok: false, reason: 'Neither WebGPU nor WebAssembly is available' };
  }
  return { ok: true };
}

/**
 * Create a lazy, opt-in embedding engine that runs in a Web Worker and
 * degrades silently to the T03 lexical gate on error or slow first embed (> 2s).
 */
export function createEmbeddingEngine(options = {}) {
  const cdnUrl = options.cdnUrl || TRANSFORMERS_CDN_URL;
  const modelId = options.modelId || DEFAULT_MODEL;
  const firstEmbedTimeoutMs = options.firstEmbedTimeoutMs ?? FIRST_EMBED_TIMEOUT_MS;

  let enabled = false;
  let status = 'disabled'; // 'disabled' | 'loading' | 'ready' | 'degraded'
  let degradedReason = null;
  let worker = null;
  let workerUrl = null;
  let firstEmbedDone = false;
  let nextReqId = 1;
  const pending = new Map();
  const embeddingCache = new Map();

  function terminateWorker() {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    if (workerUrl) {
      URL.revokeObjectURL(workerUrl);
      workerUrl = null;
    }
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(new Error('Embedding worker terminated'));
    }
    pending.clear();
  }

  function degrade(reason) {
    status = 'degraded';
    degradedReason = reason;
    terminateWorker();
  }

  function sendToWorker(payload, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (!worker) {
        reject(new Error('Worker not initialized'));
        return;
      }
      const id = nextReqId++;
      const timer = timeoutMs
        ? setTimeout(() => {
            pending.delete(id);
            reject(new Error(`First embed exceeded ${timeoutMs} ms`));
          }, timeoutMs)
        : null;

      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, cdnUrl, modelId, ...payload });
    });
  }

  async function enable() {
    if (enabled && status === 'ready') return { status, reason: null };

    const support = checkRuntimeSupport();
    if (!support.ok) {
      enabled = true;
      degrade(support.reason);
      return { status, reason: degradedReason };
    }

    enabled = true;
    status = 'loading';
    degradedReason = null;

    try {
      const blob = new Blob([WORKER_SOURCE], { type: 'text/javascript' });
      workerUrl = URL.createObjectURL(blob);
      worker = new Worker(workerUrl, { type: 'module' });

      worker.onmessage = (event) => {
        const msg = event.data || {};
        const entry = pending.get(msg.id);
        if (!entry) return;
        pending.delete(msg.id);
        if (entry.timer) clearTimeout(entry.timer);
        if (msg.type === 'error') {
          entry.reject(new Error(msg.error || 'Worker error'));
        } else {
          entry.resolve(msg);
        }
      };

      worker.onerror = (err) => {
        degrade(err?.message || 'Embedding worker failed');
      };

      await sendToWorker({ type: 'init' }, 0);
      status = 'ready';
      return { status, reason: null };
    } catch (err) {
      degrade(err instanceof Error ? err.message : String(err));
      return { status, reason: degradedReason };
    }
  }

  function disable() {
    enabled = false;
    status = 'disabled';
    degradedReason = null;
    firstEmbedDone = false;
    embeddingCache.clear();
    terminateWorker();
  }

  async function embed(text) {
    if (!enabled || status === 'disabled') {
      throw new Error('Semantic similarity is opt-in and currently disabled');
    }
    if (status === 'degraded') {
      throw new Error(degradedReason || 'Semantic similarity is degraded');
    }
    if (embeddingCache.has(text)) {
      return embeddingCache.get(text);
    }
    if (!worker) {
      await enable();
      if (status !== 'ready') {
        throw new Error(degradedReason || 'Model failed to load');
      }
    }

    const timeout = firstEmbedDone ? 0 : firstEmbedTimeoutMs;
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      const res = await sendToWorker({ type: 'embed', text }, timeout);
      const elapsed =
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
      if (!firstEmbedDone && elapsed > firstEmbedTimeoutMs) {
        degrade(`First embed took ${Math.round(elapsed)} ms (> ${firstEmbedTimeoutMs} ms)`);
        throw new Error(degradedReason);
      }
      firstEmbedDone = true;
      embeddingCache.set(text, res.vector);
      return res.vector;
    } catch (err) {
      degrade(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  async function lexicalFallback(draft, others, reason) {
    try {
      const mod = await import('./similarity.mjs');
      if (mod && typeof mod.gate === 'function') {
        const res = mod.gate(draft, others);
        return {
          mode: 'lexical-fallback',
          reason,
          ...res,
          disclaimer: THRESHOLD_DISCLAIMER,
        };
      }
    } catch {
      // T03 module not yet present or unavailable
    }
    return {
      mode: 'lexical-fallback',
      reason,
      score: 0,
      verdict: 'review',
      severity: 'neutral',
      match: null,
      message: `Fell back to lexical gate (${reason}).`,
      disclaimer: THRESHOLD_DISCLAIMER,
    };
  }

  async function checkDraft(draft, others = []) {
    if (!enabled || status === 'disabled') {
      return lexicalFallback(draft, others, 'Semantic similarity not enabled');
    }
    if (status === 'degraded') {
      return lexicalFallback(draft, others, degradedReason || 'Model unavailable');
    }
    try {
      const draftVec = await embed(draft);
      const otherVecs = [];
      for (const item of others) {
        const text = typeof item === 'string' ? item : item?.text || '';
        if (!text.trim()) continue;
        const vec = await embed(text);
        otherVecs.push({
          id: typeof item === 'object' ? item.id : undefined,
          text,
          embedding: vec,
        });
      }
      return {
        mode: 'embeddings',
        ...gateWithEmbeddings(draftVec, otherVecs),
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return lexicalFallback(draft, others, reason);
    }
  }

  return {
    enable,
    disable,
    embed,
    checkDraft,
    getState: () => ({ enabled, status, degradedReason }),
  };
}

/**
 * Mount the opt-in semantic similarity UI into rootEl.
 * Does not load Transformers.js until the user toggles it on.
 *
 * @param {HTMLElement} rootEl
 */
export function mount(rootEl) {
  if (!rootEl) return null;

  const engine = createEmbeddingEngine();

  rootEl.innerHTML = `
    <div class="cabal-embeddings">
      <label class="cabal-embeddings-toggle" style="display:flex;align-items:center;gap:0.5rem;min-height:44px;cursor:pointer;">
        <input type="checkbox" data-role="opt-in" />
        <span>Enable local semantic similarity (opt-in, ~23 MB MiniLM download, cached in browser)</span>
      </label>
      <p class="cabal-embeddings-note" style="margin:0.25rem 0;font-size:0.9em;opacity:0.85;">
        Runs in a Web Worker on your device — no draft leaves your browser.
        ${THRESHOLD_DISCLAIMER}
      </p>
      <div data-role="status" aria-live="polite" style="margin:0.5rem 0;font-size:0.9em;">
        Status: off (using lexical gate only).
      </div>
      <details style="margin-top:0.5rem;">
        <summary style="cursor:pointer;min-height:44px;display:flex;align-items:center;">
          Test paraphrase check
        </summary>
        <div style="display:grid;gap:0.5rem;margin-top:0.5rem;">
          <textarea data-role="draft" rows="2" placeholder="Your draft..."></textarea>
          <textarea data-role="other" rows="2" placeholder="Another ring member's draft..."></textarea>
          <button type="button" data-role="check" style="min-height:44px;cursor:pointer;">
            Check similarity
          </button>
          <div data-role="result" aria-live="polite" style="font-size:0.9em;"></div>
        </div>
      </details>
    </div>
  `;

  const optInEl = rootEl.querySelector('[data-role="opt-in"]');
  const statusEl = rootEl.querySelector('[data-role="status"]');
  const draftEl = rootEl.querySelector('[data-role="draft"]');
  const otherEl = rootEl.querySelector('[data-role="other"]');
  const checkBtn = rootEl.querySelector('[data-role="check"]');
  const resultEl = rootEl.querySelector('[data-role="result"]');

  function renderStatus() {
    const { status, degradedReason } = engine.getState();
    if (status === 'disabled') {
      statusEl.textContent = 'Status: off (using lexical gate only).';
    } else if (status === 'loading') {
      statusEl.textContent = 'Status: loading all-MiniLM-L6-v2 in Web Worker…';
    } else if (status === 'ready') {
      statusEl.textContent = 'Status: ready (all-MiniLM-L6-v2, local Web Worker).';
    } else if (status === 'degraded') {
      statusEl.textContent = `Status: fell back to lexical gate (${degradedReason || 'unavailable'}).`;
    }
  }

  optInEl.addEventListener('change', async () => {
    if (optInEl.checked) {
      statusEl.textContent = 'Status: loading all-MiniLM-L6-v2 in Web Worker…';
      await engine.enable();
      renderStatus();
    } else {
      engine.disable();
      renderStatus();
    }
  });

  checkBtn.addEventListener('click', async () => {
    const draft = draftEl.value.trim();
    const other = otherEl.value.trim();
    if (!draft || !other) {
      resultEl.textContent = 'Enter both drafts to compare.';
      return;
    }
    resultEl.textContent = 'Checking…';
    const res = await engine.checkDraft(draft, [{ id: 'other', text: other }]);
    renderStatus();
    const scoreStr = typeof res.score === 'number' ? res.score.toFixed(3) : 'n/a';
    resultEl.textContent = `[${res.mode}] score=${scoreStr} (${res.verdict}): ${res.message}`;
  });

  return engine;
}
