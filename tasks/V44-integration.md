# V44 — Sustained-ring integration: merge V43a–V43c, wire the shell

Status: done. Coordinator integration (direct on main, like V42).

## Merges (in order, one patch bump each)

| Merge | Commit | Version | Tests |
|---|---|---|---|
| V43a creator removal model | f86c861 | 0.2.14 | 295/295 |
| V43b Nostr shared campaign keypair + removal (includes V41) | 1bb7ea8 | 0.2.15 | 318/318 |
| V43c creator removal UI | 5f2c98e | 0.2.16 | 325/325 |
| V44 shell wiring (this doc) | — | 0.2.17 | 334/334 |

V41's per-user-key design never merged on its own: the V43b branch carries
the V41 commits (events, Schnorr, relay client, panel) plus the shared-key
rework, so merging V43b merged V41's work under the new shape.

## Shell wiring (V44)

- **Key generation on creation** (`src/home.mjs`): the create-campaign flow
  passes `key: generateCampaignKey().key` into `createCampaign`. The key
  belongs to the CAMPAIGN, never the user — the app holds it invisibly, the
  invite link carries it. Demo/example rings (seeded elsewhere) get no key
  and are read-only on Nostr. `createCampaign` already accepted `key`
  (V43a); `normalizeCampaign` clones the whole object, so `key` and the
  `nostr` sidecar survive reload (pinned by `tests/v44-integration.test.mjs`).
- **Sync panel** (`app.js`, `index.html`, `style.css`): the Nostr panel mounts
  in a new `#campaign-extras` slot (sibling of `#view`, same pattern as
  `#home-extras` — the campaign page re-renders by overwriting `#view`'s
  innerHTML). `route()` clears the slot on every route change;
  `renderCampaign` re-mounts it. `onMerged` saves the merged list and
  re-renders only the campaign page (`{ sync: false }`) so the panel keeps
  its "Synced. N updates merged." message. Minimal `.nostr-*` styles using
  existing tokens.
- **`onMemberRemoved` seam** (`app.js`): after the page's local removal +
  store sync, the shell republishes the updated membership via
  `publishRemoval` (V43b) with `by: store.me.handle`. Best-effort: a failed
  republish never undoes the local removal; the panel can retry. The invite
  link stays stable — no rotation (spec §17c).
- **Short-link route** (`app.js` `#c=` handler): a `#c=<naddr>[&k=<key>]`
  fragment is fetched from the relays first (`syncCampaign`), the fragment
  key is attached to the merged campaign (the relay never sees it), and the
  result renders. Relays tried: the user's configured list, else the relays
  embedded in the naddr, else the suggested defaults — for this fetch only,
  the panel's opt-in list is NOT auto-configured. When the relays can't be
  reached, the page says so and points at the full campaign link. The
  whole-payload `#c=<base64url JSON>` link is unchanged as the offline
  fallback.
- **Share link** (`src/campaign-page.mjs`, `shareLinkFor` — pure, tested):
  once the ring has been published to relays (`campaign.nostr.createdAt`)
  AND the app holds its key, the share link is the short Nostr pointer;
  before the first publish it is the whole-payload link (also the offline
  fallback). A published-but-keyless (read-only) ring never shares a keyed
  short link. `shareLinkFor` never throws — any failure falls back to the
  payload link.

## Verification

- `npm test`: 334/334 green (9 new V44 tests: key generation + normalize
  retention, share-link choice ×4, naddr round-trip ×3).
- Live-browser check (parent agent — no browser in this lane): load the
  app, open ToonSouls, confirm the 3-post feed + comments render with zero
  console errors; open the Sync panel on a campaign page; click-test the
  relay defaults (`wss://relay.damus.io`, `wss://nos.lol`,
  `wss://relay.nostr.band`); create a campaign and confirm its share link
  is a payload link, then publish and confirm it becomes a short naddr link;
  open a short link in a fresh profile and confirm the ring loads from the
  relays. Run the full official BIP-340 vector list against
  `src/nostr-schnorr.mjs` before release (currently vector 0 + node:crypto
  cross-check only).

## What remains open (not this round)

- Relay click-test + full BIP-340 vectors (above) — pre-release, parent's lane.
- The share link switches to naddr only AFTER the first publish; a ring
  that has never been published still shares the long payload link. That is
  the designed fallback, not a bug.
- APP_VERSION updater race (unruled); Threads click-test or drop; V35
  streaks/roles/badges ruling + AGENTS.md amendment.
- Honest limitation (spec §17c): the removed member still holds the link
  and therefore the campaign key, so they could technically forge a
  membership update re-adding themselves. That forgery is a public relay
  event the ring can see, and the creator can remove again. Removal is
  client-enforced filtering against honest clients, not cryptographic
  revocation.
