// V23 — Composer fed by the campaign.
// Quote-post drafts with the original anchor post attached and the
// similarity gate live as password-meter warnings. Warnings only, NEVER
// a block: the "Open in X / Bluesky" links stay enabled at every verdict.
// Never auto-posts, never writes copy for the user. The human taps Post
// in the platform's own composer; "I posted it" reports back so the ring
// can mark them posted.
// Pure functions in the core; DOM only in mount().

import { gate } from './similarity.mjs';
import { buildIntent } from './intents.mjs';
import { initials, avatarHue } from './campaign.mjs';

export const PLATFORMS = ['x', 'bluesky'];
const LABELS = { x: 'X', bluesky: 'Bluesky' };

const anchorOf = (campaign) => campaign?.anchorPost ?? {};

/** Handle of `me`, whether it is a string or a { handle } object. */
export function meHandle(me) {
  return typeof me === 'string' ? me : me?.handle ?? '';
}

/**
 * Texts a draft is scored against: the anchor post first, then any draft
 * text other ring members have attached (members may carry an optional
 * `draft` string; members without one contribute nothing). The member
 * matching `me` is excluded — you are never scored against yourself.
 */
export function comparisonTexts(campaign, me) {
  const out = [];
  const anchorText = anchorOf(campaign).text ?? '';
  if (anchorText) out.push(anchorText);
  const mine = meHandle(me);
  for (const m of campaign?.members ?? []) {
    if (mine && m?.handle && m.handle === mine) continue;
    const draft = typeof m?.draft === 'string' ? m.draft : m?.quoteText ?? '';
    if (draft) out.push(draft);
  }
  return out;
}

/** Score a draft against the campaign: gate(draft, [anchor, ...others]). */
export function scoreDraft(draft, campaign, me) {
  return gate(draft, comparisonTexts(campaign, me));
}

/**
 * Password-meter message for a gate result.
 * Returns { verdict, text }. Advisory only — the caller never blocks on it.
 */
export function gateMessage(result) {
  const verdict = result?.verdict ?? 'pass';
  if (verdict === 'warn') {
    return { verdict, text: 'This post is very similar! Rewrite in your own words?' };
  }
  if (verdict === 'review') {
    const pct = Math.round((result.score ?? 0) * 100);
    return { verdict, text: `Similarity ${pct}% — check it reads as your own words.` };
  }
  return { verdict, text: 'Looks like your own words.' };
}

/**
 * Platform composer URL for a draft, quoting the anchor post.
 * The anchor URL rides along (X `url` param; Bluesky appended to the text),
 * so the quote-post links the original. Throws when the draft is over the
 * platform limit — buildIntent never truncates.
 */
export function intentUrl(platform, draft, campaign) {
  return buildIntent(platform, { text: draft ?? '', url: anchorOf(campaign).url ?? '' });
}

/**
 * The "I posted it" step, as a pure function. `prompt` is a function
 * returning the pasted quote-post URL, '' when left blank, or null when
 * the user cancels. Cancel -> onPosted is NOT called. Otherwise onPosted
 * is called with the quote URL ('' when blank — the URL is optional).
 * Returns { posted, quoteUrl }.
 */
export function confirmPosted({ prompt, onPosted }) {
  const answer = prompt();
  if (answer === null || answer === undefined) return { posted: false, quoteUrl: null };
  const quoteUrl = String(answer).trim();
  if (typeof onPosted === 'function') onPosted(quoteUrl);
  return { posted: true, quoteUrl };
}

/**
 * mount(rootEl, ctx) where ctx = { campaign, me, onPosted(quoteUrl), compact? }.
 * Optional ctx.prompt(promptText) overrides the browser prompt (used by
 * tests); without one, window.prompt is used, and when no prompt exists
 * at all the click reports posted with an empty quote URL.
 * Renders: anchor post (author, text, link), one empty textarea, a live
 * gate warning, "Open in X" / "Open in Bluesky" links, and an
 * "I posted it" button. Returns handles { textarea, warning, links,
 * postedButton, update, destroy }.
 * compact (for embedding on the campaign page): skips the heading and the
 * anchor box — the page already shows the original above the compose box.
 */
export function mount(rootEl, ctx = {}) {
  const { campaign, me, onPosted } = ctx;
  const compact = ctx.compact === true;
  const doc = rootEl.ownerDocument;
  const anchor = anchorOf(campaign);

  const section = doc.createElement('section');
  section.className = 'quote-composer';

  let anchorBox = null;
  if (!compact) {
    const heading = doc.createElement('h3');
    heading.textContent = 'Quote-post the announcement';
    section.append(heading);

    anchorBox = doc.createElement('div');
    anchorBox.className = 'quote-anchor';
    const anchorLabel = doc.createElement('p');
    anchorLabel.className = 'quote-anchor-label';
    anchorLabel.textContent = 'Original post';
    const author = doc.createElement('p');
    author.className = 'quote-anchor-author';
    author.textContent = anchor.author ? `by ${anchor.author}` : '';
    const quote = doc.createElement('blockquote');
    quote.className = 'quote-anchor-text';
    quote.textContent = anchor.text ?? '';
    const anchorLink = doc.createElement('a');
    anchorLink.className = 'quote-anchor-link';
    anchorLink.textContent = 'View original';
    if (anchor.url) {
      anchorLink.href = anchor.url;
      anchorLink.target = '_blank';
      anchorLink.rel = 'noopener noreferrer';
    }
    anchorBox.append(anchorLabel, author, quote, anchorLink);
    section.append(anchorBox);
  }

  // Who is posting: avatar + handle, when we know them.
  const myHandle = meHandle(me);
  if (myHandle) {
    const postAs = doc.createElement('p');
    postAs.className = 'quote-post-as';
    const av = doc.createElement('span');
    const myName = typeof me === 'string' ? me : (me?.name || myHandle);
    av.className = `avatar avatar-h${avatarHue(myHandle)}`;
    av.textContent = initials(myName);
    postAs.append(av);
    const who = doc.createElement('span');
    who.textContent = `Posting as ${myHandle}`;
    postAs.append(who);
    section.append(postAs);
  }

  const label = doc.createElement('label');
  label.className = 'quote-draft-label';
  label.textContent = 'Your quote-post (in your own words)';
  const textarea = doc.createElement('textarea');
  textarea.className = 'quote-draft';
  textarea.rows = 4;
  textarea.value = ''; // starts empty; the composer never writes copy for you
  textarea.placeholder = 'Say it in your own words…';
  textarea.setAttribute('aria-label', 'Your quote-post draft');
  label.append(textarea);
  section.append(label);

  const warning = doc.createElement('p');
  warning.className = 'quote-gate';
  warning.setAttribute('aria-live', 'polite');
  section.append(warning);

  const links = {};
  const linkRow = doc.createElement('div');
  linkRow.className = 'quote-intents';
  for (const platform of PLATFORMS) {
    const link = doc.createElement('a');
    link.className = `quote-intent quote-intent-${platform}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = `Open in ${LABELS[platform]}`;
    links[platform] = link;
    linkRow.append(link);
  }
  section.append(linkRow);

  const limitNote = doc.createElement('p');
  limitNote.className = 'quote-limit';
  limitNote.setAttribute('role', 'alert');
  section.append(limitNote);

  const postedButton = doc.createElement('button');
  postedButton.className = 'quote-posted';
  postedButton.type = 'button';
  postedButton.textContent = 'I posted it';
  section.append(postedButton);

  rootEl.append(section);

  function update() {
    const draft = textarea.value;
    if (!draft.trim()) {
      warning.dataset.verdict = 'pass';
      warning.textContent = 'Write your quote-post in your own words — the gate checks it as you type.';
    } else {
      const result = scoreDraft(draft, campaign, me);
      const msg = gateMessage(result);
      warning.dataset.verdict = msg.verdict;
      warning.textContent = msg.text;
    }
    // Intent links stay enabled at every gate verdict. The only thing that
    // unlinks one is the platform character limit (buildIntent throws) —
    // a platform rule, not a gate block — and it never truncates.
    let limitMessage = '';
    for (const platform of PLATFORMS) {
      try {
        links[platform].href = intentUrl(platform, draft, campaign);
        links[platform].removeAttribute('aria-disabled');
      } catch (err) {
        links[platform].removeAttribute('href');
        links[platform].setAttribute('aria-disabled', 'true');
        if (!limitMessage) limitMessage = err.message;
      }
    }
    limitNote.textContent = limitMessage;
  }

  function onPostedClick() {
    // The draft rides along as the second arg so the caller can record
    // it as the member's attached quote; the URL stays the first arg.
    const report = (quoteUrl) => {
      if (typeof onPosted === 'function') onPosted(quoteUrl, textarea.value);
    };
    const promptFn =
      typeof ctx.prompt === 'function'
        ? () => ctx.prompt('Paste your quote-post URL (optional):')
        : typeof globalThis.prompt === 'function'
          ? () => globalThis.prompt('Paste your quote-post URL (optional):')
          : null;
    if (promptFn) {
      confirmPosted({ prompt: promptFn, onPosted: report });
    } else {
      report('');
    }
  }

  textarea.addEventListener('input', update);
  postedButton.addEventListener('click', onPostedClick);
  update();

  return {
    textarea,
    warning,
    links,
    postedButton,
    anchorBox,
    update,
    destroy() {
      textarea.removeEventListener('input', update);
      postedButton.removeEventListener('click', onPostedClick);
      section.remove();
    },
  };
}
