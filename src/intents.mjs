// T02 — Intent composers (X / Bluesky / Threads / Reddit).
// Pure functions in the core; DOM only in mount(). No API, no OAuth, no auto-posting.
// The user taps "Open in <platform>", the platform's own composer opens, the user posts.

export const PLATFORMS = ['x', 'bluesky', 'threads', 'reddit'];

const LABELS = { x: 'X', bluesky: 'Bluesky', threads: 'Threads', reddit: 'Reddit' };

// TODO(threads): domain unresolved (threads.net vs threads.com). Implemented as threads.net.
// Live-test the intent link in a real browser before shipping.
export const THREADS_NOTE =
  'Live-test before shipping: the Threads intent domain (threads.net vs threads.com) is unresolved.';

const X_LIMIT = 280;
const X_URL_WEIGHT = 23; // t.co wraps every URL to 23 chars
const BSKY_GRAPHEMES = 300;
const BSKY_BYTES = 3000;
const THREADS_LIMIT = 500;

const enc = encodeURIComponent;

function graphemeCount(s) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    let n = 0;
    for (const _ of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)) n++;
    return n;
  }
  return Array.from(s).length;
}

const byteCount = (s) => new TextEncoder().encode(s).length;
const codePoints = (s) => Array.from(s).length;

// Text as it will appear in the composer for platforms with a single text field.
// A URL is appended on its own line inside the text.
function withUrl(text, url) {
  return url ? (text ? `${text}\n${url}` : url) : text;
}

/**
 * checkLimit(platform, { text, url }) -> { ok, remaining, message }
 * remaining is the tightest remaining count (can be negative). Never truncates.
 */
export function checkLimit(platform, { text = '', url = '' } = {}) {
  switch (platform) {
    case 'x': {
      // URL goes in its own param; X counts it as 23 chars plus a joining space.
      const used = codePoints(text) + (url ? X_URL_WEIGHT + 1 : 0);
      const remaining = X_LIMIT - used;
      return remaining >= 0
        ? { ok: true, remaining, message: '' }
        : { ok: false, remaining, message: `Over the X limit by ${-remaining} characters (${X_LIMIT} for non-Premium accounts; a link counts as ${X_URL_WEIGHT}). Shorten your text.` };
    }
    case 'bluesky': {
      const full = withUrl(text, url);
      const gRem = BSKY_GRAPHEMES - graphemeCount(full);
      const bRem = BSKY_BYTES - byteCount(full);
      const remaining = Math.min(gRem, bRem);
      if (remaining >= 0) return { ok: true, remaining, message: '' };
      return {
        ok: false,
        remaining,
        message: gRem < 0
          ? `Over the Bluesky limit by ${-gRem} characters (${BSKY_GRAPHEMES} max). Shorten your text.`
          : `Over the Bluesky size limit by ${-bRem} bytes (${BSKY_BYTES} max). Shorten your text.`,
      };
    }
    case 'threads': {
      const remaining = THREADS_LIMIT - codePoints(withUrl(text, url));
      return remaining >= 0
        ? { ok: true, remaining, message: '' }
        : { ok: false, remaining, message: `Over the Threads limit by ${-remaining} characters (${THREADS_LIMIT} max). Shorten your text.` };
    }
    case 'reddit':
      // No limit enforced by us: the title is the text; Reddit validates in its own composer.
      return { ok: true, remaining: Infinity, message: '' };
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

/**
 * buildIntent(platform, { text, url }) -> full URL string.
 * Throws if the text exceeds the platform limit (no silent truncation).
 */
export function buildIntent(platform, { text = '', url = '' } = {}) {
  const check = checkLimit(platform, { text, url });
  if (!check.ok) throw new Error(check.message);
  switch (platform) {
    case 'x':
      return `https://x.com/intent/post?text=${enc(text)}` + (url ? `&url=${enc(url)}` : '');
    case 'bluesky':
      return `https://bsky.app/intent/compose?text=${enc(withUrl(text, url))}`;
    case 'threads':
      // TODO(threads): switch to threads.com if the live click-test says so.
      return `https://www.threads.net/intent/post?text=${enc(withUrl(text, url))}`;
    case 'reddit':
      // No subreddit param exists; the user picks the subreddit in Reddit's composer.
      return `https://www.reddit.com/submit?url=${enc(url)}&title=${enc(text)}`;
  }
}

/** DOM only. One composer per platform inside rootEl. */
export function mount(rootEl) {
  const doc = rootEl.ownerDocument;
  for (const platform of PLATFORMS) {
    const box = doc.createElement('section');
    box.className = `intent-composer intent-${platform}`;

    const h = doc.createElement('h3');
    h.textContent = LABELS[platform];
    const ta = doc.createElement('textarea');
    ta.rows = 4;
    ta.setAttribute('aria-label', `${LABELS[platform]} post text`);
    const count = doc.createElement('p');
    count.className = 'intent-count';
    const msg = doc.createElement('p');
    msg.className = 'intent-message';
    msg.setAttribute('role', 'alert');
    const link = doc.createElement('a');
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = `Open in ${LABELS[platform]}`;

    const refresh = () => {
      const c = checkLimit(platform, { text: ta.value });
      count.textContent = Number.isFinite(c.remaining) ? `${c.remaining} remaining` : '';
      msg.textContent = c.message;
      if (c.ok) {
        link.href = buildIntent(platform, { text: ta.value });
        link.removeAttribute('aria-disabled');
      } else {
        link.removeAttribute('href'); // blocked, never truncated
        link.setAttribute('aria-disabled', 'true');
      }
    };
    ta.addEventListener('input', refresh);

    box.append(h, ta, count, msg, link);
    if (platform === 'threads') {
      const note = doc.createElement('p');
      note.className = 'intent-note';
      note.textContent = THREADS_NOTE;
      box.append(note);
    }
    if (platform === 'reddit') {
      const note = doc.createElement('p');
      note.className = 'intent-note';
      note.textContent = 'Your text becomes the post title. You pick the subreddit in Reddit’s own composer.';
      box.append(note);
    }
    rootEl.append(box);
    refresh();
  }
}
