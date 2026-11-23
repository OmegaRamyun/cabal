# V23 — Composer fed by the campaign

Scope: quote-post drafts with the original attached, similarity-gate warnings live.
Files owned: `src/quote-composer.mjs`, `tests/v23-quote-composer.test.mjs`
Status: open
Branch: `task/V23-quote-composer`

## Frozen contract
- Campaign shape is defined in `tasks/V21-campaign-core.md` (same shape; do not redefine it).
- Similarity gate: `src/similarity.mjs` already exists on main. Import `gate(draft, others)` from it — READ-ONLY, do not edit similarity.mjs. `gate` returns a verdict: pass / review / warn. Warnings only, NEVER a block: the "Open in X / Bluesky" link stays enabled at every verdict.
- Intent links: import `buildIntent(platform, { text, url })` from `src/intents.mjs` — READ-ONLY, do not edit it. It builds the platform composer URL; the human taps Post in the platform's own composer.
- `mount(rootEl, ctx)` where `ctx = { campaign, me, onPosted(quoteUrl) }`.

## Behaviour
- Shows the original anchor post attached at the top (author, text, link).
- One textarea for my quote-post draft. As I type, score it with `gate(draft, [anchorText, ...otherMembersDrafts])` and show a password-meter style warning ("This post is very similar!" / "Looks like your own words.") — advisory only.
- "Open in X" / "Open in Bluesky" buttons built with buildIntent using my draft text + the anchor post URL. After opening, a "I posted it" button calls ctx.onPosted with the quote URL (prompt for the URL, optional) so the ring can mark me posted.
- Never auto-posts, never writes copy for the user. The textarea starts empty.

## Acceptance
- `tests/v23-quote-composer.test.mjs` covers: gate wiring (near-dup of anchor -> warn, own words -> pass), intent URL contains the anchor URL, onPosted callback shape.
- `npm test` green on the branch. Do NOT touch index.html, app.js, style.css, tasks/INDEX.md, similarity.mjs, intents.mjs, or any other track's files. Do NOT merge. Push the branch and report: branch, files, test count, mount(ctx) contract as built.
