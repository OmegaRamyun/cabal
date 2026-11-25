# V79 — Nostr protocol correctness: NIP-42 AUTH + drop kind 1

Date: 2026-11-25. Cade's order (07:06 CST): "Fix the app design so it works
as intended and change from Kind 1 to something more used as intended? I'm
okay with changing to require Auth."
Brief: `~/workspace/cabal-bench/nostr-auth-kind-migration-brief-2026-11-25.md`.
Branch: `task/V79-nostr-auth-kind-migration` (from main 8d4ca81, v0.2.46).
Status: implemented, `npm test` 656/657 (1 known pre-existing v38 flake, see
below). NOT merged — coordinator merges. Live round-trip NOT done here (no
live browser in this agent; brief §Verification live checks are for the
coordinator).

## Kind choice: 78, not a custom kind, not 30078-docs

Posts/assists move from kind 1 to **kind 78**. Campaign doc stays kind
30078. NIP-78 (current text, verified 2026-11-25):

> kind 78 is the normal event "for when the app needs to store and query
> multiple events of the same type. Apps should use some unique tag (even a
> `d` tag) for grouping these events together."

Cabal's posts/assists are exactly that shape: many events of one type per
campaign, grouped by the `a` tag (campaign address) + `cabal-post` tag.
Kind 1 was the social-note kind carrying JSON blobs — off-label. The 30078
addressable-docs fallback (brief §3) was NOT needed: kind 78 works in the
builders, filters, decode, and merge with no change to tags, content shape,
or signatures. No custom dedicated kind was invented.

NIP-78 AUTH section (same verified text):

> "relays SHOULD require clients to perform the NIP-42 `AUTH` flow before
> accepting or serving `kind 78` and `kind 30078` events, and SHOULD only
> serve these events to the authenticated owner, i.e. the client must
> authenticate with the same pubkey as the event author."

The "owner" is the campaign keypair, which every ring member already holds.

## What changed

- `src/nostr.mjs`
  - `KIND_APP_RECORD = 78` (new). `postEvent()` / `encryptionEvent()` build
    kind 78 with the same tags (`a` -> campaign address, `cabal-post`,
    `e` -> post event id where applicable, `t` cabal + format tags), same
    JSON content shape, same campaign-key signatures.
  - `KIND_LEGACY_NOTE = 1` (new, decode-only, commented). `KIND_NOTE` is
    REMOVED — nothing may alias kind 1 for construction anymore.
  - `KIND_AUTH = 22242` (new).
  - `decodeEvent()` accepts kind 78 AND legacy kind 1 post/assist events.
  - `filtersForCampaign()` queries kinds `[30078, 78]`, not `[30078, 1]`.
  - NIP-42 AUTH in `createRelayClient()` (see below).
  - `syncCampaign()` / `publishCampaign()` / `publishRemoval()` /
    `publishAdoption()` pass the campaign key as per-op `auth`; `mount()`'s
    `clientFor()` also constructs the panel client with the active writable
    campaign's key, so Fetch/Publish authenticate whenever the ring has one.
- `src/popularity.mjs` (extension of the brief's file list, required, not
  optional): it imported `KIND_NOTE` and queried/counted kind 1 only. Left
  alone, template popularity would have gone to zero for all new events.
  It now counts kind 78 assists AND legacy kind 1 assists (back-compat),
  and `filtersForFormat()` queries kinds `[78, 1, 30078]`.
- Tests: new `tests/v79-nostr-auth-kind-migration.test.mjs` (12 tests);
  kind-1 pins updated in `tests/v41-nostr-sync.test.mjs` (publish filter
  `1` -> `78`), `tests/v46-popularity.test.mjs` (fixtures to 78 + a legacy
  kind 1 counting fixture + filter expectations), `tests/v48-integration.test.mjs`
  (test name + comment). No changes needed in v43 (removal tests use the
  builders, no kind pins), v51/v52/v53/v57/v60/v35/v38 (their "kind" is
  graph/format kind, not Nostr kinds). `tests/v76-sync-truth.test.mjs:124`
  keeps a dummy `kind: 1` event as a dead-relay payload — the kind value is
  irrelevant to that test; left alone deliberately.

## AUTH flow shape (NIP-42, as implemented)

- Relay sends `["AUTH", "<challenge-string>"]`, usually on connect.
  Client replies `["AUTH", <signed-event>]` where the event is kind 22242,
  ephemeral, tags `["relay", "<relay-url>"]` + `["challenge",
  "<challenge-string>"]`, `created_at` = now, signed with the campaign key.
  Relay answers with an OK message for the AUTH event id.
- `createRelayClient({ auth })` accepts the credential two ways (same
  result; `normalizeAuth` throws loud on any other shape):
  - a 64-char hex secret key (the campaign key) — the client signs kind
    22242 itself via exported `authEvent(relayUrl, challenge, secretKey)`;
  - a signer function `(relayUrl, challenge) => signed kind 22242 event`
    (sync or async) — for callers that hold the key elsewhere.
- `publish(ev, { auth })` / `fetch(filters, { auth, waitMs })` accept a
  per-op `auth` override; it wins over the construction-time credential.
  This is the seam `app.js` clients rely on: `app.js` is coordinator-owned
  and was NOT touched, so its clients are built without `auth` — the
  per-op key passed by `syncCampaign`/`publishCampaign`/`publishRemoval`/
  `publishAdoption` is what authenticates them.
- On connect the client answers a challenge immediately (background,
  memoized per connection+credential — one AUTH event per connection).
  Before an op it authenticates first when a challenge is already known;
  when no challenge has arrived it sends the op anyway (no added delay on
  relays that never ask — nos.lol currently doesn't) and relies on the
  retry: an OK / CLOSED carrying the `"auth-required: "` prefix triggers
  exactly one authenticate + one retry of the failed op.
- Unauthenticated read-only fetch stays as-is (best effort): no key, no
  AUTH attempt. The campaign key never appears on the wire outside a
  signature and is never logged or shown in UI copy.
- Exposed on the client: `authenticate(url)` (authenticates one connection
  with the construction-time credential; false when no auth / no challenge
  / unreachable). No `isAuthenticated()` — not needed.
- UI copy: unchanged. AUTH is invisible when the relay doesn't ask, and the
  membership line ("write access via invite link") already describes the
  credential honestly; no "signed in as the ring" line was added because it
  would overclaim on relays that never challenge. If a relay starts
  challenging, the behaviour (not the copy) is what changes.

## Back-compat

- READ: `decodeEvent` + `applyRelayEvents` accept legacy kind 1
  post/assist events exactly like kind 78 ones, and `countFormatUsage`
  still counts them. Rings published on nos.lol before this round are not
  stranded.
- FETCH: `filtersForCampaign` queries only `[30078, 78]` per the brief —
  legacy kind 1 events are not re-queried. This does not strand legacy
  rings in practice: the campaign doc (kind 30078) carries the full posts
  array, so a legacy ring is recovered from its campaign event alone.
- WRITE: publish ONLY kinds 30078/78. No code path constructs kind 1.

## Grep proof — zero kind-1 construction (run on the branch)

```
$ grep -rn "kind: 1\b" src/            # NONE
$ grep -rn "KIND_NOTE" src/ tests/     # NONE (export removed)
$ grep -n "kind: KIND" src/nostr.mjs
384:    kind: KIND_CAMPAIGN,
420:    kind: KIND_APP_RECORD,
443:    kind: KIND_APP_RECORD, created_at: createdAt ?? nowSec(), tags,
752:    kind: KIND_AUTH,
$ grep -n "KIND_LEGACY_NOTE" src/nostr.mjs src/popularity.mjs
nostr.mjs:32:  export const KIND_LEGACY_NOTE = 1;        # constant only
nostr.mjs:465: if (ev.kind === KIND_APP_RECORD || ev.kind === KIND_LEGACY_NOTE) {   # decodeEvent
popularity.mjs:136: } else if (ev.kind === KIND_APP_RECORD || ev.kind === KIND_LEGACY_NOTE) {  # counting
popularity.mjs:218: kinds: [KIND_APP_RECORD, KIND_LEGACY_NOTE, KIND_CAMPAIGN],                 # read-only filter
```

Remaining `kind: 1` literals in tests are intentional fixtures only:
`tests/v46-popularity.test.mjs:121` (legacy assist still counts),
`:155` (legacy malformed event still ignored),
`tests/v76-sync-truth.test.mjs:124` (dummy dead-relay payload, kind
irrelevant), `tests/v79-...:111,116` (legacy decode fixtures). No
production code constructs a kind 1 event.

## Verification

- `npm test` (branch `task/V79-nostr-auth-kind-migration`): **657 tests,
  656 pass, 1 fail** — the single failure is the known pre-existing v38
  flake `tests/v38-sustained-model.test.mjs` "latestPost / latestActivity /
  postAssists" (random post-ids). Verified pre-existing, NOT caused here:
  it fails identically (3/3 runs) on clean main 8d4ca81 in a detached
  worktree (temp worktree removed afterwards). Not chased, per the brief.
- New `tests/v79-nostr-auth-kind-migration.test.mjs`: 12/12 pass,
  covering kind-78 builders (tags/content parity), filters `[30078, 78]`,
  kind 78 + legacy kind 1 decode + legacy merge, AUTH event shape (kind
  22242, relay+challenge tags, `verifyEvent` true), challenge-on-connect
  publish, publish retry after `"auth-required: "` OK, fetch retry after
  `"auth-required: "` CLOSED, signer-function seam + miswired-auth throws,
  `syncCampaign` per-op fetch auth (client built WITHOUT auth) + read-only
  fetch sending no AUTH, and zero kind 1 across
  publishCampaign/publishRemoval/publishAdoption.
- NOT done here (needs a live browser, out of this agent's reach): the
  brief's live round-trip on nos.lol (Alice creates, Bob joins, Bob
  assists, Alice sees it; confirm published events are kinds 30078/78 and
  ZERO kind 1; confirm AUTH actually happens on publish or record honestly
  that the relay never asked and AUTH is dormant-but-implemented).

## Notes / deviations

- Branch setup: `main` is checked out in the `cabal-wt-merge` worktree, so
  `git checkout main` in this repo was refused; the branch was cut
  directly from main tip 8d4ca81 (`git checkout -b
  task/V79-nostr-auth-kind-migration 8d4ca81`). The coordinator's V79
  claim row in `tasks/INDEX.md` (uncommitted when dispatched) conflicted
  on the move; resolved by taking main's INDEX.md and re-applying the
  coordinator's row verbatim after the V65i row. No other INDEX.md edit.
- `src/popularity.mjs` changed (see above) — outside the brief's "IN"
  list but forced by the KIND_NOTE removal; flagged here, not silent.
- `app.js` untouched (coordinator-owned): its relay clients get AUTH via
  the per-op seam, verified by the syncCampaign test using a client built
  without `auth`.
- `version.json` NOT bumped (coordinator owns the bump on merge, per
  AGENTS.md).
