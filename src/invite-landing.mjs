// Cabal V64 — dedicated invite landing for non-members.
//
// Opening a ring you have not joined shows ONE full-focus card: ring name,
// game, member faces, a "Your name" field, an optional handle, and a
// "Join ring" button above the fold. Joining reuses campaign.addMember.
//
// Mount contract: mount(rootEl, ctx) where
//   ctx = { campaign, me?, onJoin(updatedCampaign, member) }
//   campaign: the resolved ring, or null/undefined for a dead link.
//   onJoin: the shell persists the updated ring and opens it.

import { addMember, isMember, isRemoved, initials, avatarHue } from './campaign.mjs';

export const INVITE_COPY = 'No account needed. Add your name and handle to join this ring.';
export const DEAD_LINK_COPY =
  'This ring link is old or was cleared. Ask the person who sent it for a fresh one.';
export const REMOVED_COPY = "You can't join this ring.";
export const NAME_REQUIRED_COPY = 'Add your name to join.';

const MAX_FACES = 6;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const lc = (s) => String(s ?? '').trim().replace(/^@+/, '').toLowerCase();

/** True when the viewer should see the invite card: a real ring they are not in (and were not removed from). */
export function isInviteLanding(campaign, viewerHandle, viewerName) {
  if (!campaign || typeof campaign !== 'object' || !campaign.id) return false;
  if (viewerHandle && isMember(campaign, viewerHandle)) return false;
  if (viewerHandle && isRemoved(campaign, viewerHandle)) return false;
  // Handle-less creator (V62 + smoke fix): creation records
  // me = {name, handle: ''} and the seed member members[0] carries the
  // same name with an empty handle. A stranger has no me record at all
  // (viewerHandle undefined), so this only matches the creator of an
  // unclaimed-seed ring — never a stranger, never a claimed one.
  if (viewerHandle === '' && viewerName) {
    const seed = (campaign.members || [])[0];
    if (seed && !seed.handle && seed.name === viewerName) return false;
  }
  return true;
}

/** Handle from a name when the optional handle is blank, de-duplicated against the roster. */
export function deriveHandle(name, campaign) {
  const base = String(name ?? '').toLowerCase().replace(/[^a-z0-9_]+/g, '').slice(0, 24) || 'guest';
  const taken = new Set((campaign?.members || []).map((m) => lc(m.handle)));
  (campaign?.removedMembers || []).forEach((r) => taken.add(lc(r.handle)));
  let h = base;
  for (let i = 2; taken.has(h); i += 1) h = `${base}${i}`;
  return `@${h}`;
}

/**
 * validateJoin(campaign, { name, handle }) ->
 *   { ok: true, member: { name, handle } } | { ok: false, error }
 * Name required; handle optional (derived). Removed handles refused.
 */
export function validateJoin(campaign, input) {
  const name = String(input?.name ?? '').trim();
  if (!name) return { ok: false, error: NAME_REQUIRED_COPY };
  let handle = String(input?.handle ?? '').trim();
  if (handle) {
    if (!handle.startsWith('@')) handle = `@${handle}`;
  } else {
    handle = deriveHandle(name, campaign);
  }
  if (isRemoved(campaign, handle) || isRemoved(campaign, handle.replace(/^@/, ''))) {
    return { ok: false, error: REMOVED_COPY };
  }
  return { ok: true, member: { name, handle } };
}

/** joinRing(campaign, input) -> { ok, campaign?, member?, error? } via the existing addMember path. */
export function joinRing(campaign, input) {
  const v = validateJoin(campaign, input);
  if (!v.ok) return v;
  const updated = addMember(campaign, v.member);
  if (!isMember(updated, v.member.handle)) return { ok: false, error: REMOVED_COPY };
  return { ok: true, campaign: updated, member: v.member };
}

/** Dead/cleared link card. Never prints an id. */
export function renderDeadLink() {
  return `<section class="invite-landing invite-landing--dead">
    <h2 class="invite-title">Ring not found</h2>
    <p class="view-lede invite-error">${esc(DEAD_LINK_COPY)}</p>
    <p><a href="#/">Back to home</a></p>
  </section>`;
}

/** Full-focus invite card HTML.
 * V77: the form is `novalidate` and the name input carries NO `required`
 * attribute — native validation blocks the submit event entirely, so the
 * inline #invite-errors path in mount() never ran and an empty-name Join
 * was a silent no-op. Validation lives in validateJoin; the error shows
 * inline instead. */
export function renderInviteCard(campaign, me = {}) {
  const members = campaign.members || [];
  const faces = members
    .slice(0, MAX_FACES)
    .map(
      (m) =>
        `<span class="avatar avatar-h${avatarHue(m.handle)}" title="${esc(m.name || m.handle)}">${esc(initials(m.name || m.handle))}</span>`,
    )
    .join('');
  const more = members.length > MAX_FACES ? `<span class="invite-more">+${members.length - MAX_FACES}</span>` : '';
  const names = members.slice(0, 3).map((m) => esc(m.handle || m.name)).join(', ');
  return `<section class="invite-landing">
    <p class="section-eyebrow">You&rsquo;re invited</p>
    <h2 class="invite-title">${esc(campaign.title || campaign.name || campaign.game?.name || 'Ring')}</h2>
    ${campaign.game?.name ? `<p class="invite-game">${esc(campaign.game.name)}</p>` : ''}
    ${members.length ? `<div class="invite-faces">${faces}${more}</div><p class="invite-members">${names}</p>` : ''}
    <p class="view-lede">${esc(INVITE_COPY)}</p>
    <form id="invite-join-form" class="cabal-form" novalidate>
      <p class="form-error" id="invite-errors" hidden></p>
      <label>Your name
        <input type="text" name="name" value="${esc(me?.name || '')}" autocomplete="off" autofocus>
      </label>
      <label>Handle (optional)
        <input type="text" name="handle" value="${esc(me?.handle || '')}" autocomplete="off" placeholder="@yourhandle">
      </label>
      <div class="cabal-form-footer">
        <button type="submit" class="primary btn-md">Join ring</button>
      </div>
    </form>
  </section>`;
}

/** mount(rootEl, ctx) — renders the card (or friendly error) and wires Join. */
export function mount(rootEl, ctx = {}) {
  const { campaign, me } = ctx;
  if (!campaign) {
    rootEl.innerHTML = renderDeadLink();
    return;
  }
  rootEl.innerHTML = renderInviteCard(campaign, me || {});
  const form = rootEl.querySelector('#invite-join-form');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const res = joinRing(campaign, { name: data.get('name'), handle: data.get('handle') });
    if (!res.ok) {
      const errEl = rootEl.querySelector('#invite-errors');
      errEl.textContent = res.error;
      errEl.hidden = false;
      const nameInput = form.querySelector('input[name="name"]');
      if (nameInput && typeof nameInput.focus === 'function') nameInput.focus();
      return;
    }
    if (typeof ctx.onJoin === 'function') ctx.onJoin(res.campaign, res.member);
  });
}
