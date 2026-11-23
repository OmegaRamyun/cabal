// Cabal v0.2 — Campaign page: whole ring + join (V22).
//
// Shows the game, the anchor post, and the WHOLE ring — every member with
// posted/pending state and a quote-post link when posted. Join is local
// only: no server, no approval queue. The share link encodes the campaign
// in the URL hash, so anyone with the link opens the app straight into
// this campaign.
//
// Mount contract: mount(rootEl, ctx) where
//   ctx = { store, navigate(view, params), campaign }
//   store = { game, campaigns, me, saveGame, saveCampaigns, saveMe }
//   campaign = the campaign object to render (frozen V21 shape)

import { addMember, postedCount, encodeCampaignLink, markPosted, relativeTime, initials, avatarHue } from './campaign.mjs';
import { ringSummary, resolveStore } from './home.mjs';
import * as quoteComposer from './quote-composer.mjs';

export { addMember, postedCount, ringSummary };

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? esc(iso) : d.toLocaleDateString();
}

function windowLabel(campaign) {
  const w = campaign.window;
  if (!w) return 'Open-ended — no window';
  if (w.start && w.end) return `${fmtDate(w.start)} – ${fmtDate(w.end)}`;
  if (w.start) return `From ${fmtDate(w.start)}`;
  if (w.end) return `Until ${fmtDate(w.end)}`;
  return 'Open-ended — no window';
}

function meterHtml(summary) {
  const pct = summary.total ? Math.round((summary.posted / summary.total) * 100) : 0;
  return `<div class="ring-progress" role="progressbar" aria-valuenow="${summary.posted}" aria-valuemin="0" aria-valuemax="${summary.total}" aria-label="Posted ${summary.posted} of ${summary.total}"><div class="ring-progress-fill" style="width:${pct}%"></div></div>`;
}

/**
 * hasQuotablePost(campaign) — true when at least one ring member has
 * posted with a quote-post link worth passing on. Pure; drives the
 * "pass it on" nudge on the campaign page.
 */
export function hasQuotablePost(campaign) {
  return (campaign?.members || []).some(
    (m) => m.status === 'posted' && m.quoteUrl,
  );
}

export function mount(rootEl, ctx) {
  const store = resolveStore(ctx);
  const campaign = ctx && ctx.campaign;
  const navigate = (ctx && ctx.navigate) || (() => {});

  function render() {
    if (!campaign) {
      rootEl.innerHTML =
        '<section class="campaign-page"><p>No campaign here — open one from a link or from home.</p></section>';
      return;
    }
    const game = campaign.game || store.game || { name: 'Untitled game', links: {}, tags: [] };
    const summary = ringSummary(campaign);
    const me = store.me || {};
    const alreadyMember = (campaign.members || []).some(
      (m) => me.handle && m.handle === me.handle,
    );
    const myStatus = alreadyMember
      ? (campaign.members || []).find((m) => m.handle === me.handle)?.status
      : null;
    const hasQuotable = hasQuotablePost(campaign);
    // The compose box lives on the page for pending members: composer-first.
    const showComposer = alreadyMember && myStatus === 'pending';
    // Anchor post time: the window start is the proxy (the anchor's own
    // post time is not stored); open-ended campaigns use createdAt.
    const anchorTime = relativeTime(
      campaign.window && campaign.window.start ? campaign.window.start : campaign.createdAt,
    );
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

    rootEl.innerHTML = `
      <section class="campaign-page">
        <header class="campaign-game">
          <h2>${esc(game.name)}</h2>
          ${gameLinks ? `<p class="game-links">${gameLinks}</p>` : ''}
          ${game.tags && game.tags.length ? `<p class="game-tags">${game.tags.map(esc).join(', ')}</p>` : ''}
        </header>
        <article class="campaign-anchor post-card">
          <h3>${esc(campaign.title)}${campaign.demo ? ' <span class="demo-badge">DEMO</span>' : ''}</h3>
          <div class="post-head">
            <span class="avatar avatar-h${avatarHue(campaign.anchorPost.author)}">${esc(initials(campaign.anchorPost.author))}</span>
            <span class="post-author">${esc(campaign.anchorPost.author)}</span>
            <span class="post-time">· ${esc(campaign.anchorPost.platform)}${anchorTime ? ` · ${esc(anchorTime)}` : ''}</span>
          </div>
          <blockquote>&ldquo;${esc(campaign.anchorPost.text)}&rdquo;</blockquote>
          <p class="anchor-meta"><a href="${esc(campaign.anchorPost.url)}">View original post</a></p>
          <p class="campaign-meta">${esc(windowLabel(campaign))} · Posted ${summary.posted}/${summary.total}</p>
          ${meterHtml(summary)}
        </article>
        ${showComposer ? '<div class="compose-sticky" id="campaign-composer"></div>' : ''}
        <section class="campaign-share">
          <h3>Share this campaign</h3>
          <p>Anyone with this link opens the app straight into this campaign and can join. The link is the invite.</p>
          <p><input type="text" readonly value="${esc(share.url)}" id="campaign-share-link" aria-label="Campaign link"> <button type="button" id="campaign-share-copy">Copy link</button></p>
          ${share.long ? '<p class="form-error">This link is long — some chat apps may trim it.</p>' : ''}
        </section>
        <section class="ring">
          <h3>The whole ring (${summary.total})</h3>
          ${
            summary.total
              ? `<ul class="ring-list">${(campaign.members || [])
                  .map((m) => {
                    const posted = m.status === 'posted';
                    const time = posted && m.postedAt ? relativeTime(m.postedAt) : '';
                    return `<li class="ring-member" data-status="${esc(m.status)}">
                      <span class="avatar avatar-h${avatarHue(m.handle)}">${esc(initials(m.name || m.handle))}</span>
                      <span class="member-name">${esc(m.name)}</span>
                      <span class="member-handle">${esc(m.handle)}</span>
                      <span class="member-status">${posted ? 'Posted' : 'Pending'}</span>
                      ${time ? `<span class="member-time">${esc(time)}</span>` : ''}
                      ${posted && m.quoteUrl ? `<a href="${esc(m.quoteUrl)}">Quote post</a>` : ''}
                      ${posted && m.quoteText ? `<div class="ring-quote"><blockquote>&ldquo;${esc(m.quoteText)}&rdquo;</blockquote><p class="ring-quote-meta">Quoting ${esc(campaign.anchorPost.author)}${m.quoteUrl ? ` · <a href="${esc(m.quoteUrl)}">View quote</a>` : ''}</p></div>` : ''}
                    </li>`;
                  })
                  .join('')}</ul>`
              : '<p class="empty-state">No members yet — be the first to join.</p>'
          }
          ${hasQuotable ? `<p class="ring-pass-on">A ringmate&rsquo;s quote-post travels further when a real reader passes it on. If one speaks to you, open it and share its link in your own #Ring channel or wherever your people gather. Only what you genuinely like — never an obligation, never a count.</p>` : ''}
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
        <p><button type="button" id="back-home">Back to home</button></p>
      </section>`;

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
        // Persist: replace the campaign in the store's list (or add it).
        const list = [...(store.campaigns || [])];
        const idx = list.findIndex((c) => c.id === campaign.id);
        if (idx >= 0) list[idx] = updated;
        else list.push(updated);
        store.saveCampaigns(list);
        store.campaigns = list;
        // Keep the rendered object in sync for the re-render.
        campaign.members = updated.members;
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
    // Embedded compose box for pending members: same component as the
    // standalone composer route, compact. Posting marks the member posted,
    // records their draft as the attached quote, and re-renders the page.
    const composerSlot = rootEl.querySelector('#campaign-composer');
    if (composerSlot) {
      quoteComposer.mount(composerSlot, {
        campaign,
        me: store.me,
        compact: true,
        onPosted: (quoteUrl, draft) => {
          const updated = markPosted(campaign, me.handle, quoteUrl || undefined);
          const member = (updated.members || []).find(
            (mm) => String(mm.handle).trim().toLowerCase() === String(me.handle).trim().toLowerCase(),
          );
          if (member && String(draft || '').trim()) member.quoteText = String(draft).trim();
          const list = [...(store.campaigns || [])];
          const idx = list.findIndex((c) => c.id === campaign.id);
          if (idx >= 0) list[idx] = updated;
          else list.push(updated);
          store.saveCampaigns(list);
          store.campaigns = list;
          campaign.members = updated.members;
          render();
        },
      });
    }
  }

  render();
}
