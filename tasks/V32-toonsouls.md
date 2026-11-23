# V32 — ToonSouls example campaign (for the bit)

Cade, 2026-11-23 ~00:15: "Make it ToonSouls for the bit."

## Scope

- `data/campaigns.json`: the one fictional example campaign becomes
  ToonSouls — a cartoon souls-like about dying cute and coming back
  cuter. Same shape as Brass Orchard (demo: true, same people, same
  dates, same window): Wren Halloway @toonsouls posted, Moss Finch
  pending; tags [souls-like, cartoon]; placeholder game pages.
- `campaigns.atom` regenerated from the list
  (`node scripts/generate-atom.mjs`).
- Test fixtures keep Brass Orchard (they test the modules, not the live
  list); the V24 task doc keeps it too (historical spec). The v24
  discovery tests DO read the live list, so their assertions were updated
  to ToonSouls (name, tags, updated date, navigated id) — the assertions
  encode the example's identity, which is exactly what changed.

## Files owned

`data/campaigns.json`, `campaigns.atom`, `tasks/V32-toonsouls.md`,
`version.json` (patch bump on merge per AGENTS.md).

## Acceptance

- `npm test` green (no test reads the live list).
- `campaigns.atom` parses, one entry, ToonSouls, join link round-trips
  to `cmp_toon001`.
- Live check after merge: `curl` the feed from Pages.
