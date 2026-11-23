// T03 — Lexical similarity gate. Pure functions in the core; DOM only in mount().
// No embeddings (T04), no network, no server.

export const REVIEW_THRESHOLD = 0.7;
export const BLOCK_THRESHOLD = 0.8;

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

/**
 * Gate a draft against the ring's other drafts.
 * `others`: array of strings or { id?, author?, text } objects.
 * Returns { score, verdict, match, phrases } where match is the highest-scoring
 * other draft (null if none) and phrases are the shared 3-grams with it.
 */
export function gate(draft, others = []) {
  let score = 0;
  let match = null;
  let exact = false;
  (others || []).forEach((o, index) => {
    const text = typeof o === 'string' ? o : o?.text ?? '';
    const isExact = exactMatch(draft, text);
    const s = isExact ? 1 : jaccard3(draft, text);
    if (s > score || (isExact && !exact)) {
      score = s;
      exact = isExact;
      match = { index, draft: o, text };
    }
  });
  const verdict = exact || score >= BLOCK_THRESHOLD ? 'block' : score >= REVIEW_THRESHOLD ? 'review' : 'pass';
  const phrases = match ? sharedPhrases(draft, match.text) : [];
  return { score, verdict, match, phrases };
}

/**
 * Wire the gate into the composer section. DOM only here.
 * opts: { getDrafts: () => others[], textarea, readyButton } — all optional;
 * defaults look up elements inside rootEl. Drafts are passed in, never fetched.
 */
export function mount(rootEl, opts = {}) {
  const doc = rootEl.ownerDocument;
  const textarea = opts.textarea || rootEl.querySelector('textarea');
  const ready = opts.readyButton || rootEl.querySelector('[data-ready], button.ready');
  const getDrafts = opts.getDrafts || (() => []);
  if (!textarea) return { update() {}, destroy() {} };

  const panel = doc.createElement('div');
  panel.className = 'similarity-gate';
  panel.setAttribute('aria-live', 'polite');
  const label = doc.createElement('p');
  const list = doc.createElement('p');
  const ackWrap = doc.createElement('label');
  const ack = doc.createElement('input');
  ack.type = 'checkbox';
  ackWrap.append(ack, ' I wrote this in my own words');
  ackWrap.hidden = true;
  panel.append(label, list, ackWrap);
  textarea.insertAdjacentElement('afterend', panel);

  let current = { score: 0, verdict: 'pass', match: null, phrases: [] };
  const colours = { pass: '', review: '#b45309', block: '#b91c1c' };

  function apply() {
    const { verdict } = current;
    panel.dataset.verdict = verdict;
    panel.style.color = colours[verdict];
    ackWrap.hidden = verdict !== 'review';
    if (verdict !== 'review') ack.checked = false;
    if (ready) ready.disabled = verdict === 'block' || (verdict === 'review' && !ack.checked);
  }

  function update() {
    current = gate(textarea.value, getDrafts());
    const pct = Math.round(current.score * 100);
    const who = current.match?.draft?.author ? ` (${current.match.draft.author})` : '';
    label.textContent =
      current.verdict === 'pass'
        ? `Similarity ${pct}% — looks like your own words.`
        : current.verdict === 'review'
          ? `Similarity ${pct}% to another draft${who}. Review it, or confirm below.`
          : `Similarity ${pct}% to another draft${who}. Blocked — rewrite from your own gameplay observation.`;
    list.textContent = current.phrases.length ? `Shared phrases: ${current.phrases.map((p) => `“${p}”`).join(', ')}` : '';
    apply();
  }

  textarea.addEventListener('input', update);
  ack.addEventListener('change', apply);
  update();
  return {
    update,
    destroy() {
      textarea.removeEventListener('input', update);
      panel.remove();
    },
  };
}
