# V45 — Rings / Campaigns split: data model + views

Status: claimed
Branch: `task/V45-rings-campaigns-split`
Files owned: `src/campaign-formats.mjs`, `data/formats.json`, `src/home.mjs`, `src/discovery.mjs`, `src/intro.mjs`, `tests/v45-split.test.mjs`, `tasks/V45-rings-campaigns-split.md`

## What changed
- **Format model** (`src/campaign-formats.mjs`): `createFormat`, `validateFormat` (returns error list), `normalizeFormat` (never throws), `formatIdForRing`, `ringsRunningFormat`, `formatsForDiscovery`, `usageLabel`, `mount()` for the format detail view. Not Stage 1's `templates.mjs` shape; that file is untouched.
- **Seed data** (`data/formats.json`): three `demo: true` formats (flagship "MY GAME IS GOOD THE ALGORITHM JUST IGNORES ME", weekly devlog, one-clip). Guidance only, no ready-to-paste captions. Ids are hand-picked valid `fmt_` + 8 chars.
- **Home = My Rings** (`src/home.mjs`): heading "Your rings" -> "My Rings", a one-line framing, a link to `#/campaigns`, empty text "No rings yet." The create flow is unchanged.
- **Discovery = Campaigns** (`src/discovery.mjs`): when `ctx.formats` is passed, a "Campaigns" section lists formats via `formatsForDiscovery`. Without `ctx.formats` the old Similar/Popular view renders exactly as before (those ring sections stay below as rings you could join).
- **Intro**: one new section "Rings and Campaigns" on the What page.

## Ordering and usage
`ctx.sortByUsage` is the V46 shape (Map id -> distinct-ring count; pair arrays and plain objects also accepted). With it: most-used first, member-count tiebreak, then id, and rows show "used by N rings". Without it (the state until V46 lands): member-count order, where a format's member count is the total members of the locally known rings running it (`ctx.rings`); with no rings either, id order. No usage text is ever shown without real usage data. Usage is a public aggregate about the template, never a score for a person.

## Notes for V48 (integration)
- Routes to wire: `#/rings` (home mount), `#/campaigns` (discovery mount with `formats` from `data/formats.json`, `sortByUsage`, `rings`, `navigateFormat`), `#/format/<id>` (`campaign-formats.mount` with `formats` + `formatId` + `rings`).
- **Preselected-format creation is NOT supported.** The create flow (`home.mjs` `renderCreate`) takes no format and `createCampaign` does not set `formatId`. The format page's "Start a ring" is a plain link (`ctx.startHref`, default `#/rings`). To finish: carry the format id into the home mount (e.g. `ctx.formatId` opens the create view), and set `campaign.formatId` after `createCampaign`. Check that `normalizeCampaign` keeps the field (V44 says it clones the whole object).
- Existing campaigns have no `formatId`; that is normal (untemplated ring).
- `ringsRunningFormat` expects the full rings list, including others' rings only if V46 supplies them; locally it only sees this browser's rings.

## Left out on purpose
`app.js`, `index.html`, `style.css` (no new styles; existing tokens and classes only, so `.format-*` classes are unstyled until V48), `campaign.mjs`, `nostr.mjs`, version bump (coordinator bumps on merge), publishing `formatId` over Nostr.

## Manual check (DOM)
Serve the repo. Home: the rings section reads "My Rings" with the link to Campaigns. Mount discovery with `formats` and confirm rows and DEMO badges, and that clicking a row calls `navigateFormat`. Mount a format and confirm example links open in a new load and unsafe URLs never render.
