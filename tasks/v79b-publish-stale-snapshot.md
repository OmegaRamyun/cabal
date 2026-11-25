# V79b — Publish/Fetch from a stale sync-panel snapshot

- **Status:** done (branch `task/V79b-publish-stale-snapshot`, from main `e62d001`)
- **Scope:** `src/nostr.mjs` only + `tests/v79b-publish-stale-snapshot.test.mjs`. No
  `app.js`, `index.html`, `style.css`, `tasks/INDEX.md`, `version.json`, relay
  hosting/discovery, or merge-by-id contract changes. `mergeSyncedIntoStore`
  untouched.

## Bug mechanism (verified in the merged code before fixing)

`mount()`'s `actionSection()` captured `const camps = activeCampaigns()` once
at render/mount time, and both button handlers closed over that list:

1. A user adds a post/assist after the panel mounted (composer saves to the
   store). Publish still published the stale campaign object — the just-added
   post's kind 78 event was never sent (V79 verifier: only the kind 30078
   doc went out).
2. Worse, `publishCampaign()` returned `results.campaign =
   stampPublished(staleCampaign, out[0])`, the handler passed it to
   `ctx.onMerged`, and `app.js`'s `mergeSyncedIntoStore()` replaced the stored
   campaign wholesale by id — the just-added post was wiped LOCALLY too
   (verifier: local post count 1 -> 0, `Feed (0)`).
3. The Fetch handler seeded its merge base with the same stale `camps` list,
   so fetch+merge could wipe a post added after mount the same way.
4. Reloading the ring page re-mounted the panel fresh, which is why the
   verifier's final run passed — the bug only bites in the natural no-reload
   flow.

**One step further than the brief's sketch, found by verification:** merely
calling `activeCampaigns()` fresh inside the handlers would NOT have fixed
the real app. `activeCampaigns()` returned `[ctx.campaign]` when set — and
`ctx.campaign` is itself a stale snapshot: `app.js` `findCampaign()` returns
the object parsed from localStorage at route time, while the composer saves
new posts as a *new* object via `store.saveCampaigns()`; the route-time
object is never updated. The live state is `ctx.getCampaigns()`
(`store.campaigns` is a getter that re-reads localStorage on every access).
So the fix redefines `activeCampaigns()` to prefer the live store copy of
the panel's ring, falling back to the `ctx.campaign` snapshot only when the
store does not hold that ring (e.g. a static listed campaign). Scope is
unchanged: with `ctx.campaign` set the panel still covers only that ring;
without it, the whole live store list, as before. No `app.js` change needed.

## Fix shape (all in `src/nostr.mjs`)

- `activeCampaigns()` — called fresh on every use (render + each handler);
  prefers the `ctx.getCampaigns()` copy of the panel's ring, snapshot
  fallback only for rings the store does not hold.
- Fetch handler — seeds the merge base from a fresh `activeCampaigns()` read
  at click time, not the mount-time list.
- Publish handler — reads `activeCampaigns()` fresh at click time, then per
  ring:
  - **Mid-publish additions: re-publish pass (chosen shape).** After each
    publish pass it re-reads fresh; while the fresh copy holds covered
    content the pass just published did not send (new exported pure helper
    `hasNewCoveredContent(latest, published, handle)`, honouring the
    handle filter), it publishes again from the fresh copy. Bounded to 3
    passes. Rationale: a re-publish is cheap (publish already re-sends all
    covered events) and keeps the "published" stamp truthful, instead of
    stamping a ring whose newest post never reached a relay. An accepted
    stamp from an earlier pass is kept even if a later pass finds no relay.
  - **Stamp on the freshest copy.** The accepted campaign event's
    `{id, pubkey, created_at}` is re-stamped onto the freshest re-read via
    `stampPublished(latest, …)` before `onMerged` — never the snapshot that
    was published. Anything added after the final pass still survives
    locally (the stamp never overwrites newer local posts) and goes out on
    the next publish.
- `mergeSyncedIntoStore`'s merge-by-id contract unchanged — the fix makes
  sure only fresh copies ever reach it.

## Repro evidence

- Verifier repro: `~/workspace/cabal-bench/ship-verdict-log-v79.md` §5 (runs
  13:24–13:28 UTC, ring `cmp_y5n6git9`): post added -> publish without
  reload -> only kind 30078 sent, local post count 1 -> 0; same for Bob's
  assist (published doc showed `"assists":[]`).
- Regression test `tests/v79b-publish-stale-snapshot.test.mjs` (5 tests,
  fake-DOM mount harness following the `tests/v23-quote-composer.test.mjs`
  pattern; store simulated the app.js way — `ctx.campaign` is a frozen
  route-time snapshot, `getCampaigns()` re-reads the live store):
  - post added after mount -> kind 78 sent + post survives locally + stamp set
  - assist added after mount -> kind 78 assist sent + assist survives locally
  - post added mid-publish -> re-publish pass sends its kind 78 (2 campaign
    events total) + post survives locally
  - fetch after post added -> local post survives fetch+merge, remote post
    merges in
  - `hasNewCoveredContent` unit cases (handle filter respected)
  - Against the pre-fix code the file fails **0/5**; with the fix **5/5**.

## Test run

- `npm test` on this branch: **662 tests, 661 pass, 1 fail** — the single
  failure is the known pre-existing v38 flake
  (`tests/v38-sustained-model.test.mjs`, "latestPost / latestActivity /
  postAssists", random post-ids), not chased.
- `tests/v79b-publish-stale-snapshot.test.mjs` alone: **5/5 pass** with the
  fix; **0/5** against the pre-fix code (verified via `git stash` of
  `src/nostr.mjs` only).
