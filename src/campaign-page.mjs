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

import { addMember, postedCount, encodeCampaignLink } from './campaign.mjs';
import { ringSummary, resolveStore } from './home.mjs';

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
        <article class="campaign-anchor">
          <h3>${esc(campaign.title)}${campaign.demo ? ' <span class="demo-badge">DEMO</span>' : ''}</h3>
          <blockquote>&ldquo;${esc(campaign.anchorPost.text)}&rdquo;</blockquote>
          <p class="anchor-meta">${esc(campaign.anchorPost.author)} · ${esc(campaign.anchorPost.platform)} ·
            <a href="${esc(campaign.anchorPost.url)}">View original post</a></p>
          <p class="campaign-meta">${esc(windowLabel(campaign))} · Posted ${summary.posted}/${summary.total}</p>
        </article>
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
                  .map(
                    (m) => `<li class="ring-member" data-status="${esc(m.status)}">
                      <span class="member-name">${esc(m.name)}</span>
                      <span class="member-handle">${esc(m.handle)}</span>
                      <span class="member-status">${m.status === 'posted' ? 'Posted' : 'Pending'}</span>
                      ${m.status === 'posted' && m.quoteUrl ? `<a href="${esc(m.quoteUrl)}">Quote post</a>` : ''}
                    </li>`,
                  )
                  .join('')}</ul>`
              : '<p>No members yet — be the first to join.</p>'
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
  }

  render();
}
