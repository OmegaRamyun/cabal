// T03/T11 — Hash-based similarity gate. Pure functions in the core; DOM only in mount().
// No AI, no embeddings, no model, no network, no server. SimHash + word 3-grams only.
// SimHash scale is compressed (random pairs land near 0.5, not 0), so it has
// its own thresholds — never the cosine/Jaccard lines.

export const REVIEW_THRESHOLD = 0.7;
export const WARN_THRESHOLD = 0.8;
export const SIMHASH_REVIEW_THRESHOLD = 0.8;
export const SIMHASH_WARN_THRESHOLD = 0.85;

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalise(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/['’`]/g, '') // don't -> dont
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Set of word 3-grams. Texts under 3 words yield one gram (the whole text). */
export function trigrams(text) {
  const words = normalise(text).split(' ').filter(Boolean);
  const out = new Set();
  if (words.length === 0) return out;
  if (words.length < 3) {
    out.add(words.join(' '));
    return out;
  }
  for (let i = 0; i <= words.length - 3; i++) out.add(words.slice(i, i + 3).join(' '));
  return out;
}

/** Word-3-gram Jaccard similarity, 0–1. Either side empty -> 0. */
export function jaccard3(a, b) {
  const A = trigrams(a);
  const B = trigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const g of A) if (B.has(g)) shared++;
  return shared / (A.size + B.size - shared);
}

/** True when normalised texts are identical (and non-empty). */
export function exactMatch(a, b) {
  const na = normalise(a);
  return na !== '' && na === normalise(b);
}

/** Shared 3-grams (overlapping phrases), in order of appearance in `a`. */
export function sharedPhrases(a, b) {
  const B = trigrams(b);
  return [...trigrams(a)].filter((g) => B.has(g));
}

/** Set of character n-grams (default 4) over normalised text. Short texts yield one gram. */
export function charGrams(text, n = 4) {
  const t = normalise(text);
  const out = new Set();
  if (t.length === 0) return out;
  if (t.length < n) {
    out.add(t);
    return out;
  }
  for (let i = 0; i <= t.length - n; i++) out.add(t.slice(i, i + n));
  return out;
}

/** Character-4-gram Jaccard similarity, 0–1. Either side empty -> 0. */
export function charJaccard(a, b) {
  const A = charGrams(a);
  const B = charGrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const g of A) if (B.has(g)) shared++;
  return shared / (A.size + B.size - shared);
}

/** FNV-1a 64-bit hash of a string, as a BigInt. Dependency-free; identical in Node and browsers. */
export function fnv1a64(str) {
  const bytes = new TextEncoder().encode(str);
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash;
}

/**
 * MurmurHash3 64-bit finalizer (fmix64). FNV-1a alone has weak avalanche —
 * similar grams hash to similar values, which biases SimHash upward
 * (a paraphrase scored 0.750 instead of ~0.53). The mixer is bijective
 * with strong diffusion, so `hash64` behaves like a cryptographic hash
 * for SimHash purposes while staying synchronous and dependency-free.
 */
export function hash64(str) {
  let x = fnv1a64(str);
  x ^= x >> 33n;
  x = (x * 0xff51afd7ed558ccdn) & 0xffffffffffffffffn;
  x ^= x >> 33n;
  x = (x * 0xc4ceb9fe1a85ec53n) & 0xffffffffffffffffn;
  x ^= x >> 33n;
  return x;
}

/** Hamming distance between two 64-bit fingerprints. */
export function hammingDistance(a, b) {
  let x = BigInt(a) ^ BigInt(b);
  let count = 0;
  while (x !== 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

/**
 * 64-bit SimHash fingerprint of a text, from its character 4-grams.
 * Empty text -> 0n. Deterministic: the same text always yields the same fingerprint.
 * 8 bytes per draft; a comparison costs ~3 µs.
 */
export function simhash(text) {
  const grams = charGrams(text);
  if (grams.size === 0) return 0n;
  const vec = new Array(64).fill(0);
  for (const gram of grams) {
    const h = hash64(gram);
    for (let bit = 0; bit < 64; bit++) {
      vec[bit] += ((h >> BigInt(bit)) & 1n) === 1n ? 1 : -1;
    }
  }
  let fp = 0n;
  for (let bit = 0; bit < 64; bit++) {
    if (vec[bit] > 0) fp |= 1n << BigInt(bit);
  }
  return fp;
}

/**
 * SimHash similarity, 0–1. Random pairs land near 0.5, not 0 — use the
 * SimHash thresholds, never the cosine/Jaccard lines. Either side empty -> 0.
 */
export function simhashSimilarity(a, b) {
  if (!normalise(a) || !normalise(b)) return 0;
  return 1 - hammingDistance(simhash(a), simhash(b)) / 64;
}

/**
 * Gate a draft against the ring's other drafts.
 * `others`: array of strings or { id?, author?, text } objects.
 * Two signals: word-3-gram Jaccard (long-form copy) and SimHash (short-form,
 * tweets — trigrams are too coarse at 280 chars). The verdict is the worst
 * of the two, but it is a warning only, never a block: the UI advises like
 * a password meter and the human still posts.
 * Returns { score, verdict, match, phrases, method } where match is the
 * highest-scoring other draft (null if none), phrases are the shared 3-grams
 * with it, and method is the signal that drove the verdict.
 */
export function gate(draft, others = []) {
  let score = 0;
  let match = null;
  let method = 'jaccard3';
  let verdict = 'pass';
  const rankOf = (v) => (v === 'warn' ? 2 : v === 'review' ? 1 : 0);
  (others || []).forEach((o, index) => {
    const text = typeof o === 'string' ? o : o?.text ?? '';
    const isExact = exactMatch(draft, text);
    const j = isExact ? 1 : jaccard3(draft, text);
    const s = isExact ? 1 : simhashSimilarity(draft, text);
    const v =
      isExact || j >= WARN_THRESHOLD || s >= SIMHASH_WARN_THRESHOLD
        ? 'warn'
        : j >= REVIEW_THRESHOLD || s >= SIMHASH_REVIEW_THRESHOLD
          ? 'review'
          : 'pass';
    const best = Math.max(j, s);
    const m = s > j ? 'simhash' : 'jaccard3';
    if (rankOf(v) > rankOf(verdict) || (rankOf(v) === rankOf(verdict) && best > score)) {
      score = best;
      match = { index, draft: o, text };
      method = isExact ? 'exact' : m;
      verdict = v;
    }
  });
  const phrases = match ? sharedPhrases(draft, match.text) : [];
  return { score, verdict, match, phrases, method };
}

/**
 * Wire the gate into a composer textarea. DOM only here.
 * opts: { getDrafts: () => others[], textarea } — drafts are passed in,
 * never fetched. Warnings only: the panel advises like a password meter
 * and never disables or blocks anything.
 */
export function mount(rootEl, opts = {}) {
  const doc = rootEl.ownerDocument;
  const textarea = opts.textarea || rootEl.querySelector('textarea');
  const getDrafts = opts.getDrafts || (() => []);
  if (!textarea) return { update() {}, destroy() {} };

  const panel = doc.createElement('div');
  panel.className = 'similarity-gate';
  panel.setAttribute('aria-live', 'polite');
  const label = doc.createElement('p');
  const list = doc.createElement('p');
  panel.append(label, list);
  textarea.insertAdjacentElement('afterend', panel);

  let current = { score: 0, verdict: 'pass', match: null, phrases: [], method: 'jaccard3' };
  const colours = { pass: '', review: '#b45309', warn: '#b91c1c' };

  function update() {
    current = gate(textarea.value, getDrafts());
    const pct = Math.round(current.score * 100);
    const who = current.match?.draft?.author ? ` to your ${current.match.draft.author} draft` : ' to another draft';
    panel.dataset.verdict = current.verdict;
    panel.style.color = colours[current.verdict];
    label.textContent =
      current.verdict === 'pass'
        ? 'Looks like your own words.'
        : current.verdict === 'review'
          ? `Similarity ${pct}%${who}. Check it reads as your own words.`
          : `This post is very similar${who}! Rewrite in your own words?`;
    list.textContent = current.phrases.length ? `Shared phrases: ${current.phrases.map((p) => `“${p}”`).join(', ')}` : '';
  }

  textarea.addEventListener('input', update);
  update();
  return {
    update,
    destroy() {
      textarea.removeEventListener('input', update);
      panel.remove();
    },
  };
}
