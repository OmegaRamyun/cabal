# V43a — Creator removal: campaign model

Status: claimed (implemented, tests green on this branch — awaiting coordinator merge)
Branch: `task/V43a-removal-model`
Spec: `cabal-bench/redesign-sustained-ring.md` sections 14–17b
Files owned: `src/campaign.mjs`, `tests/v43-removal-model.test.mjs`, `tasks/V43a-removal-model.md`

## What shipped
- `createdBy` (pinned to `members[0].handle` by `normalizeCampaign` the first time
  it is seen, so later roster changes can't move it) and `removedMembers`
  (`[{ handle, removedAt, removedBy }]`, `[]` default). Objects that aren't
  campaign-shaped (no `members` array) pass through untouched.
- `removeMember(campaign, handle, { by, now? })` -> new campaign. Creator-only
  (case-insensitive); anyone else gets an unchanged copy. Roster entry dropped,
  `removedMembers` appended (second removal refreshes `removedAt`, no dupes),
  posts/assists untouched as history.
- `isRemoved`, `isMember` (case-insensitive).
- `addMember` refuses a handle in `removedMembers` (unchanged copy).
- `createCampaign({ key })` stores an opaque `key`. No key generation here (V43b).
- `validateCampaign` accepts `createdBy`, `removedMembers`, `key`.
- `normalizeCampaign` keeps unknown fields (`nostr` sidecar, `key`).

## Link fragment format (decision)
`<base>#c=<base64url(JSON)>&k=<encodeURIComponent(key)>`

The key is a separate fragment param, NOT embedded in the payload JSON. Reasons:
the JSON payload stays key-free (encode strips `key`), so any code path that
republishes or logs the payload cannot leak it; the fragment is never sent to
the server; base64url has no `&`, so splitting is unambiguous. Decode puts `k`
on `campaign.key`. Alternative rejected: key inside the JSON — one stray
`JSON.stringify(campaign)` toward a relay or the public list would publish the
credential. Decode errors never include the key. Old links (no `&k=`) decode as before.

## Notes for other lanes
- `data/campaigns.json` and `campaigns.atom` must never contain `key` (not this lane's files).
- V43b event builders must still strip `key` before publishing.
- Creator cannot remove themself (would orphan the ring / break `members >= 1`).

## Manual check
None — pure functions only.
