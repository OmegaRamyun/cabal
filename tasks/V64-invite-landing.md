# V64 — Dedicated invite landing for non-members

Status: done (branch `task/V64-invite-landing`, awaiting coordinator merge)

## What changed
- NEW `src/invite-landing.mjs`: pure `isInviteLanding(campaign, viewerHandle)`,
  `validateJoin`, `joinRing` (reuses `campaign.addMember`; removed handles
  stay refused), `deriveHandle` (blank handle -> `@name`, de-duplicated),
  `renderInviteCard`, `renderDeadLink`, and `mount(rootEl, ctx)`.
  `ctx = { campaign|null, me?, onJoin(updatedCampaign, member) }`.
- Verbatim copy: "No account needed. Add your name and handle to join this ring."
  and dead link "This ring link is old or was cleared. Ask the person who sent it for a fresh one."
  No raw `cmp_…` id is ever rendered.
- NEW `tests/v64-invite-landing.test.mjs` (5 tests).
- Membership model untouched. Removed viewers do not get the landing (they
  keep today's behaviour); a removed handle typed into the form is refused.

## Manual checks (DOM-only, not covered by node tests)
- Desktop and mobile (~375px): ring name, game, faces, name field, handle
  field and "Join ring" visible without scrolling.
- Real `#c=` invite link renders the card; after Join the user lands inside the ring.
- Unknown/cleared ring link shows the friendly error, no id anywhere.
- No `style.css` changes (coordinator-owned). Classes used: `invite-landing`,
  `invite-title`, `invite-game`, `invite-faces`, `invite-members`, `invite-more`,
  `invite-error`, plus existing `cabal-form`, `avatar`, `primary btn-md`.
  Coordinator may add styles for the `invite-*` classes.

## Shell wiring needed (app.js — coordinator)
1. Route hook in `renderCampaign(view, id, opts)` (app.js ~L300). After
   `findCampaign` resolves:
   ```js
   import * as inviteLanding from './src/invite-landing.mjs';
   // ...
   if (!campaign) { inviteLanding.mount(view, { campaign: null }); hideDemoBanner(); return; }
   if (inviteLanding.isInviteLanding(campaign, store.me?.handle)) {
     hideDemoBanner();
     view.textContent = '';
     inviteLanding.mount(view, {
       campaign, me: store.me,
       onJoin: (updated, member) => {
         // persist like campaign-page's syncCampaignToStore: replace/insert in store.campaigns, then
         store.saveCampaigns(/* list with updated */);
         store.saveMe(member); store.me = member;
         renderCampaign(view, id, opts);
       },
     });
     return;
   }
   ```
   Note: a ring opened from `#c=` is decoded in memory/store by the link intent;
   a ring only present in `data/campaigns.json` (static) must be inserted into
   `store.campaigns` on join. Check `syncCampaignToStore` in
   `src/campaign-page.mjs` for the exact persistence shape and mirror it.
2. Demo banner suppression on invite loads: `renderDemoBanner()` (app.js ~L847)
   fills `#demo-banner`. On an invite landing (and on the dead-link error),
   clear it: `document.querySelector('#demo-banner')?.replaceChildren()`
   (or skip `demo.mount`). Restore on the next non-invite route.
3. "Campaign not found" swap: replace `renderNotFound` (app.js ~L252) body with
   `inviteLanding.mount(view, { campaign: null })` so the old
   "No campaign with id ${id}" copy (which prints the raw id) is gone.
4. Not in my file set, so left for the coordinator/other lane: the remaining
   "Local only — anyone with the invite link can join." at
   `src/campaign-page.mjs:958` (Members-tab join form). Once the landing is
   wired it is rarely reached; swap it for the new INVITE_COPY or delete it.
