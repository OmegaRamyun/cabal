# V43b — Nostr rework: shared campaign keypair + removal

Status: claimed
Branch: `task/V43b-nostr-shared-key`
Files owned: `src/nostr.mjs`, `src/nostr-schnorr.mjs`, `tests/v41-nostr-sync.test.mjs`, `tests/v43-nostr-removal.test.mjs`, `tasks/V43b-nostr-shared-key.md`
Spec: `cabal-bench/redesign-sustained-ring.md` §16, §17.

## Cade's ruling — the roundabout (stated plainly)

A per-user keypair IS an account with extra steps — persistent identity, key management, lose-your-key-lose-yourself — and it breaks Cabal's founding rule: no accounts, no servers. V41 as first built (per-user key generation, `createKeyVault`, `cabal.v2.nostr.key`, `nsec` show-once reveal, import path, onboarding copy) is **SUPERSEDED** and deleted.

The roundabout: the keypair belongs to the **campaign**, never the user. It is generated at campaign creation, carried by the invite link (URL fragment only), and held invisibly by the app inside the stored campaign object in localStorage. The user never creates a key, never sees a key, never manages a key. The relay sees the campaign's key, never a person's. Members inside the app are self-chosen display handles.

**The relay is what makes removal cheap, and that is the reason Nostr earns its place.** With the relay holding shared campaign state, creator removal is a relay-published membership update (kind 30078 republish) — the invite link stays unchanged, with no link rotation and no re-sharing to the rest of the ring.

## What shipped

- `src/nostr.mjs` (reworked):
  - Deleted per-user vault (`createKeyVault`, `STORAGE_KEYS.key`), `generateKeypair`, `importKey`, `nsecEncode`/`nsecDecode`, and all per-user key onboarding copy and UI.
  - Added campaign keypair helpers: `generateCampaignKey()`, `campaignKeypair(campaign)`, `hasCampaignKey(campaign)`, `isValidCampaignKey(key)`, `campaignPubkey(campaign)`, plus fragment-only link helpers `campaignLinkFragment(campaign, relays)` and `parseCampaignLinkFragment(input)`.
  - Reworked event builders (`campaignEvent`, `removalEvent`, `postEvent`, `encryptionEvent`) to strip both `key` and `nostr` before serialization; all events are signed with the campaign's shared key; member identity is the display handle in event content.
  - Reworked `applyRelayEvents` for the shared campaign key + §17c removal enforcement: verifies every event against the campaign's pubkey, never overwrites or adopts `campaign.key` from relay events, applies newer `createdBy`/`removedMembers` metadata, drops future posts/assists from handles in `removedMembers` with `created_at > removedAt`, keeps past content (`<= removedAt`), prunes out-of-order future writes on removal arrival so merge remains order-independent, and ignores stale membership updates.
  - Added `publishRemoval(client, campaign, opts)` and updated `publishCampaign(client, campaign, opts)` to sign directly with `campaign.key` (no vault).
  - Reworked `mount(rootEl, ctx)` into a clean sync panel (privacy statement, relay status + relay list, ring membership & write-access state, Fetch/Publish actions) with zero key UI and zero onboarding.
- `src/nostr-schnorr.mjs`: kept as-is (vendored BIP-340 Schnorr, no npm dependencies).
- `tests/v41-nostr-sync.test.mjs`: replaced per-user key/vault tests with campaign-key tests (key stripping, fragment-only URL, signing/verifying with campaign key, merge never overwrites local key).
- `tests/v43-nostr-removal.test.mjs`: removal event round-trip via fake WebSocket relay client, future writes from removed handles dropped, past writes kept, order-independence, stale membership update ignored, `publishRemoval` guards.

## Key storage seam with V43a

- `campaign.key` is an opaque 64-character lowercase hex secp256k1 secret key stored directly on the campaign object in `cabal.v2.campaigns` (localStorage). It is never shown in any UI element.
- Campaign creation: pass `key: generateCampaignKey().key` into V43a's `createCampaign({ ..., key })`.
- Joining via invite link: the invite link carries the key in the URL fragment (`#c=<naddr>&k=<key>` or snapshot fragment), never in a query param; the decoded `key` is saved onto `campaign.key`.
- Discovery / read-only rings: `campaign.key` is absent (`hasCampaignKey(campaign) === false`); the client syncs read-only via `campaign.nostr.pubkey` (or `naddr`).
- Upgrading a pre-Nostr local campaign with no `key`: `campaignKeypair(campaign)` derives `{ key, pubkey }` when `campaign.key` is valid, or generates a fresh `{ key, pubkey }` when missing without mutating `campaign` (the caller persists `key` if desired).

## Removal model & honest limitation (§17c)

- Removal is published as a kind 30078 campaign event republish (`removalEvent` / `publishRemoval`) with `created_at` strictly greater than the previous `campaign.nostr.createdAt`, carrying the updated `members` and `removedMembers` arrays and **no `key`**.
- Enforcement is client-side: `applyRelayEvents` rejects kind 1 posts and Enscryptions from handles in `removedMembers` (case-insensitive) when `ev.created_at * 1000 > Date.parse(entry.removedAt)`. Past content (`<= removedAt`) stays visible as history.
- **Honest limitation (stated plainly):** a removed member still holds the invite link and therefore the campaign key, so they could technically forge a kind 30078 membership update re-adding themselves. That forgery is a public relay event the ring can see, and the creator can remove again. Removal is client-enforced filtering against honest clients, not cryptographic revocation — the design trades strong revocation for no accounts and stable invite links.

## Relay defaults (click-test before release)

Kept from V41 (opt-in via "Use the suggested relays"; stored in `cabal.v2.relays`):
- `wss://relay.damus.io`
- `wss://nos.lol`
- `wss://relay.nostr.band`

These defaults were chosen from general knowledge and are **untested live** (no network in this lane). Click-test all three against real browsers before release; any may rate-limit or drop kind 30078. Only `wss://` is accepted (plain `ws://` allowed only for `localhost`/`127.0.0.1`).

## Signing note

`src/nostr-schnorr.mjs` is kept untouched: vendored BIP-340 Schnorr over secp256k1 using BigInt + Jacobian coordinates + WebCrypto SHA-256 + `crypto.getRandomValues` (zero runtime npm dependencies).
- Tested against official BIP-340 vector 0 (exact signature match), `node:crypto` secp256k1 pubkey cross-check, and sign/verify tamper tests.
- Only vector 0 is in the test suite; run the full official BIP-340 vector CSV before release.
- BigInt arithmetic is not constant-time (acceptable for browser-side campaign signing; do not reuse on a server).

## Alternatives considered and rejected

- **Per-user Nostr keys (V41's first design):** SUPERSEDED by Cade's ruling — a per-user keypair is an account with extra steps and violates "no accounts, no servers".
- **Worker + D1 backend:** REJECTED — introduces a server/database to operate.
- **NIP-07 browser extension signing:** REJECTED — leaves most indie devs with no way to sign and reintroduces per-user identity.
- **Link rotation on creator removal:** SUPERSEDED by §17a — Nostr relays make removal cheap via a membership update without breaking or re-sharing the invite link.

## Manual check note (DOM)

`mount(rootEl, ctx)` is DOM-only and not executed in Node tests. At coordinator integration (wiring `mount` into `app.js`/`index.html` and styling `.nostr-*` in `style.css`), manually verify:
1. Panel renders privacy line, relay status/list, ring membership/write-access state, and Fetch/Publish buttons with **no** key generation, **no** nsec display, and **no** onboarding prompts.
2. Adding/removing relays and clicking "Use the suggested relays" updates `cabal.v2.relays`.
3. Fetch updates and Publish my ring work against the three live default relays (click-test).
4. Threads: nothing Threads-specific in this lane.
