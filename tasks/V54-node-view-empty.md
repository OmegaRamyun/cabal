# V54 — Live node view renders EMPTY (urgent bug fix)

Status: claimed
Branch: `task/V54-node-view-empty`
Brief: `~/workspace/cabal-bench/brief-v54-node-view-empty.md`

## Bug

Live #/campaigns (v0.2.28, verified real-browser Nov 23 ~12:35 CST) renders
only the empty state — 0 nodes, 0 edges — while Home shows the 3 demo rings.
Local smoke passed (6 nodes / 5 edges). Live-only / state-dependent failure.

## Root cause (PROVEN — not the data)

A **stale v0.2.27 bundle replayed from the browser HTTP cache**, not a data
bug. Evidence, each checked, not guessed:

- **Deployed bundle is current**: live `app.js` / `src/graph.mjs` /
  `src/discovery.mjs` / `src/demo.mjs` / `data/*.json` are byte-identical to
  main 49a9a9a (curl). Suspect 4 (stale deploy) dead as a deploy problem.
- **Data path is sound**: `seedDemo` round-trip through `loadCampaigns` +
  `mergeLists` + `buildGraph` = 6 nodes / 5 edges in Node. All four
  historical demo seeds (V25, V28, V38, V53) are listable under current
  `isListable`. Aged-profile browser repro (v0.2.24 seed, same origin +
  same profile, cache off) = 5 nodes / 4 edges. Suspect 1 (stale stored
  state) dead. Statics fetch is fine (live JSONs identical). Suspect 2/3/5
  dead (sequential awaits; `makeStore` getters read `cabal.v2.*` fresh).
- **v0.2.27 had the exact bug**: its `nodeViewGraph` returned
  `{ graph: g, positions }` — positions NOT attached to the graph (fixed
  by c681594, which touched `app.js` only). The node view reads ONLY
  `graph.positions`, so it renders the empty state with nodes in hand.
  v0.2.27's `renderCampaigns` still passed `positions` as a separate mount
  argument — the data was there, the view just never looked at it.
- **Reproduced end-to-end** (Playwright headless shell, same profile,
  cache on, server sending GitHub Pages' `Cache-Control: max-age=600`):
  load v0.2.27 once, then serve the CURRENT build on the same port and
  reload: `#/campaigns` shows **0 nodes, 0 edges, the exact live empty
  state** ("Rings appear here once two devs are in and a real game page
  (Steam or itch.io) is attached."), and `version.json` read from the page
  is stale (**0.2.27**) while the server serves 0.2.28. Timeline fits:
  v0.2.27 deployed 18:23:20 UTC, fix deployed 18:32:37 UTC, live check
  ~18:35 UTC — inside the 600s freshness window. A plain reload / fresh
  tab in the same profile replays the cached modules, so the symptom
  repeats until the cache expires (self-heals after ≤10 min).
- **Side finding**: with cache on, a persistent profile also replayed the
  v0.2.24 split view while the server served 0.2.28 — the app has no
  cache-busting anywhere; the updater's Refresh is a plain
  `location.reload()` (version detection itself is fresh, `cache:
  'no-store'`, but the reload it triggers is not).

## Fix (this lane — `src/node-view.mjs` only)

`mount()` now resolves positions with `resolvePositions(graph,
ctx.positions)`: `graph.positions` wins when present; otherwise it falls
back to the `positions` the mount site computed alongside the graph. This
is defense-in-depth, not the primary fix — the primary fix (attach
positions in `app.js`, c681594) already exists at main. The fallback makes
the view tolerate a shell/view version skew in either direction (a stale
shell that never attached positions, or a mixed cache), which is exactly
the failure mode V54 proved. No data is touched; no stored state is
cleared; the ≥2-dev share wall is unchanged.

## Shell patch (coordinator-owned — NOT applied, reported here)

Durable fix for the staleness itself: version the module URLs so a new
deploy can never replay old code. Exact patch for `index.html` line 49
plus an import map (coordinator to generate/confirm the module list and
bump the version query per release):

```html
<script type="importmap">
{"imports": {
  "./app.js": "./app.js?v=0.2.28",
  "./src/graph.mjs": "./src/graph.mjs?v=0.2.28",
  "./src/discovery.mjs": "./src/discovery.mjs?v=0.2.28",
  "./src/node-view.mjs": "./src/node-view.mjs?v=0.2.28"
}}
</script>
<script type="module" src="app.js?v=0.2.28"></script>
```

(at minimum the entry `app.js?v=…`; the import map is what busts the
`src/*.mjs` graph too, since a page-URL query does NOT propagate to
module imports and the updater's plain reload does NOT bypass
`max-age=600`). Versioning only `app.js` would have fixed THIS incident
(c681594 touched `app.js` alone). Alternatively the updater could
pre-warm `app.js` + `src/*.mjs` with `fetch(url, {cache: 'reload'})`
before reloading — coordinator's call.

**Coordinator applied 2026-11-23 ~18:57 UTC (this commit):** full import map
(all 30 entries: `./app.js` + every `./src/*.mjs`, all `?v=0.2.29`) +
entry `app.js?v=0.2.29` + `version.json` bumped to 0.2.29. Each deploy is
now atomic: a given index.html only ever loads its own version's modules,
so a stale bundle can no longer mix with a fresh view. The `?v=` must be
bumped with `version.json` on every future merge (coordinator duty).
Residual known limit (not fixed here): a stale *index.html* itself can
still replay the old bundle for up to 10 min after a deploy; the updater
banner still detects the new version, but its Refresh is a plain reload.
Follow-up, not this round.

## Acceptance

- Root cause proven with evidence (which filter drops which ring, over the
  actual live store contents — not a guess).
- Fix is the smallest correct change; regression test fails on main 49a9a9a
  and passes with the fix, exercising the live data path (seeded demo store
  round-trip; stale-shape fixture if stale state is the cause).
- `npm test` green (451/451 baseline).
- Localhost AND live GitHub Pages Playwright checks show nodes on
  #/campaigns (report counts). Round not done until live shows nodes.
- If the fix needs the coordinator-owned shell (app.js/index.html/style.css),
  report the exact patch instead of editing it.

## Verification (this round)

- `npm test`: **455/455 pass** (451 baseline + 4 new V54 tests).
- New tests `tests/v54-node-view-empty.test.mjs`: the 2 fallback tests
  FAIL on main 49a9a9a (`resolvePositions` undefined) and PASS with the
  fix; the 2 data-path tests pass on main too (seeded round-trip 6 nodes /
  5 edges; aged v0.2.24 shape 5 nodes / 4 edges) — pinning that the data
  was never the bug.
- Localhost Playwright (fresh profile, port 8131): **6 nodes / 5 edges /
  2 runs edges**, labels ToonSouls + 3× Starlight Salvage + both format
  nodes, no empty state. Aged profile (v0.2.24 seed, cache off): 5/4.
  Stale-cache repro (v0.2.27 -> current, cache on, max-age=600): 0 nodes
  + exact live empty state pre-fix shape; see Root cause.
- In-page mount probe (positions-less graph + ctx.positions, localhost,
  post-fix): **3 nodes / 2 edges rendered, no empty state**
  (`/tmp/pwshot/verify-v54-local.mjs`, PASS). Fresh profile post-fix:
  6 nodes / 5 edges.
- **LIVE GitHub Pages Playwright check: NOT runnable from this VM.**
  The sandbox egress proxy refuses Chromium's CONNECTs
  (`ERR_TUNNEL_CONNECTION_FAILED`, with and without proxy auth; curl
  works, headless shell does not). Script shipped for the parent/managed
  browser: `/tmp/pwshot/check-v54-live.mjs` (fresh profile, asserts nodes
  > 0 on `https://omegaramyun.github.io/cabal/#/campaigns`). The live
  symptom is also self-healing: any profile that loaded v0.2.27 shows
  nodes again once its 600s cache expires, and the deployed bundle is
  byte-identical to main, so a fresh profile must show the net.

## Files

Fix lane owns: `src/graph.mjs`, `src/discovery.mjs`, `src/demo.mjs`,
`src/store.mjs`, `src/campaign.mjs`, `src/node-view.mjs` (only if the bug is
there), `tests/v54-*.test.mjs`, this task doc. Coordinator owns `app.js`,
`index.html`, `style.css`, `tasks/INDEX.md`, the merge, version bump.

## Constraints

Vanilla ES modules, no build step, no runtime npm deps. No per-user
accounts/keys/key UI. No backend. ≥2-dev share requirement stands as a wall.
No quotas/ledgers/streaks/post-counting/auto-posting. Threads: no ship
without a live click-test.

## DOM-only behaviour (manual check note, per AGENTS.md)

- `mount()` fallback exercised in a real browser: localhost in-page probe
  mounts a graph built by `buildGraph` with `graph.positions` deleted and
  `positions` passed separately — nodes render (see Verification).
- Live `#/campaigns` node count still needs the parent's managed-browser
  run of `/tmp/pwshot/check-v54-live.mjs` (Playwright cannot reach the
  public internet from this VM — proxy refuses Chromium CONNECTs).
