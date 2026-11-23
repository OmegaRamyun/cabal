// Cabal v0.2 — Campaign page: sustained-ring feed (V22 / V39).
//
// The campaign page is a feed of posts (newest first) with contribution
// comments (Enscryptions) underneath each post. The founding post is
// posts[0] — the first feed card, not a special shrine.
// Two-tier assist controls:
//   - X / Bluesky posts: inline quote-post composer with similarity gate.
//   - All other platforms: generic "I contributed" control + optional
//     share URL + one-line Enscryption ("What did you do?").
// No separate receipts list, no ledger view, no assist counts, no window.
//
// Mount contract: mount(rootEl, ctx) where
//   ctx = { store, navigate(view, params), campaign }
//   store = { game, campaigns, me, saveGame, saveCampaigns, saveMe }

import * as campaignModel from './campaign.mjs';
import { ringSummary, resolveStore } from './home.mjs';
import * as quoteComposer from './quote-composer.mjs';

export const { addMember, postedCount } = campaignModel;
export { ringSummary };

const { encodeCampaignLink, relativeTime, initials, avatarHue } = campaignModel;

export const ENSCRYPTION_MAX_LENGTH = 280;

export const PLATFORM_OPTIONS = Object.freeze([
  'x',
  'bluesky',
  'threads',
  'reddit',
  'instagram',
  'tiktok',
  'youtube',
  'other',
]);

export const PLATFORM_LABELS = Object.freeze({
  x: 'X',
  bluesky: 'Bluesky',
  threads: 'Threads',
  reddit: 'Reddit',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  other: 'Other',
});

export const PASS_IT_ON_COPY =
  'A ringmate’s post travels further when a real reader passes it on. If one speaks to you, open it and share its link in your own #Ring channel or wherever your people gather. Only what you genuinely like — never an obligation, never a count.';

// ---------------------------------------------------------------- pure ---

function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

function toTimestamp(iso) {
  const t = Date.parse(iso ?? '');
  return Number.isNaN(t) ? 0 : t;
}

function handleKey(h) {
  return String(h ?? '').trim().toLowerCase();
}

function randomPostId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  const buf = new Uint8Array(8);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(buf);
    for (const b of buf) s += chars[b % 36];
  } else {
    for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * 36)];
  }
  return `pst_${s}`;
}

/** Human display label for a platform key. */
export function platformLabel(platform) {
  const key = String(platform ?? '').trim().toLowerCase();
  return PLATFORM_LABELS[key] || 'Other';
}

/** Clamp and trim an Enscryption note to max 280 chars. */
export function sanitizeEnscryption(note) {
  return String(note ?? '').trim().slice(0, ENSCRYPTION_MAX_LENGTH);
}

/** Assists on a post (empty array when none). */
export function postAssists(post) {
  if (typeof campaignModel.postAssists === 'function') {
    return campaignModel.postAssists(post);
  }
  return Array.isArray(post?.assists) ? post.assists : [];
}

/**
 * Extract the posts array from a campaign (v2 `posts`, or legacy
 * `anchorPost` wrapped as a single post for backward compat).
 */
export function campaignPosts(campaign) {
  if (!campaign || typeof campaign !== 'object') return [];
  if (Array.isArray(campaign.posts) && campaign.posts.length > 0) {
    return campaign.posts;
  }
  if (campaign.anchorPost && typeof campaign.anchorPost === 'object') {
    return [
      {
        id: 'pst_anchor00',
        author: campaign.anchorPost.author || '',
        platform: campaign.anchorPost.platform || 'other',
        url: campaign.anchorPost.url || '',
        text: campaign.anchorPost.text || '',
        kind: 'announcement',
        createdAt: campaign.createdAt || '',
        assists: [],
      },
    ];
  }
  return [];
}

/** Posts sorted newest first by `createdAt` (descending; later index breaks ties). */
export function feedPosts(campaign) {
  return campaignPosts(campaign)
    .map((post, idx) => ({ post, idx }))
    .sort((a, b) => {
      const diff = toTimestamp(b.post.createdAt) - toTimestamp(a.post.createdAt);
      return diff !== 0 ? diff : b.idx - a.idx;
    })
    .map(({ post }) => post);
}

/**
 * The Enscryption receipt text rendered as the comment body under a post
 * (spec section 2a & 15): `note ?? quoteText ?? ""`.
 */
export function assistReceiptText(assist) {
  if (!assist || typeof assist !== 'object') return '';
  const text = assist.note || assist.quoteText || '';
  return String(text).trim();
}

/** Link label for a contribution URL: "View quote" for x/bluesky, "View share" otherwise. */
export function assistLinkLabel(platform) {
  return quoteComposer.isComposerPlatform(platform) ? 'View quote' : 'View share';
}

/** Find a member's assist on a post (case-insensitive handle match), or null. */
export function myAssistFor(post, handle) {
  const target = handleKey(handle);
  if (!target) return null;
  return postAssists(post).find((a) => handleKey(a?.handle) === target) || null;
}

/**
 * Newest post (in feed order) that has at least one assist with a
 * quotable/shareable contribution URL, or null.
 */
export function newestQuotablePost(campaign) {
  for (const post of feedPosts(campaign)) {
    if (postAssists(post).some((a) => typeof a?.url === 'string' && a.url.trim().length > 0)) {
      return post;
    }
  }
  return null;
}

/**
 * True when at least one post has a quotable/shareable contribution URL
 * (v2), or a legacy member has status 'posted' with a quoteUrl (v1 compat).
 */
export function hasQuotablePost(campaign) {
  if (!campaign || typeof campaign !== 'object') return false;
  if (Array.isArray(campaign.posts) && campaign.posts.length > 0) {
    return newestQuotablePost(campaign) !== null;
  }
  return (campaign.members || []).some((m) => m.status === 'posted' && m.quoteUrl);
}

/**
 * Passive URL recognition (spec section 4). Delegates to V38
 * `campaignModel.parsePostUrl` when available; otherwise parses
 * locally from the URL string alone (never fetches, never throws).
 */
export function parsePostUrl(url) {
  if (typeof campaignModel.parsePostUrl === 'function') {
    return campaignModel.parsePostUrl(url);
  }
  try {
    const parsed = new URL(String(url ?? '').trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    let platform = 'other';
    if (host === 'x.com' || host === 'twitter.com') platform = 'x';
    else if (host === 'bsky.app') platform = 'bluesky';
    else if (host === 'threads.net' || host === 'threads.com') platform = 'threads';
    else if (host === 'reddit.com' || host === 'old.reddit.com') platform = 'reddit';
    else if (host === 'instagram.com') platform = 'instagram';
    else if (host === 'tiktok.com') platform = 'tiktok';
    else if (host === 'youtube.com' || host === 'youtu.be') platform = 'youtube';

    const out = { platform };
    if (platform === 'x') {
      const m = parsed.pathname.match(/^\/([^/]+)\/status\/\d+/);
      if (m && m[1] && m[1].toLowerCase() !== 'i') {
        out.author = `@${m[1].replace(/^@/, '')}`;
      }
    } else if (platform === 'reddit') {
      const m = parsed.pathname.match(/^\/r\/[^/]+\/comments\/[^/]+\/([^/]+)/);
      if (m && m[1]) {
        const title = decodeURIComponent(m[1]).replace(/[-_]+/g, ' ').trim().slice(0, 120);
        if (title) out.title = title;
      }
    }
    return out;
  } catch {
    return { platform: 'other' };
  }
}

/**
 * Append a post to a campaign (spec section 3b). Delegates to V38
 * `campaignModel.addPost` when available; otherwise returns a new
 * campaign with the validated post appended.
 */
export function addPostToCampaign(campaign, postInput) {
  if (typeof campaignModel.addPost === 'function') {
    return campaignModel.addPost(campaign, postInput);
  }
  const next = clone(campaign);
  const author = String(postInput?.author ?? '').trim();
  const platform = String(postInput?.platform ?? '').trim().toLowerCase() || 'other';
  const url = String(postInput?.url ?? '').trim();
  if (!author) throw new Error('Invalid post: author is required');
  if (!/^https?:\/\//i.test(url)) throw new Error('Invalid post: url must be http(s)');
  const post = {
    id: String(postInput?.id || '').trim() || randomPostId(),
    author,
    ...(postInput?.authorName ? { authorName: String(postInput.authorName).trim() } : {}),
    platform,
    url,
    ...(postInput?.text ? { text: String(postInput.text).trim() } : {}),
    kind: postInput?.kind || 'other',
    createdAt: postInput?.createdAt || new Date().toISOString(),
    assists: Array.isArray(postInput?.assists) ? clone(postInput.assists) : [],
  };
  next.posts = [...campaignPosts(next), post];
  return next;
}

/**
 * Record/upsert an assist on a post (spec section 3b). Delegates to V38
 * `campaignModel.markContributed` when available; otherwise returns a new
 * campaign with the assist upserted by handle (case-insensitive).
 */
export function markPostContributed(campaign, postId, handle, details = {}) {
  if (typeof campaignModel.markContributed === 'function') {
    return campaignModel.markContributed(campaign, postId, handle, details);
  }
  const next = clone(campaign);
  const cleanHandle = String(handle ?? '').trim();
  if (!cleanHandle || !postId) return next;
  const target = cleanHandle.toLowerCase();
  const stamp = details.now
    ? new Date(details.now).toISOString()
    : new Date().toISOString();
  const posts = campaignPosts(next);
  let matched = false;
  next.posts = posts.map((p) => {
    if (p.id !== postId) return p;
    matched = true;
    const assists = Array.isArray(p.assists) ? [...p.assists] : [];
    const entry = {
      handle: cleanHandle,
      status: 'contributed',
      contributedAt: stamp,
      ...(details.url ? { url: String(details.url).trim() } : {}),
      ...(details.quoteText ? { quoteText: String(details.quoteText).trim() } : {}),
      ...(details.note ? { note: sanitizeEnscryption(details.note) } : {}),
    };
    const idx = assists.findIndex((a) => handleKey(a?.handle) === target);
    if (idx >= 0) assists[idx] = entry;
    else assists.push(entry);
    return { ...p, assists };
  });
  return matched ? next : clone(campaign);
}

// ----------------------------------------------------------------- DOM ---

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function syncCampaignToStore(store, campaign, updated) {
  const list = [...(store.campaigns || [])];
  const idx = list.findIndex((c) => c.id === campaign.id);
  if (idx >= 0) list[idx] = updated;
  else list.push(updated);
  store.saveCampaigns(list);
  store.campaigns = list;
  campaign.members = updated.members;
  if (updated.posts) campaign.posts = updated.posts;
  if (updated.anchorPost) campaign.anchorPost = updated.anchorPost;
}

function renderCommentsHtml(post) {
  const assists = postAssists(post);
  if (assists.length === 0) return '';
  const linkLabel = assistLinkLabel(post.platform);
  const items = assists
    .map((a) => {
      const receipt = assistReceiptText(a);
      const time = a.contributedAt ? relativeTime(a.contributedAt) : '';
      const hasUrl = typeof a.url === 'string' && a.url.trim().length > 0;
      const body = receipt
        ? `<span class="comment-author">${esc(a.handle)}</span>: <span class="comment-text">${esc(receipt)}</span>`
        : `<span class="comment-author">${esc(a.handle)}</span> <span class="comment-text">Contributed</span>`;
      const link = hasUrl
        ? ` · <a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(linkLabel)}</a>`
        : '';
      const stamp = time ? ` <span class="member-time">${esc(time)}</span>` : '';
      return `<li class="post-comment">${body}${link}${stamp}</li>`;
    })
    .join('');
  return `<ul class="post-comments">${items}</ul>`;
}

function renderPostActionHtml(post, alreadyMember, me) {
  if (!alreadyMember) return '';
  const mine = myAssistFor(post, me.handle);
  if (mine) {
    const hasUrl = typeof mine.url === 'string' && mine.url.trim().length > 0;
    const linkLabel = assistLinkLabel(post.platform);
    return `<p class="post-my-status">Contributed${
      hasUrl
        ? ` · <a href="${esc(mine.url)}" target="_blank" rel="noopener noreferrer">${esc(linkLabel)}</a>`
        : ''
    }</p>`;
  }
  if (quoteComposer.isComposerPlatform(post.platform)) {
    return `<div class="post-composer" data-composer-post="${esc(post.id)}"></div>`;
  }
  return `<form class="post-contribute-form" data-contribute-post="${esc(post.id)}">
    <label>What did you do?
      <input type="text" name="note" maxlength="${ENSCRYPTION_MAX_LENGTH}" placeholder="e.g. Upvoted, left a comment, shared to #Ring" autocomplete="off">
    </label>
    <label>Share link (optional)
      <input type="text" name="url" placeholder="https://..." autocomplete="off">
    </label>
    <button type="submit" class="primary">I contributed</button>
  </form>`;
}

export function mount(rootEl, ctx) {
  const store = resolveStore(ctx);
  const campaign = ctx && ctx.campaign;
  const navigate = (ctx && ctx.navigate) || (() => {});
  let mountedComposers = [];

  function teardownComposers() {
    for (const h of mountedComposers) {
      if (h && typeof h.destroy === 'function') h.destroy();
    }
    mountedComposers = [];
  }

  function render() {
    teardownComposers();
    if (!campaign) {
      rootEl.innerHTML =
        '<section class="campaign-page"><p>No campaign here — open one from a link or from home.</p></section>';
      return;
    }

    const game = campaign.game || store.game || { name: 'Untitled game', links: {}, tags: [] };
    const me = store.me || {};
    const alreadyMember = (campaign.members || []).some(
      (m) => me.handle && handleKey(m.handle) === handleKey(me.handle),
    );
    const posts = feedPosts(campaign);
    const quotable = newestQuotablePost(campaign);
    const baseUrl =
      typeof window !== 'undefined' ? window.location.href.split('#')[0] : '';
    const share = encodeCampaignLink(campaign, baseUrl);

    const links = game.links || {};
    const gameLinks = [
      links.steam ? `<a href="${esc(links.steam)}">Steam</a>` : '',
      links.itch ? `<a href="${esc(links.itch)}">itch.io</a>` : '',
      links.x ? `<a href="${esc(links.x)}">X</a>` : '',
    ]
      .filter(Boolean)
      .join(' · ');

    const feedHtml = posts.length
      ? posts
          .map((post) => {
            const time = relativeTime(post.createdAt);
            const authorLabel = post.authorName
              ? `${post.authorName} (${post.author})`
              : post.author;
            const kindBadge =
              post.kind && post.kind !== 'other'
                ? ` · ${esc(post.kind)}`
                : '';
            const showPassOn = quotable && quotable.id === post.id;
            const isOwnPost =
              me.handle && handleKey(post.author) === handleKey(me.handle);
            return `<article class="post-card feed-post" data-post-id="${esc(post.id)}" data-platform="${esc(post.platform)}">
              <div class="post-head">
                <span class="avatar avatar-h${avatarHue(post.author)}">${esc(initials(post.authorName || post.author))}</span>
                <span class="post-author">${esc(authorLabel)}</span>
                <span class="post-time">· ${esc(platformLabel(post.platform))}${kindBadge}${time ? ` · ${esc(time)}` : ''}</span>
              </div>
              ${post.text ? `<blockquote>&ldquo;${esc(post.text)}&rdquo;</blockquote>` : ''}
              <p class="anchor-meta"><a href="${esc(post.url)}" target="_blank" rel="noopener noreferrer">View post</a></p>
              ${renderCommentsHtml(post)}
              ${renderPostActionHtml(post, alreadyMember, me)}
              ${showPassOn ? `<p class="ring-pass-on">${esc(PASS_IT_ON_COPY)}</p>${isOwnPost ? '' : `<p><button type="button" data-pass-on-post="${esc(post.id)}">I passed it on</button></p>`}` : ''}
            </article>`;
          })
          .join('')
      : '<p class="empty-state">No posts in this ring yet.</p>';

    const platformOptionsHtml = PLATFORM_OPTIONS.map(
      (p) => `<option value="${esc(p)}">${esc(platformLabel(p))}</option>`,
    ).join('');

    rootEl.innerHTML = `
      <section class="campaign-page">
        <header class="campaign-game">
          <h2>${esc(game.name)}</h2>
          ${gameLinks ? `<p class="game-links">${gameLinks}</p>` : ''}
          ${game.tags && game.tags.length ? `<p class="game-tags">${game.tags.map(esc).join(', ')}</p>` : ''}
          <h3>${esc(campaign.title)}${campaign.demo ? ' <span class="demo-badge">DEMO</span>' : ''}</h3>
        </header>

        ${
          alreadyMember
            ? `<section class="campaign-add-post">
                <h3>Add a post</h3>
                <form id="add-post-form">
                  <p class="form-error" id="add-post-errors" hidden></p>
                  <label>Post URL
                    <input type="url" name="url" required placeholder="Paste any post URL (X, Reddit, Instagram, YouTube, …)" autocomplete="off">
                  </label>
                  <label>Platform
                    <select name="platform">${platformOptionsHtml}</select>
                  </label>
                  <label>Author
                    <input type="text" name="author" required value="${esc(me.handle || '')}" placeholder="@handle" autocomplete="off">
                  </label>
                  <label>Post text or context
                    <textarea name="text" rows="2" placeholder="Post text (required for X / Bluesky) or a line of context"></textarea>
                  </label>
                  <label>Kind
                    <select name="kind">
                      <option value="other">Other</option>
                      <option value="announcement">Announcement</option>
                      <option value="devlog">Devlog</option>
                      <option value="clip">Clip</option>
                    </select>
                  </label>
                  <button type="submit" class="primary">Add post</button>
                </form>
              </section>`
            : ''
        }

        <section class="campaign-feed">
          <h3>Ring feed</h3>
          ${feedHtml}
        </section>

        <section class="ring">
          <h3>The ring (${(campaign.members || []).length})</h3>
          ${
            (campaign.members || []).length
              ? `<ul class="ring-list">${(campaign.members || [])
                  .map(
                    (m) => `<li class="ring-member">
                      <span class="avatar avatar-h${avatarHue(m.handle)}">${esc(initials(m.name || m.handle))}</span>
                      <span class="member-name">${esc(m.name)}</span>
                      <span class="member-handle">${esc(m.handle)}</span>
                    </li>`,
                  )
                  .join('')}</ul>`
              : '<p class="empty-state">No members yet — be the first to join.</p>'
          }
        </section>

        <section class="ring-join">
          ${
            alreadyMember
              ? '<p>You&rsquo;re in the ring.</p>'
              : `<h3>Join the ring</h3>
          <p>Local only — no server, no approval queue. Anyone with the link joins.</p>
          <form id="ring-join-form">
            <p class="form-error" id="join-errors" hidden></p>
            <label>Your name
              <input type="text" name="name" value="${esc(me.name || '')}" required autocomplete="off">
            </label>
            <label>Your handle
              <input type="text" name="handle" value="${esc(me.handle || '')}" required autocomplete="off" placeholder="@yourhandle">
            </label>
            <button type="submit">Join</button>
          </form>`
          }
        </section>

        <section class="campaign-share">
          <h3>Share this campaign</h3>
          <p>Anyone with this link opens the app straight into this campaign and can join. The link is the invite.</p>
          <p><input type="text" readonly value="${esc(share.url)}" id="campaign-share-link" aria-label="Campaign link"> <button type="button" id="campaign-share-copy">Copy link</button></p>
          ${share.long ? '<p class="form-error">This link is long — some chat apps may trim it.</p>' : ''}
        </section>

        <p><button type="button" id="back-home">Back to home</button></p>
      </section>`;

    // Wire "Add a post" form with passive URL prefill + full manual editability.
    const addPostForm = rootEl.querySelector('#add-post-form');
    if (addPostForm) {
      const urlInput = addPostForm.querySelector('input[name="url"]');
      const platformSelect = addPostForm.querySelector('select[name="platform"]');
      const authorInput = addPostForm.querySelector('input[name="author"]');
      const textInput = addPostForm.querySelector('textarea[name="text"]');
      const touched = { platform: false, author: false, text: false };

      platformSelect.addEventListener('change', () => { touched.platform = true; });
      authorInput.addEventListener('input', () => { touched.author = true; });
      textInput.addEventListener('input', () => { touched.text = true; });

      const prefillFromUrl = () => {
        const parsed = parsePostUrl(urlInput.value);
        if (!touched.platform && parsed.platform) {
          platformSelect.value = PLATFORM_OPTIONS.includes(parsed.platform)
            ? parsed.platform
            : 'other';
        }
        if (!touched.author && parsed.author) {
          authorInput.value = parsed.author;
        }
        if (!touched.text && (parsed.text || parsed.title)) {
          textInput.value = parsed.text || parsed.title;
        }
      };
      urlInput.addEventListener('input', prefillFromUrl);
      urlInput.addEventListener('change', prefillFromUrl);

      addPostForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = new FormData(addPostForm);
        const url = String(data.get('url') || '').trim();
        const platform = String(data.get('platform') || 'other').trim().toLowerCase();
        const author = String(data.get('author') || '').trim();
        const text = String(data.get('text') || '').trim();
        const kind = String(data.get('kind') || 'other').trim();
        const errEl = rootEl.querySelector('#add-post-errors');
        const errors = [];
        if (!/^https?:\/\//i.test(url)) errors.push('Enter a valid http(s) post URL.');
        if (!author) errors.push('Author handle is required.');
        if (quoteComposer.isComposerPlatform(platform) && !text) {
          errors.push('Post text is required for X and Bluesky posts so the similarity gate can check drafts.');
        }
        if (errors.length) {
          errEl.textContent = errors.join(' ');
          errEl.hidden = false;
          return;
        }
        try {
          const updated = addPostToCampaign(campaign, {
            url,
            platform,
            author,
            ...(me.name && handleKey(author) === handleKey(me.handle) ? { authorName: me.name } : {}),
            ...(text ? { text } : {}),
            kind,
          });
          syncCampaignToStore(store, campaign, updated);
          render();
        } catch (err) {
          errEl.textContent = err.message;
          errEl.hidden = false;
        }
      });
    }

    // Wire inline X / Bluesky composers for unassisted composer-tier posts.
    rootEl.querySelectorAll('[data-composer-post]').forEach((slot) => {
      const postId = slot.dataset.composerPost;
      const post = posts.find((p) => p.id === postId);
      if (!post) return;
      const handle = quoteComposer.mount(slot, {
        campaign,
        post,
        me: store.me,
        compact: true,
        onPosted: (quoteUrl, draft) => {
          const updated = markPostContributed(campaign, post.id, me.handle, {
            url: quoteUrl || undefined,
            quoteText: String(draft || '').trim() || undefined,
          });
          syncCampaignToStore(store, campaign, updated);
          render();
        },
      });
      mountedComposers.push(handle);
    });

    // Wire generic "I contributed" forms for non-X/Bluesky posts.
    rootEl.querySelectorAll('[data-contribute-post]').forEach((form) => {
      const postId = form.dataset.contributePost;
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = new FormData(form);
        const note = sanitizeEnscryption(data.get('note'));
        const url = String(data.get('url') || '').trim();
        const updated = markPostContributed(campaign, postId, me.handle, {
          ...(url ? { url } : {}),
          ...(note ? { note } : {}),
        });
        syncCampaignToStore(store, campaign, updated);
        render();
      });
    });

    // "I passed it on" — self-reported receipt for the pass-it-on
    // milestone. Only on the newest quotable ringmate post; the
    // callback (app.js) records it privately, never a count.
    rootEl.querySelectorAll('[data-pass-on-post]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (typeof ctx.onPassOn === 'function') {
          ctx.onPassOn({ campaignId: campaign.id, postId: btn.dataset.passOnPost });
        }
        btn.disabled = true;
        btn.textContent = 'Passed on — noted.';
      });
    });

    // Wire Join form.
    const joinForm = rootEl.querySelector('#ring-join-form');
    if (joinForm) {
      joinForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = new FormData(joinForm);
        const name = String(data.get('name') || '').trim();
        const handle = String(data.get('handle') || '').trim();
        const errEl = rootEl.querySelector('#join-errors');
        if (!name || !handle) {
          errEl.textContent = 'Name and handle are both required to join.';
          errEl.hidden = false;
          return;
        }
        const updated = addMember(campaign, { name, handle });
        syncCampaignToStore(store, campaign, updated);
        store.saveMe({ name, handle });
        store.me = { name, handle };
        render();
      });
    }

    const back = rootEl.querySelector('#back-home');
    if (back) back.addEventListener('click', () => navigate('home', {}));

    const copyBtn = rootEl.querySelector('#campaign-share-copy');
    const shareInput = rootEl.querySelector('#campaign-share-link');
    if (copyBtn && shareInput) {
      copyBtn.addEventListener('click', async () => {
        const text = shareInput.value;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
          } else {
            shareInput.select();
            document.execCommand('copy');
          }
          copyBtn.textContent = 'Copied!';
        } catch {
          shareInput.select();
          copyBtn.textContent = 'Select and copy';
        }
      });
    }
  }

  render();
}
