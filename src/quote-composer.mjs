// V23 / V39 — Quote-post composer (two-tier: X / Bluesky only).
// Quote-post drafts with the target post attached and the similarity gate
// live as password-meter warnings. Warnings only, NEVER a block: the
// "Open in X / Bluesky" links stay enabled at every verdict.
// Never auto-posts, never writes copy for the user. The human taps Post
// in the platform's own composer; "I posted it" reports back so the ring
// can record the assist on that post.
// Pure functions in the core; DOM only in mount().

import { gate } from './similarity.mjs';
import { buildIntent } from './intents.mjs';
import { initials, avatarHue } from './campaign.mjs';
import { trackRevision } from './gamify.mjs';

export const PLATFORMS = ['x', 'bluesky'];
const LABELS = { x: 'X', bluesky: 'Bluesky' };

/** True when a platform uses the quote-post composer (X or Bluesky). */
export function isComposerPlatform(platform) {
  return PLATFORMS.includes(String(platform ?? '').trim().toLowerCase());
}

/**
 * Resolve the target post for the composer: explicit `post` first,
 * then `campaign.posts[0]`, then legacy `campaign.anchorPost`.
 */
export function targetPost(campaign, post) {
  if (post && typeof post === 'object') return post;
  if (Array.isArray(campaign?.posts) && campaign.posts.length > 0) {
    return campaign.posts[0];
  }
  return campaign?.anchorPost ?? {};
}

/** Composite draftId for revision tracking (spec section 8 & 15): `<campaignId>:<postId>`. */
export function composerDraftId(campaignId, postId) {
  const cid = String(campaignId ?? '').trim();
  const pid = String(postId ?? '').trim();
  if (cid && pid) return `${cid}:${pid}`;
  return cid || pid || '';
}

/** Handle of `me`, whether it is a string or a { handle } object. */
export function meHandle(me) {
  return typeof me === 'string' ? me : me?.handle ?? '';
}

/**
 * Texts a draft is scored against: the TARGET post's text first, then
 * other members' `quoteText` on THAT post only (never other posts in the
 * ring). The assist/member matching `me` (case-insensitive) is excluded —
 * you are never scored against yourself.
 * Legacy anchor-only campaigns (no `posts` array and no `assists` on the
 * target post) fall back to reading `campaign.members` draft/quoteText.
 */
export function comparisonTexts(campaign, me, post) {
  const out = [];
  const target = targetPost(campaign, post);
  const postText = target.text ?? '';
  if (postText) out.push(postText);
  const mine = meHandle(me).trim().toLowerCase();

  if (Array.isArray(target.assists)) {
    for (const a of target.assists) {
      if (mine && a?.handle && String(a.handle).trim().toLowerCase() === mine) {
        continue;
      }
      const qt = typeof a?.quoteText === 'string' ? a.quoteText : '';
      if (qt) out.push(qt);
    }
    return out;
  }

  // Legacy v1 anchor-only fallback (no posts array on campaign).
  if (!Array.isArray(campaign?.posts)) {
    for (const m of campaign?.members ?? []) {
      if (mine && m?.handle && String(m.handle).trim().toLowerCase() === mine) {
        continue;
      }
      const draft = typeof m?.draft === 'string' ? m.draft : m?.quoteText ?? '';
      if (draft) out.push(draft);
    }
  }
  return out;
}

/** Score a draft against the target post: gate(draft, [post.text, ...others on that post]). */
export function scoreDraft(draft, campaign, me, post) {
  return gate(draft, comparisonTexts(campaign, me, post));
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
 * Platform composer URL for a draft, quoting the target post.
 * Takes `post` (whose `url` rides the intent); also tolerates a legacy
 * `campaign` object when `url` is not directly on the third argument.
 * Throws when the draft is over the platform limit — buildIntent never truncates.
 */
export function intentUrl(platform, draft, post) {
  const url =
    typeof post?.url === 'string' ? post.url : targetPost(post).url ?? '';
  return buildIntent(platform, { text: draft ?? '', url });
}

/**
 * The "I posted it" step, as a pure function. `prompt` is a function
 * returning the pasted quote-post URL, '' when left blank, or null when
 * the user cancels. Cancel -> onPosted is NOT called. Otherwise onPosted
 * is called with the quote URL ('' when blank — the URL is optional).
 * Returns { posted, quoteUrl }.
 * Kept for callers/tests that still drive the step through a prompt
 * function; mount() itself no longer prompts (V77 inline URL field).
 */
export function confirmPosted({ prompt, onPosted }) {
  const answer = prompt();
  if (answer === null || answer === undefined) return { posted: false, quoteUrl: null };
  const quoteUrl = String(answer).trim();
  if (typeof onPosted === 'function') onPosted(quoteUrl);
  return { posted: true, quoteUrl };
}

export const NOTHING_RECORDED_COPY = 'Nothing recorded — add your quote first.';
export const POSTED_RECORDED_COPY = 'Recorded — thanks for posting.';

/**
 * V77 — the "I posted it" step for the inline URL field, as a pure
 * function. `postedStep({ draft, quoteUrl })` ->
 *   { recorded: true, quoteUrl, message } when the draft has text
 *   (the URL stays optional, trimmed; '' when blank), or
 *   { recorded: false, quoteUrl: '', message: NOTHING_RECORDED_COPY }
 *   when the draft is empty. Empty/cancel never records silently:
 *   the caller shows `message` inline.
 */
export function postedStep({ draft, quoteUrl } = {}) {
  if (!String(draft ?? '').trim()) {
    return { recorded: false, quoteUrl: '', message: NOTHING_RECORDED_COPY };
  }
  return { recorded: true, quoteUrl: String(quoteUrl ?? '').trim(), message: POSTED_RECORDED_COPY };
}

/**
 * mount(rootEl, ctx) where
 *   ctx = { campaign, post?, me, onPosted(quoteUrl, draft, post), compact?, storage?, onKindled? }.
 * Renders ONLY for X / Bluesky target posts (for other platforms, returns
 * `{ supported: false, ... }` without modifying `rootEl`).
 * Renders: target post (author, text, link — unless compact), one empty
 * textarea, a live gate warning, "Open in X" / "Open in Bluesky" links,
 * an inline quote-post URL field (optional — V77 replaces the native
 * window.prompt), and an "I posted it" button with a Cancel button.
 * Empty draft / Cancel never record silently: an inline message says so.
 */
export function mount(rootEl, ctx = {}) {
  const { campaign, me, onPosted } = ctx;
  const post = targetPost(campaign, ctx.post);
  const draftId = composerDraftId(campaign?.id, post?.id);

  // Two-tier rule (spec section 8): composer renders ONLY for x/bluesky posts.
  if (post.platform && !isComposerPlatform(post.platform)) {
    return {
      supported: false,
      post,
      draftId,
      textarea: null,
      warning: null,
      links: {},
      postedButton: null,
      urlInput: null,
      cancelButton: null,
      message: null,
      anchorBox: null,
      update() {},
      destroy() {},
    };
  }

  const compact = ctx.compact === true;
  const doc = rootEl.ownerDocument;

  const section = doc.createElement('section');
  section.className = 'quote-composer';

  let anchorBox = null;
  if (!compact) {
    const heading = doc.createElement('h3');
    heading.textContent = 'Quote-post this update';
    section.append(heading);

    anchorBox = doc.createElement('div');
    anchorBox.className = 'quote-anchor';
    const anchorLabel = doc.createElement('p');
    anchorLabel.className = 'quote-anchor-label';
    anchorLabel.textContent = 'Original post';
    const author = doc.createElement('p');
    author.className = 'quote-anchor-author';
    author.textContent = post.author ? `by ${post.author}` : '';
    const quote = doc.createElement('blockquote');
    quote.className = 'quote-anchor-text';
    quote.textContent = post.text ?? '';
    const anchorLink = doc.createElement('a');
    anchorLink.className = 'quote-anchor-link';
    anchorLink.textContent = 'View post';
    if (post.url) {
      anchorLink.href = post.url;
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

  // V77: inline quote-post URL field — replaces the native
  // window.prompt("Paste your quote-post URL (optional):"). The URL
  // stays optional; the field is read when "I posted it" is tapped.
  const urlLabel = doc.createElement('label');
  urlLabel.className = 'quote-url-label';
  urlLabel.textContent = 'Your quote-post URL (optional)';
  const urlInput = doc.createElement('input');
  urlInput.className = 'quote-url';
  urlInput.type = 'url';
  urlInput.value = '';
  urlInput.placeholder = 'https://x.com/.../status/...';
  urlInput.setAttribute('aria-label', 'Your quote-post URL (optional)');
  urlLabel.append(urlInput);
  section.append(urlLabel);

  const postedButton = doc.createElement('button');
  postedButton.className = 'quote-posted';
  postedButton.type = 'button';
  postedButton.textContent = 'I posted it';
  section.append(postedButton);

  const cancelButton = doc.createElement('button');
  cancelButton.className = 'quote-posted-cancel';
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancel';
  section.append(cancelButton);

  // Inline feedback for the "I posted it" step: empty draft and Cancel
  // both land here visibly instead of failing silently.
  const message = doc.createElement('p');
  message.className = 'quote-posted-message';
  message.setAttribute('aria-live', 'polite');
  section.append(message);

  rootEl.append(section);

  // Per-post revision tracking (spec section 8 & 15): draftId = `${campaignId}:${postId}`.
  let revisionTracker = null;
  if (campaign?.id && post?.id) {
    revisionTracker = trackRevision(textarea, {
      anchorText: post.text ?? '',
      draftId,
      storage: ctx.storage,
      onKindled: ctx.onKindled,
    });
  }

  function update() {
    const draft = textarea.value;
    if (!draft.trim()) {
      warning.dataset.verdict = 'pass';
      warning.textContent = 'Write your quote-post in your own words — the gate checks it as you type.';
    } else {
      const result = scoreDraft(draft, campaign, me, post);
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
        links[platform].href = intentUrl(platform, draft, post);
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
    // it as the assist's quoteText (the Enscryption receipt for x/bluesky);
    // the URL stays the first arg, and the target post is the third arg.
    // V77: the URL comes from the inline field, never a native prompt.
    // An empty draft records nothing and says so inline — never silent.
    const step = postedStep({ draft: textarea.value, quoteUrl: urlInput.value });
    message.textContent = step.message;
    if (!step.recorded) return;
    if (typeof onPosted === 'function') onPosted(step.quoteUrl, textarea.value, post);
  }

  function onCancelClick() {
    // Abandoning the report: clear the URL, say so inline, record
    // nothing. The draft is left alone — Cancel never destroys work.
    urlInput.value = '';
    message.textContent = NOTHING_RECORDED_COPY;
  }

  textarea.addEventListener('input', update);
  postedButton.addEventListener('click', onPostedClick);
  cancelButton.addEventListener('click', onCancelClick);
  update();

  return {
    supported: true,
    post,
    draftId,
    textarea,
    warning,
    links,
    postedButton,
    urlInput,
    cancelButton,
    message,
    anchorBox,
    update,
    destroy() {
      textarea.removeEventListener('input', update);
      postedButton.removeEventListener('click', onPostedClick);
      cancelButton.removeEventListener('click', onCancelClick);
      if (revisionTracker) revisionTracker.destroy();
      section.remove();
    },
  };
}
