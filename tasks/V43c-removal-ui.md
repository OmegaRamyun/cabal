# V43c — Creator removal: campaign page UI

Status: claimed
Branch: `task/V43c-removal-ui`
Spec: `/home/hatch/workspace/cabal-bench/redesign-sustained-ring.md` (17b, 17d)
Files owned: `src/campaign-page.mjs`, `tests/v43-removal-ui.test.mjs`, `tasks/V43c-removal-ui.md`

## What changed
- Per-member **Remove** button in the roster, creator only (`me.handle === createdBy`, case-insensitive; never on self or already-removed). Confirm step uses the spec copy, then `removeMember` (V43a model when present, local fallback otherwise), sync to store, re-render.
- Removed members render as `@handle — removed` (plain text, no re-add).
- Removed local handle: add-post / compose / contribute controls and the join form hide; notice "You were removed from this ring. You can still read it." Posts and comments stay visible.
- `syncCampaignToStore` now copies `removedMembers`.
- Pure helpers exported: `isCreator`, `isRemovedHandle`, `removedRoster`, `canRemoveMember`, `controlsHidden`, `removeConfirmCopy`, `atHandle`, `removeMemberFromCampaign`.

## Seams
- Relay publish of the removal is **V43b's job**. This UI updates local state only and calls optional `ctx.onMemberRemoved({ campaignId, handle })` after the local update — app.js (coordinator) can wire that to the Nostr republish.
- Bridge: `campaignModel.removeMember` / `isRemoved` are used when present; fallbacks follow spec 17b shapes.

## Manual check (DOM)
1. As creator, open a ring with 2+ members: Remove appears on others only. Cancel in confirm → nothing changes.
2. Confirm → member leaves the list, shows "@handle — removed", their posts remain.
3. As a non-creator: no Remove buttons.
4. Set local handle to a removed one: notice shown, no add-post/contribute/composer/join form, feed readable.
