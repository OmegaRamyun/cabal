# V31 — Atom discovery feed (`campaigns.atom`)

Cade, 2026-11-23 ~00:11: "Try atom." Claude's recommendation from the
two-model critique: a `campaigns.atom` discovery feed generated from
`data/campaigns.json`, near-zero cost. Cade, 2026-11-23 ~00:12: "Stay
serverless." — the feed is a committed static file; no backend involved.
The sync fork is ruled serverless too (merge-on-open + share-back claims,
not the Worker + D1 backend).

## Scope

- `src/atom.mjs` — pure functions: `escXml`, `campaignToEntry`,
  `buildFeed`. One entry per listable campaign: stable tag-URI id, title,
  `createdAt`, alternate link = the `#c=` join link, related link = the
  game page (Steam first, else itch), author = anchor author, summary =
  game + tags + anchor text + posted count + window. Demo campaigns are
  labeled "Example campaign — fictional data." in the summary.
- `scripts/generate-atom.mjs` — run after any edit to
  `data/campaigns.json`: `node scripts/generate-atom.mjs`. Filters with
  `discovery.isListable` (same rule as Discover: real game page + >= 2
  members) and writes `campaigns.atom` at the repo root.
- `campaigns.atom` — the generated feed, committed. One entry today
  (Brass Orchard, the fictional example).
- `index.html` — `<link rel="alternate" type="application/atom+xml">`
  in `<head>` so readers can discover the feed.

## Files owned

`src/atom.mjs`, `scripts/generate-atom.mjs`, `campaigns.atom`,
`tests/v31-atom.test.mjs`, `tasks/V31-atom.md`, `index.html`,
`version.json` (patch bump on merge per AGENTS.md).

## Acceptance

- `npm test` green (`buildFeed` / `campaignToEntry` / `escXml` covered
  in `tests/v31-atom.test.mjs`).
- `campaigns.atom` parses as well-formed XML with the Atom namespace,
  one entry, and the join link intact (checked with Python's xml parser).
- Live check after merge: `curl` the feed from Pages, confirm the
  `<link rel="alternate">` is in the live `index.html`.

## Open

- The APP_VERSION updater fix (bake the version into the JS) is still
  undecided — it was offered, Cade has not ruled. It does not ride this
  merge.
