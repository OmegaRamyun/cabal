# V41 — Nostr sync for the sustained ring

Status: claimed (implementation complete, awaiting merge)
Branch: `task/V41-nostr-sync`
Files owned: `src/nostr.mjs`, `src/nostr-schnorr.mjs`, `tests/v41-nostr-sync.test.mjs`, `tasks/V41-nostr-sync.md`
Spec: `cabal-bench/redesign-sustained-ring.md` §16. Cade's ruling (Nov 23): GO NOSTR.
Not wired: the sync panel (`mount`) is mounted into app.js/index.html by the coordinator at V42.

## What shipped
- `nostr.mjs`: bech32/NIP-19 (npub, nsec, naddr), key vault, event builders/decoder/verifier, pure idempotent merge (`applyRelayEvents`), offline snapshot loader, relay list store, vanilla-WebSocket relay client, `syncCampaign`, `publishCampaign`, `mount()` panel.
- `nostr-schnorr.mjs`: vendored BIP-340 Schnorr (~190 lines, BigInt, Jacobian coords).

## Event anchor — validated
- Campaign: kind 30078, d-tag `cabal:<id>`. Correct: 30078 is NIP-78 (app-specific data) and is in the addressable range (the NIP-33 mechanism, now folded into NIP-01). Address = `30078:<pubkey>:cabal:<id>`. Only the signing pubkey can replace it, so **only the campaign author can edit the roster/metadata**. This is a property, not a bug: other members add posts and Enscryptions as their own events.
- Post / Enscryption: kind 1, as specced. Costs, stated honestly: kind 1 is "text note", so a generic Nostr client will show Cabal JSON as gibberish on the author's profile, and an `e` tag makes clients treat the Enscryption as a reply. The key is Cabal-only (§16c), so little real feed is polluted. A custom kind (e.g. 30078 with a d-tag per post) is the cleaner alternative; kept kind 1 per the ruling, revisit if it annoys anyone.
- **Spec deviation (flagged):** every post/assist event also carries `["cabal-post", "<postId>"]` and `["t","cabal"]`. A post that only lives inside the campaign JSON has no event id for the `e` tag to point at, so merge matches Enscryptions by `cabal-post` and uses `e` as a fallback when known.
- Unknown-author fetch: a bare `#c=<campaignId>` can't filter posts (the `a` tag needs the author pubkey). `syncCampaign` fetches the campaign event by d-tag first, learns the author, then fetches posts. An `naddr` in the link (encoder/decoder included) skips that step. V42 should make links carry the naddr.

## Merge rules (all tested)
- Idempotent, dedupes by event id, order-independent (campaigns → posts → assists, sorted).
- A campaign event replaces **metadata only** (game, title, members, window, anchorPost) and only when `created_at` is newer than the stored one. Posts/assists are unioned, never replaced wholesale, so local work is never clobbered.
- Identity binding: a post/assist bound to a pubkey cannot be overwritten by another pubkey (stops handle squatting on synced entries). Entries embedded in a campaign JSON stay unbound (they are the publisher's copy of others' entries) and a member's own signed event binds them later. Honest limit: an unbound entry can be claimed by whoever signs first.
- Relay content is untrusted: shapes are rebuilt field by field, strings capped (note 280), URLs must be http(s), unknown platform → `other`.
- Bookkeeping lives in an additive `nostr: {pubkey,eventId,createdAt}` sidecar on campaign/post/assist; it is stripped before publishing. V38's normalizeCampaign should preserve unknown fields (or pass `opts.normalize`).

## Relay defaults (opt-in)
Nothing is configured, and nothing is published, until the user taps "Use the suggested relays" (so "never configured" is a real state).
- `wss://relay.damus.io` — the best-known, long-running public relay; broad client support.
- `wss://nos.lol` — independent operator, free to write, widely used; diversity from the first.
- ~~`wss://relay.nostr.band`~~ — DROPPED in V47 (timed out twice live, Nov 23 2026). Was: well-known aggregator that indexes many relays, which helps a new ring's events be found.
These are availability judgements from general knowledge, not live-tested here (no network in this lane). Click-test before release; any may rate-limit or drop kind 30078. Users can add/remove. Only `wss://` accepted (plain `ws://` only for localhost).

## Key onboarding flow and exact copy
State machine: none → pending (generated, nsec not confirmed) → ready. Import goes straight to ready. The vault refuses to sign unless ready.
1. Intro: "To sync your ring across devices, Cabal makes you a key. It is just for Cabal, and it is made right here in your browser." Buttons: "Make my key", or paste field "Already have a Cabal key? Paste it here to restore it." → "Restore key". A bad nsec: "That doesn't look like a valid nsec. It should start with nsec1."
2. Show-once: "This is your secret key. It is shown once. Copy it somewhere safe now — a password manager is ideal." + the nsec.
3. Warning: "If you lose this key, you lose this identity. There is no recovery, no password reset, and nobody to ask. Anyone who has it can post as you."
4. Checkbox "I have saved my secret key somewhere safe." gates "Continue". Reveal is one-shot: after confirm `revealOnce()` returns null.
5. Ready: shows `Identity: npub1…` and "A key belongs to one browser. A second browser is a second identity unless you paste the same key there."
Panel privacy line: "Anything on a public relay is public, and it can't be reliably deleted."
Caveat: pending state survives a reload (nsec still revealable until confirmed), the only window in which it re-shows. Storage: `cabal.v2.nostr.key` = `{sk, confirmed, createdAt}`; the sk is never in a URL, link payload, event, log or relay message (tests assert it).

## Signing choice
Vendored BIP-340 in `src/nostr-schnorr.mjs`; no npm dependency. Chosen over NIP-07 because a non-technical indie dev has no signer extension, and the spec wants a dedicated in-browser Cabal key.
Trust implications:
- The key lives in localStorage, so any script running on the origin (XSS, a compromised future dependency) can read it. Blast radius: one Cabal-only identity, not a general Nostr one. The app has no runtime deps and no third-party scripts.
- Own implementation, not an audited library: assurance rests on BIP-340 test vector 0 (exact signature match) + pubkey derivation cross-checked against `node:crypto` secp256k1 + sign/verify round-trip + tamper tests. Only vector 0 is in the suite; run the full official CSV before shipping if you want more. BigInt math is not constant-time (fine for a user signing their own events in their own tab; do not reuse server-side).
- NIP-07 remains a possible future opt-in for users who have an extension.

## Alternatives rejected
- **Worker + D1 backend** — rejected by Cade's ruling (a backend to operate); not an option.
- Link-merge as the primary sync — frozen payloads, no living ring; kept only as the offline fallback (`loadSnapshot`).
- NIP-07 only — most users have no extension.
- npm Schnorr dependency (noble-curves) — violates no-runtime-npm-deps.
- Sending posts to relays automatically — publish is user-initiated ("Publish my ring"); nothing auto-posts.

## Relay client
Vanilla WebSocket, publish to all, REQ on all, dedupe by id, every inbound event signature-verified before use. Status per relay: connecting / connected / unreachable; summary adds "Never configured". A down relay yields `unreachable`, never an exception; `syncCampaign` returns local state untouched on failure. No auto-reconnect loop (a manual "Fetch updates" button re-tries).

## Open / for the coordinator (V42)
- Wire `mount(el, {getCampaigns, me:{handle}, onMerged(list)})`; persist `onMerged` output through store.mjs and pass V38's `normalizeCampaign` as `opts.normalize` if desired. Panel needs CSS (classes `nostr-*`); I did not touch style.css.
- No deletion UI exists, deliberately (relays can't reliably delete); if added, say so.
- Manual check: DOM panel not exercised by tests (no DOM in node). Click through: Make my key → confirm gate → add relay → Fetch/Publish against a real relay. Verify the three default relays live.
- Threads: nothing Threads-specific in this lane.
