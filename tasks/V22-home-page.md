# V22 — Home dashboard + campaign page

Scope: the two main views. Home = your game dashboard. Campaign page = whole ring + join.
Files owned: `src/home.mjs`, `src/campaign-page.mjs`, `tests/v22-home.test.mjs`
Status: claimed
Branch: `task/V22-home-page`

## Frozen contract
- Campaign shape is defined in `tasks/V21-campaign-core.md` (same shape; do not redefine it — import nothing from V21's files, they are on another branch; work against the documented shape and duplicate the tiny pure helpers you need, e.g. postedCount, and note the duplication in your report for integration to dedupe).
- Store shape: game in `cabal.v2.game`, campaigns in `cabal.v2.campaigns`, me in `cabal.v2.me`, demo flag `cabal.v2.demo`. In the browser read via `localStorage` directly with try/catch (the V21 store module will replace these reads at integration); in tests use plain objects.
- `mount(rootEl, ctx)` signature for both modules. `ctx = { store, navigate(view, params), campaign }` where `store = { game, campaigns, me, saveGame, saveCampaigns, saveMe }` (plain object with functions the shell provides), `navigate` switches view, `campaign` is the campaign to render (campaign page only).

## `src/home.mjs`
- If no game saved: first-open setup — one question ("What's your game?"), fields name + store links (Steam, itch) + tags (comma-separated) + X handle. Save via ctx.store.saveGame, then re-render as dashboard.
- Dashboard: game name + links at top; live campaign under it (title, anchor post text + author, window, who's posted X/Y); "your turn" list = campaigns where me is a pending member, each with a button to open the quote composer; "your rings" = my campaigns; prominent "Start a campaign" button (navigates to campaign creation — for now a simple form: title, anchor post URL/text/author/platform, window dates; creates via the campaign shape and saves).
- Every DEMO campaign (campaign.demo === true) shows a visible `DEMO` badge.

## `src/campaign-page.mjs`
- Renders the game, the anchor post (text, author, platform, link to the original), and the WHOLE ring: every member with posted/pending state and quote-post link when posted. Join button: prompts for name + handle (prefill from ctx.store.me), adds the member, saves, re-renders. Join is local only — no server, no approval queue.

## Acceptance
- `tests/v22-home.test.mjs` covers pure helpers: yourTurn(campaigns, me), liveCampaign(campaigns, now), ringSummary(campaign), setup validation (name required, at least one store link).
- `npm test` green on the branch. Do NOT touch index.html, app.js, style.css, tasks/INDEX.md, or any other track's files. Do NOT merge. Push the branch and report: branch, files, test count, mount(ctx) contract as built, anything duplicated from V21 for integration to dedupe.
