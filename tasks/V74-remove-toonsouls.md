# V74 — Remove ToonSouls from Cabal

Status: done (branch `task/V74-remove-toonsouls`, unmerged — coordinator merges).

## Decision

Cade's call: the fictional demo game **ToonSouls** (campaign `cmp_toon001`,
Wren Halloway / Moss Finch) is removed from the shipped app. It was the
sole entry in the static listed-campaign list, so removing it means the
shipped static list is now empty — the discover surface, node view, and
format pages all fall back to their existing empty states instead of
showing a demo game.

What was NOT touched, deliberately:

- The opt-in demo — **Starlight Salvage** in `src/demo.mjs` — is a separate
  thing (same first names Wren/Moss, different people) and stays. First-run
  "See a demo ring" still seeds the three Starlight rings.
- No production code changed: `app.js` `loadStaticCampaigns` /
  `findCampaign` / `renderCampaigns` / `renderFormat` are fail-soft on an
  empty list (verified by the passing suite, incl. the empty-input graph
  test in v53 and the empty-feed assertions below).
- `tasks/INDEX.md`, `version.json`, `app.js`, `style.css`, `index.html`
  untouched (coordinator-owned; the `app.js:277` "e.g. ToonSouls" comment
  touch is the coordinator's at merge).

## Changes

- `data/campaigns.json` — campaigns array is now `[]`; the
  `{"version": 1, "updated": "2026-11-24"}` shape is kept so the fetch
  path and the atom generator keep working.
- `campaigns.atom` — regenerated with `node scripts/generate-atom.mjs`:
  **0 entries**, feed `<updated>` is the epoch fallback
  `1970-01-01T00:00:00Z` (per `src/atom.mjs` `buildFeed`, empty-list case).
- Tests rewritten to fixture-based equivalents (no test reads the live
  list for ToonSouls any more):
  - `tests/v24-discovery.test.mjs` — static list asserts empty; mount
    test uses an inline Pixel Orchard fixture instead of
    `staticList.campaigns[0]`.
  - `tests/v38-sustained-model.test.mjs` — the two `cmp_toon001` live-list
    tests replaced with an inline Brass Orchard sustained fixture (same
    x/reddit/instagram shape, assists, latest-post atom assertions); the
    atom test now also asserts the committed feed has no `<entry>` and
    the epoch `<updated>`. The `parsePostUrl` `@toonsouls` assertions
    were left alone (URL-recognition fixtures, not shipped data).
  - `tests/v53-integration.test.mjs` — static-ToonSouls `formatIds`
    test replaced with a fixture-ring assertion; seeded launch-week
    test unchanged.
  - `tests/v56-node-view.test.mjs` — fixture re-based to Starlight-only:
    **4 nodes (3 rings + fmt_algoigno)**; 0-overlap assertions re-run
    on desktop and mobile and pass.
  - `tests/v60-multi-template-integration.test.mjs` — only the
    `describe('V60 static demo data…')` block replaced, with a
    fixture-based two-`runs`-edges test. The inline `cmp_toon001`
    fixture ring (`ringWithPosts`) was kept as-is for the
    `postersForFormat` / format-page-mount tests — it is a test fixture,
    not shipped data.

## Residue note — "not shipped" ≠ "no trace anywhere"

Removing ToonSouls from the shipped list does not erase every trace:

- Old `#c=` links (base64-encoded campaign in the URL) and cached copies
  of `data/campaigns.json` / `campaigns.atom` can still re-import the
  campaign into a local browser — that is the link-import feature working
  as designed, not a leak. Anyone opening such a link gets the old demo
  ring locally; nothing in the shipped app points at it any more.
- `cmp_toon001` / ToonSouls survive as inline fixtures in test files
  (v38 `parsePostUrl`, v39, v41, v43, v44, v47, v48, v52, v57, v60,
  v64) and in git history. Those are test data and history, not the
  product. The `app.js:277` "e.g. ToonSouls" comment is coordinator-owned
  and still present at this writing.
- **V32 stays as history.** The task that introduced the static
  ToonSouls campaign is not rewritten; the record that it existed and
  was removed lives here and in the git log.

## Verification

- `npm test`: 607 tests, 606 pass, 1 fail — the known pre-existing flaky
  failure in `tests/v38-sustained-model.test.mjs` ("latestPost /
  latestActivity / postAssists", random post-ids — the founding post is
  stamped with real now, which after midnight UTC is newer than the
  test's hardcoded `2026-11-25T00:00:00Z` second post; line number moved
  229 → 268 only because the V74 fixture block added lines above it),
  unrelated to this change. Baseline before V74 was 606 tests / 605 pass
  / same 1 fail; the +1 test is the new empty-static-list assertion.
- `node scripts/generate-atom.mjs` → `campaigns.atom: 0 entries`; feed
  parses (well-formed XML, no `<entry>` elements).
